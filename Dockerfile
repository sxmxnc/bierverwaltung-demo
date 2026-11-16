FROM node:22-alpine AS frontend
WORKDIR /build
COPY client/package*.json ./
RUN npm ci --include=dev
COPY client/ ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app/api-server
COPY api-server/package*.json ./
RUN npm ci --omit=dev
COPY api-server/config.json api-server/init.sql ./
COPY api-server/src ./src
COPY --from=frontend /build/dist /app/client/dist
EXPOSE 3000
CMD ["npm", "run", "serve"]
