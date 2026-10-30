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
RUN chmod 0755 /usr/local/bin/entrypoint.sh

USER streamer
ENV DASHBOARD_URL=http://dashboard:8080/ \
    WIDTH=1920 \
    HEIGHT=1080 \
    FPS=30 \
    VIDEO_BITRATE=4500k \
    BUFSIZE=9000k \
    AUDIO_BITRATE=128k \
    PRESET=veryfast \
    BROWSER_RESTART_HOURS=24

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
