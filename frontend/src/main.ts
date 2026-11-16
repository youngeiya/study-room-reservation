import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { onUnauthorized } from './api/token'
import { useSessionStore } from './stores/session'
import vuetify from './plugins/vuetify'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(vuetify)

// 서버가 "로그인이 필요하다/토큰이 만료됐다"(401)고 하면 로그아웃하고 로그인 화면으로 보낸다
onUnauthorized(() => {
  useSessionStore().logout()
  router.replace({ name: 'login' })
})

app.mount('#app')
