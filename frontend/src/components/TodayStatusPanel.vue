<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { mdiChartBox, mdiRefresh } from '@mdi/js'
import { api } from '@/api'
import type { StudyRoom } from '@/api/types'
import { occupancyColor, occupancyPercent } from '@/utils/room'

// 사이드바의 "오늘의 현황" 패널: 자습실별 신청 현황을 한눈에 보여 준다 (강사·학생 모두).
// 화면이 열릴 때와 30초마다 서버에서 다시 불러온다. 판단은 서버 값(currentCount)을 그대로 보여 줄 뿐이다.
const rooms = ref<StudyRoom[]>([])
const loading = ref(true)
const failed = ref(false)
const MAX_ROWS = 5

const shown = computed(() => rooms.value.filter((r) => r.deletedAt === null).slice(0, MAX_ROWS))
const total = computed(() =>
  rooms.value.filter((r) => r.deletedAt === null).reduce((sum, r) => sum + r.currentCount, 0),
)
const hiddenCount = computed(
  () => rooms.value.filter((r) => r.deletedAt === null).length - shown.value.length,
)

async function load() {
  loading.value = true
  try {
    rooms.value = await api.listRooms()
    failed.value = false
  } catch {
    failed.value = true // 패널이 실패해도 화면의 다른 기능에는 영향이 없다
  } finally {
    loading.value = false
  }
}

let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  void load()
  timer = setInterval(() => void load(), 30_000)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <section class="status-panel">
    <div class="d-flex align-center mb-3">
      <span class="status-icon me-3"><v-icon :icon="mdiChartBox" size="20" /></span>
      <div class="flex-grow-1">
        <div class="status-title">오늘의 현황</div>
        <div class="status-sub">자습실별 신청 인원</div>
      </div>
      <v-btn
        :icon="mdiRefresh"
        size="x-small"
        variant="text"
        :loading="loading"
        aria-label="새로고침"
        @click="load"
      />
    </div>

    <div v-if="failed" class="text-caption text-medium-emphasis">현황을 불러오지 못했어요.</div>
    <div v-else-if="!loading && shown.length === 0" class="text-caption text-medium-emphasis">
      등록된 자습실이 없어요.
    </div>
    <template v-else>
      <div v-for="room in shown" :key="room.id" class="mb-3">
        <div class="d-flex justify-space-between align-baseline">
          <span class="room-name">{{ room.name }}</span>
          <span class="room-count">{{ room.currentCount }}/{{ room.maxPersonnel }}</span>
        </div>
        <v-progress-linear
          :model-value="occupancyPercent(room)"
          :color="occupancyColor(room)"
          bg-color="grey-lighten-2"
          height="5"
          rounded
          class="mt-1"
        />
      </div>
      <div v-if="hiddenCount > 0" class="text-caption text-medium-emphasis mb-2">
        외 {{ hiddenCount }}곳
      </div>
      <div class="status-total">
        현재 신청 <strong>{{ total }}명</strong>
      </div>
    </template>
  </section>
</template>

<style scoped>
.status-panel {
  margin: 8px 12px;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #fafafa;
}
.status-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: #111;
  color: #fff;
  flex: none;
}
.status-title {
  font-weight: 700;
  font-size: 1rem;
  letter-spacing: -0.02em;
  line-height: 1.2;
}
.status-sub {
  font-size: 0.75rem;
  color: var(--muted);
}
.room-name {
  font-size: 0.82rem;
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.room-count {
  font-size: 0.8rem;
  font-weight: 600;
}
.status-total {
  margin-top: 4px;
  padding-top: 10px;
  border-top: 1px dashed var(--line);
  font-size: 0.82rem;
  color: #555;
}
</style>
