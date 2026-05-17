# Stage 1: build TypeScript
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build -- --noEmit false
# Copy static public files into dist (tsc doesn't copy non-TS files)
RUN cp -r src/web/public dist/web/public

# Stage 2: runtime
FROM node:20-alpine AS runtime
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
RUN mkdir -p /app/data
VOLUME ["/app/data"]
ENV PORT=3000
ENV DB_PATH=/app/data/db.sqlite
EXPOSE 3000
CMD ["node", "dist/index.js"]
