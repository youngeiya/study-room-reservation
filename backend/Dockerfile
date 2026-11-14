# ---- 1단계: 빌드 (TypeScript -> dist) ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- 2단계: 실행 (운영 의존성 + dist 만 담는다) ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DB_FILE=/app/data/db.json
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# JSON DB 가 저장되는 위치. compose 에서 볼륨을 붙여 컨테이너를 지워도 데이터가 남는다.
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
EXPOSE 3000
CMD ["node", "dist/main"]
