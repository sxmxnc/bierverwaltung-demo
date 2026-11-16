FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src/ ./src/
COPY config.json init.sql ./

EXPOSE 3000

CMD ["node", "--no-warnings", "--import", "tsx", "src/app.ts"]
