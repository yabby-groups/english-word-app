FROM node:22-bookworm-slim AS voicechat-build

WORKDIR /app/voicechat

COPY voicechat/package.json voicechat/package-lock.json ./
RUN npm ci

COPY voicechat/ ./
RUN npm run build


FROM node:22-bookworm-slim

ARG PIPER_VERSION=1.2.0

RUN set -eux; \
    test "$(dpkg --print-architecture)" = "amd64"; \
    apt-get update; \
    apt-get install --no-install-recommends -y ca-certificates curl libstdc++6; \
    rm -rf /var/lib/apt/lists/*; \
    mkdir -p /opt/piper /opt/piper/voices; \
    curl --fail --location --retry 3 \
      "https://github.com/rhasspy/piper/releases/download/v${PIPER_VERSION}/piper_amd64.tar.gz" \
      -o /tmp/piper.tar.gz; \
    tar -xzf /tmp/piper.tar.gz --strip-components=1 -C /opt/piper; \
    rm /tmp/piper.tar.gz; \
    curl --fail --location --retry 3 \
      "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx" \
      -o /opt/piper/voices/en_US-lessac-medium.onnx; \
    curl --fail --location --retry 3 \
      "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json" \
      -o /opt/piper/voices/en_US-lessac-medium.onnx.json; \
    curl --fail --location --retry 3 \
      "https://huggingface.co/rhasspy/piper-voices/resolve/main/zh/zh_CN/huayan/medium/zh_CN-huayan-medium.onnx" \
      -o /opt/piper/voices/zh_CN-huayan-medium.onnx; \
    curl --fail --location --retry 3 \
      "https://huggingface.co/rhasspy/piper-voices/resolve/main/zh/zh_CN/huayan/medium/zh_CN-huayan-medium.onnx.json" \
      -o /opt/piper/voices/zh_CN-huayan-medium.onnx.json

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY voicechat/package.json voicechat/package-lock.json ./voicechat/
RUN npm ci --omit=dev --prefix ./voicechat

COPY --chown=node:node . ./
COPY --from=voicechat-build --chown=node:node /app/voicechat/dist ./voicechat/dist

RUN mkdir -p audio .tmp logs file-storage/local file-storage/cloud && chown -R node:node audio .tmp logs file-storage

ENV PORT=5182 \
    HOST=0.0.0.0 \
    PIPER_BIN=/opt/piper/piper \
    PIPER_VOICE_EN=/opt/piper/voices/en_US-lessac-medium.onnx \
    PIPER_CONFIG_EN=/opt/piper/voices/en_US-lessac-medium.onnx.json \
    PIPER_VOICE_ZH=/opt/piper/voices/zh_CN-huayan-medium.onnx \
    PIPER_CONFIG_ZH=/opt/piper/voices/zh_CN-huayan-medium.onnx.json

USER node

EXPOSE 5182
VOLUME ["/app/audio", "/app/.tmp", "/app/logs", "/app/file-storage"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD ["node", "-e", "const http=require('http');const port=process.env.PORT||5182;const request=http.get(`http://127.0.0.1:${port}/`,response=>process.exit(response.statusCode===200?0:1));request.on('error',()=>process.exit(1));request.setTimeout(4000,()=>request.destroy());"]

CMD ["node", "server.js"]
