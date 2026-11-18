FROM node:24.11.1-bookworm-slim
WORKDIR /app
COPY --chown=node:node package.json package-lock.json server.mjs ./
COPY --chown=node:node lib ./lib
COPY --chown=node:node web ./web
COPY --chown=node:node data ./data
COPY --chown=node:node docs/verification/task06-research.json docs/verification/task06-final-acceptance.json ./docs/verification/
RUN mkdir -p /app/state && chown node:node /app/state
USER node
ENV NODE_ENV=production STATE_DIR=/app/state
VOLUME /app/state
CMD ["node", "server.mjs", "--production"]
