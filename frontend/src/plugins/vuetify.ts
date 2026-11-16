import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg'
import { ko } from 'vuetify/locale'

// Material Design 기반 UI 라이브러리(Vuetify). React 의 MUI 와 같은 디자인 시스템을 Vue 용으로 만든 것이다.
// 아이콘은 글꼴 파일 대신 SVG 경로(@mdi/js)를 써서 외부 요청 없이 동작한다.
export default createVuetify({
  components,
  directives,
  locale: { locale: 'ko', fallback: 'en', messages: { ko } },
  icons: { defaultSet: 'mdi', aliases, sets: { mdi } },
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        colors: {
          primary: '#4338CA', // 인디고
          secondary: '#0F766E',
          background: '#F4F5F9',
        },
      },
    },
  },
  defaults: {
    VCard: { rounded: 'lg' },
    VBtn: { rounded: 'lg' },
    VTextField: { variant: 'outlined', density: 'comfortable' },
    VSelect: { variant: 'outlined', density: 'comfortable' },
  },
})
