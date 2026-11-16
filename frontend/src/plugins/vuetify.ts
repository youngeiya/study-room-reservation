import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg'
import { ko } from 'vuetify/locale'

// Material Design 기반 UI 라이브러리(Vuetify). React 의 MUI 와 같은 디자인 시스템을 Vue 용으로 만든 것이다.
// 아이콘은 글꼴 파일 대신 SVG 경로(@mdi/js)를 써서 외부 요청 없이 동작한다.
//
// 모양은 시대인재 홈페이지에 맞춘다: 흰 배경 + 검정 포인트, 모서리는 작게, 그림자 없이 가는 선.
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
          primary: '#111111', // 검정 (버튼·강조)
          secondary: '#6B6B6B',
          background: '#FFFFFF',
          surface: '#FFFFFF',
          // 상태 색은 의미 전달을 위해 남기되 채도를 낮췄다
          success: '#2E7D32',
          warning: '#E08600',
          error: '#C62828',
          info: '#111111',
        },
      },
    },
  },
  defaults: {
    VCard: { rounded: 'md', elevation: 0 },
    VBtn: { rounded: 'sm', elevation: 0 },
    VChip: { rounded: 'sm' },
    VTextField: { variant: 'outlined', density: 'comfortable', rounded: 'sm' },
    VSelect: { variant: 'outlined', density: 'comfortable', rounded: 'sm' },
    VTextarea: { variant: 'outlined', rounded: 'sm' },
  },
})
