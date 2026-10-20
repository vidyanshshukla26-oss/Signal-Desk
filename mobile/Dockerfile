FROM node:20.19.4-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund

COPY . .
RUN npm test

ENV EXPO_NO_TELEMETRY=1
EXPOSE 8081 19000 19001 19002

CMD ["npx", "expo", "start", "--lan"]
