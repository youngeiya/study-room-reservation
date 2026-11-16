import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), vueDevTools()],
  resolve: {
    // 같은 라이브러리가 번들에 두 벌 들어가지 않게 한다 (pinia 가 두 벌이면 스토어를 찾지 못한다)
    dedupe: ['vue', 'pinia', 'vue-router'],
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // 백엔드(NestJS, 3000번 포트)에는 CORS 설정이 없으므로 개발 서버가 /api 요청을 대신 전달한다.
    // 브라우저는 같은 출처(5173)로만 요청하므로 CORS 문제가 생기지 않는다.
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
