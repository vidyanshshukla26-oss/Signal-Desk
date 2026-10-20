FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY src ./src
COPY public ./public
COPY scripts ./scripts

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV SIGNALDESK_DATA_FILE=/app/data/signaldesk.json

RUN mkdir -p /app/data && chown -R node:node /app
USER node

VOLUME ["/app/data"]
EXPOSE 3000
CMD ["npm", "start"]
