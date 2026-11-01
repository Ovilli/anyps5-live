# Single-container image: the dashboard and the streamer in one container, for platforms that
# build one Dockerfile and run one service. docker-compose.yml runs them as two containers instead.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY dashboard/package.json dashboard/package-lock.json dashboard/tsconfig.json ./
RUN npm ci --no-audit --no-fund
COPY dashboard/src ./src
RUN npx tsc -p tsconfig.json

FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      chromium xvfb x11-utils ffmpeg \
      fonts-inter fonts-noto-color-emoji fonts-dejavu-core \
      ca-certificates curl tini \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY dashboard/package.json dashboard/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
COPY dashboard/public ./public
COPY dashboard/proto ./proto
COPY streamer/entrypoint.sh /usr/local/bin/streamer.sh
COPY streamer/shorts.sh /usr/local/bin/shorts.sh
COPY start.sh /usr/local/bin/start.sh
RUN chmod 0755 /usr/local/bin/streamer.sh /usr/local/bin/shorts.sh /usr/local/bin/start.sh \
 && mkdir -p /data /music /recordings \
 && chown node:node /data /recordings

ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=3000 \
    WIDTH=2560 \
    HEIGHT=1440 \
    FPS=30 \
    CAPTURE_FPS=30 \
    VIDEO_BITRATE=12000k \
    BUFSIZE=24000k \
    AUDIO_BITRATE=128k \
    PRESET=superfast \
    BROWSER_RESTART_HOURS=24

VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/healthz" >/dev/null || exit 1
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/start.sh"]
