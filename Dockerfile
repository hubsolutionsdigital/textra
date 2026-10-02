# Production image for the review portal: builds the web app, then runs one Node process
# that serves the API, the web app and uploaded prototypes.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY package.json ./
# Database, uploads and the encryption key live in /data. Attach a persistent volume there
# from your host's dashboard (no VOLUME instruction: Railway rejects Dockerfiles that use it).
RUN mkdir -p /data
EXPOSE 3000
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
