<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { mdiCalendarCheck, mdiClockOutline, mdiInformationOutline } from '@mdi/js'
import { api } from '@/api'
import type { VisitView } from '@/api/types'
import { BRANCHES } from '@/config/academy'
import { useSessionStore } from '@/stores/session'
import { useStatusStore } from '@/stores/status'
import { isOpenNow } from '@/utils/openingHours'

// 상단바 우측 현황: 지금 운영 여부, 개인 현황(학생: 다음 방문 / 강사: 오늘 신청 인원), 이용 안내 열기.
// 운영 여부는 1분마다, 개인 현황은 1분마다 + 신청·수정·취소가 있을 때(status 스토어 신호) 다시 계산한다.
const emit = defineEmits<{ openInfo: [] }>()
const session = useSessionStore()
const status = useStatusStore()

// ── 운영 상태 ──
const now = ref(new Date())
const openCount = computed(() => BRANCHES.filter((b) => isOpenNow(b, now.value) === true).length)
const hasHours = BRANCHES.some((b) => b.hours !== null)

// ── 개인 현황 ──
const nextVisit = ref<VisitView | null>(null) // 학생: 다음 방문
const todayCount = ref<number | null>(null) // 강사: 오늘 신청 인원

async function loadPersonal() {
  try {
    if (session.studentId !== null) {
      const list = await api.listStudentVisits(session.studentId)
      const nowIso = new Date().toISOString()
      nextVisit.value =
        list
          .filter((v) => v.status === 'ACTIVE' && v.visitAt >= nowIso)
          .sort((a, b) => a.visitAt.localeCompare(b.visitAt))[0] ?? null
    } else if (session.isInstructor) {
      todayCount.value = (await api.getVisitSummary()).todayCount
    }
  } catch {
    // 상단바의 보조 정보라서 실패해도 화면의 다른 기능에는 영향이 없다 (그냥 표시하지 않는다)
    nextVisit.value = null
    todayCount.value = null
  }
}

// "11/18(수) 14:00" 형식 (한국 시간)
const visitLabel = computed(() => {
  if (!nextVisit.value) return ''
  const d = new Date(nextVisit.value.visitAt)
  const date = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).format(d)
  const time = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
  return `${date} ${time}${nextVisit.value.roomName ? ` · ${nextVisit.value.roomName}` : ''}`
})

let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  void loadPersonal()
  timer = setInterval(() => {
    now.value = new Date()
    void loadPersonal()
  }, 60_000)
})
onBeforeUnmount(() => clearInterval(timer))
watch(() => status.version, loadPersonal)
</script>

<template>
  <div class="header-status d-flex align-center ga-2">
    <!-- 운영 상태: 누르면 지점별 운영 시간(이용 안내)을 연다 -->
    <v-chip
      v-if="hasHours"
      :color="openCount > 0 ? 'success' : 'grey'"
      variant="tonal"
      size="small"
      :prepend-icon="mdiClockOutline"
      @click="emit('openInfo')"
    >
      {{ openCount > 0 ? `운영 중 · ${openCount}개 지점` : '운영 종료' }}
    </v-chip>

    <!-- 학생: 다음 방문 -->
    <v-chip
      v-if="session.studentId !== null"
      variant="outlined"
      size="small"
      :prepend-icon="mdiCalendarCheck"
      :to="{ name: 'student-my-visits' }"
    >
      {{ nextVisit ? `다음 방문 ${visitLabel}` : '예정된 방문 없음' }}
    </v-chip>

    <!-- 강사: 오늘 신청 인원 -->
    <v-chip
      v-else-if="session.isInstructor && todayCount !== null"
      variant="outlined"
      size="small"
      :prepend-icon="mdiCalendarCheck"
    >
      오늘 방문 신청 {{ todayCount }}명
    </v-chip>

    <v-btn
      variant="text"
      size="small"
      :prepend-icon="mdiInformationOutline"
      class="info-btn"
      @click="emit('openInfo')"
    >
      이용 안내 · 오시는 길
    </v-btn>
  </div>
</template>

<style scoped>
.header-status :deep(.v-chip) {
  font-weight: 500;
}
</style>
