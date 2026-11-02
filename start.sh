#!/bin/bash
# Single-container mode: runs the dashboard and the streamer side by side. The container stops
# when either of them stops, so the restart policy brings both back.
set -euo pipefail

if [ "$(id -u)" = 0 ]; then
  # A bind-mounted data folder is created by Docker as root: hand it to the node user first.
  mkdir -p "$DATA_DIR" /recordings
  chown node:node "$DATA_DIR" /recordings
  export HOME=/home/node USER=node
  exec setpriv --reuid=node --regid=node --init-groups "$0" "$@"
fi

export DASHBOARD_URL="http://127.0.0.1:${PORT}/"
/usr/local/bin/dashboard &

if [ -z "${YOUTUBE_STREAM_KEY:-}" ] && [ -z "${OUTPUT:-}" ]; then
  echo "[start] YOUTUBE_STREAM_KEY is not set: serving the dashboard only, nothing is streamed."
  wait
  exit
fi

/usr/local/bin/streamer.sh &
wait -n
