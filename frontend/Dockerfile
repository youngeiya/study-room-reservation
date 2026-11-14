# ---- 1단계: 빌드 (Vue -> 정적 파일) ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build-only

# ---- 2단계: nginx 로 정적 파일 서빙 + /api 를 백엔드로 전달 ----
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
