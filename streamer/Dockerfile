FROM debian:bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      chromium xvfb x11-utils ffmpeg \
      fonts-inter fonts-noto-color-emoji fonts-dejavu-core \
      ca-certificates curl tini \
 && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --uid 1000 streamer \
 && mkdir -p /music /recordings \
 && chown streamer:streamer /recordings

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
COPY shorts.sh /usr/local/bin/shorts.sh
RUN chmod 0755 /usr/local/bin/entrypoint.sh /usr/local/bin/shorts.sh

USER streamer
ENV DASHBOARD_URL=http://dashboard:8080/ \
    WIDTH=2560 \
    HEIGHT=1440 \
    FPS=30 \
    CAPTURE_FPS=30 \
    VIDEO_BITRATE=12000k \
    BUFSIZE=24000k \
    AUDIO_BITRATE=128k \
    PRESET=superfast \
    BROWSER_RESTART_HOURS=24

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
