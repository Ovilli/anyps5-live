#!/bin/bash
# Renders the dashboard in a headless Chromium on a virtual display and streams it with ffmpeg.
set -euo pipefail

log() { echo "[streamer] $(date -u +%H:%M:%S) $*"; }

if [ -z "${OUTPUT:-}" ]; then
  if [ -z "${YOUTUBE_STREAM_KEY:-}" ]; then
    log "Set YOUTUBE_STREAM_KEY, or OUTPUT to a file path or another RTMP URL."
    exit 1
  fi
  OUTPUT="${YOUTUBE_RTMP_URL:-rtmp://a.rtmp.youtube.com/live2}/${YOUTUBE_STREAM_KEY}"
fi
case "$OUTPUT" in
  rtmp://*|rtmps://*) FORMAT=flv; TARGET="${OUTPUT%/*}/***" ;;
  *.mp4) FORMAT=mp4; TARGET="$OUTPUT" ;;
  *) FORMAT=flv; TARGET="$OUTPUT" ;;
esac

log "Waiting for the dashboard at ${DASHBOARD_URL}"
until curl -fsS "${DASHBOARD_URL%/}/healthz" >/dev/null 2>&1; do sleep 3; done

export DISPLAY=:99
Xvfb "$DISPLAY" -screen 0 "${WIDTH}x${HEIGHT}x24" -nolisten tcp -ac >/tmp/xvfb.log 2>&1 &
for _ in $(seq 1 50); do xdpyinfo >/dev/null 2>&1 && break; sleep 0.2; done

run_browser() {
  while true; do
    rm -rf /tmp/chromium
    chromium \
      --no-sandbox --no-first-run --noerrdialogs --disable-infobars --kiosk \
      --window-position=0,0 --window-size="${WIDTH},${HEIGHT}" --force-device-scale-factor=1 \
      --hide-scrollbars --disable-translate --disable-features=Translate,MediaRouter \
      --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows \
      --disable-dev-shm-usage --user-data-dir=/tmp/chromium \
      --app="$DASHBOARD_URL" >/tmp/chromium.log 2>&1 &
    browser=$!
    ( sleep $(( BROWSER_RESTART_HOURS * 3600 )); kill "$browser" 2>/dev/null ) &
    timer=$!
    wait "$browser" || true
    kill "$timer" 2>/dev/null || true
    log "Chromium stopped, restarting in 3 s"
    sleep 3
  done
}
run_browser &
sleep "${WARMUP_SECONDS:-15}"

shopt -s nullglob
tracks=(/music/*.mp3 /music/*.m4a /music/*.ogg /music/*.flac /music/*.wav)
if [ ${#tracks[@]} -gt 0 ]; then
  : > /tmp/playlist.txt
  for track in "${tracks[@]}"; do printf "file '%s'\n" "$track" >> /tmp/playlist.txt; done
  audio=(-stream_loop -1 -f concat -safe 0 -i /tmp/playlist.txt)
  log "Audio: ${#tracks[@]} track(s) from /music, looped"
else
  audio=(-f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100)
  log "Audio: silent track (add files to ./music for a soundtrack)"
fi

duration=()
[ -n "${RECORD_SECONDS:-}" ] && duration=(-t "$RECORD_SECONDS")
gop=$(( FPS * 2 ))

encode() {
  ffmpeg -hide_banner -loglevel warning -nostats -y \
    -thread_queue_size 512 -f x11grab -draw_mouse 0 -framerate "$FPS" -video_size "${WIDTH}x${HEIGHT}" -i "${DISPLAY}.0" \
    "${audio[@]}" \
    -map 0:v -map 1:a \
    -c:v libx264 -preset "$PRESET" -pix_fmt yuv420p \
    -b:v "$VIDEO_BITRATE" -maxrate "$VIDEO_BITRATE" -bufsize "$BUFSIZE" \
    -g "$gop" -keyint_min "$gop" -sc_threshold 0 \
    -c:a aac -b:a "$AUDIO_BITRATE" -ar 44100 -ac 2 \
    "${duration[@]}" -f "$FORMAT" "$OUTPUT"
}

log "Streaming ${WIDTH}x${HEIGHT} at ${FPS} fps, ${VIDEO_BITRATE} to ${TARGET}"
if [ ${#duration[@]} -gt 0 ]; then
  encode
  log "Recording finished: ${OUTPUT}"
  exit 0
fi
while true; do
  encode || true
  log "ffmpeg stopped, reconnecting in 5 s"
  sleep 5
done
