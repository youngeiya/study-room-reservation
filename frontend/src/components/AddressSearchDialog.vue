<script setup lang="ts">
import { ref } from 'vue'

// 카카오(다음) 우편번호 서비스 팝업. 승인키가 필요 없고, 브라우저가 카카오 스크립트를 불러와 검색한다.
// 데이터는 행정안전부 도로명주소 DB 기반이다.
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ select: [item: { zipCode: string; address: string }] }>()

const container = ref<HTMLElement | null>(null)
const loadError = ref('')

interface PostcodeData {
  zonecode: string
  roadAddress: string
  jibunAddress: string
  autoJibunAddress: string
  buildingName: string
  apartment: 'Y' | 'N'
}
declare global {
  interface Window {
    daum?: {
      Postcode: new (options: {
        oncomplete: (data: PostcodeData) => void
        width: string
        height: string
      }) => { embed: (el: HTMLElement) => void }
    }
  }
}

const SCRIPT_URL = 'https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js'
let loading: Promise<void> | null = null

// 스크립트는 처음 한 번만 불러온다
function loadScript(): Promise<void> {
  if (window.daum?.Postcode) return Promise.resolve()
  loading ??= new Promise<void>((resolve, reject) => {
    const el = document.createElement('script')
    el.src = SCRIPT_URL
    el.onload = () => resolve()
    el.onerror = () => {
      loading = null // 다음에 다시 시도할 수 있게
      reject(new Error('load failed'))
    }
    document.head.appendChild(el)
  })
  return loading
}

// 팝업이 다 열린 뒤에 검색 화면을 그 안에 끼워 넣는다
async function mountPostcode() {
  loadError.value = ''
  try {
    await loadScript()
  } catch {
    loadError.value = '주소 검색 서비스를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.'
    return
  }
  if (!container.value || !window.daum) return
  container.value.innerHTML = ''
  new window.daum.Postcode({
    oncomplete: (data) => {
      // 도로명주소가 없는 경우(지번 선택)에는 지번주소를 쓴다
      const base = data.roadAddress || data.jibunAddress || data.autoJibunAddress
      // 공동주택이면 건물명을 괄호로 덧붙인다 (예: ... 테헤란로 152 (강남파이낸스센터))
      const extra = data.buildingName && data.apartment === 'Y' ? ` (${data.buildingName})` : ''
      emit('select', { zipCode: data.zonecode, address: base + extra })
      open.value = false
    },
    width: '100%',
    height: '100%',
  }).embed(container.value)
}
</script>

<template>
  <v-dialog v-model="open" max-width="520" @after-enter="mountPostcode">
    <v-card title="주소 검색">
      <v-card-text>
        <v-alert v-if="loadError" type="error" variant="tonal" density="compact">
          {{ loadError }}
        </v-alert>
        <div ref="container" style="height: 460px"></div>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="open = false">닫기</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
