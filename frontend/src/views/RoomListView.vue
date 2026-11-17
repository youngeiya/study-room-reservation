<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { mdiCalendarRange, mdiClockOutline, mdiDelete, mdiMapMarkerOutline, mdiPlus } from '@mdi/js'
import { api } from '@/api'
import type { BranchCode, RoomPayload, StudyRoom } from '@/api/types'
import RoomForm from '@/components/RoomForm.vue'
import RoomImage from '@/components/RoomImage.vue'
import { BRANCHES } from '@/config/academy'
import { useAction } from '@/composables/useAction'
import { useRouteNames } from '@/composables/useRouteNames'
import { useSessionStore } from '@/stores/session'
import { formatDateTime } from '@/utils/datetime'
import { isOpenNow } from '@/utils/openingHours'
import { isFull, occupancyColor, occupancyPercent } from '@/utils/room'

// 자습실 목록: 지점(H관·S관·목동·반포)별로 나눠서 보여 준다. 강사는 같은 화면에서 지점별로 등록·삭제한다.
const session = useSessionStore()
const names = useRouteNames()
const { error, busy, run } = useAction()

const rooms = ref<StudyRoom[]>([])
const showForm = ref(false)

// 선택한 탭: 'ALL' 이면 모든 지점을 지점별 구역으로 나눠 보여 주고, 지점 코드면 그 지점만 보여 준다
const tab = ref<'ALL' | BranchCode>('ALL')

const groups = computed(() =>
  BRANCHES.map((branch) => ({
    branch,
    rooms: rooms.value.filter((r) => (r.branch ?? 'H') === branch.code),
    open: isOpenNow(branch),
  })),
)
// 지금 화면에 보여 줄 구역: 전체 탭이면 자습실이 있는 지점만, 지점 탭이면 그 지점(비어 있어도)
const visibleGroups = computed(() =>
  tab.value === 'ALL'
    ? groups.value.filter((g) => g.rooms.length > 0)
    : groups.value.filter((g) => g.branch.code === tab.value),
)
// 지점 탭에서 "자습실 등록"을 누르면 그 지점이 미리 선택되어 있다
const defaultBranch = computed(() => (tab.value === 'ALL' ? null : tab.value))

async function load() {
  const list = await run(() => api.listRooms())
  if (list) rooms.value = list
}

// FR-ROM-02: 자습실 등록
async function create(payload: RoomPayload) {
  const created = await run(() => api.createRoom(payload))
  if (created) {
    showForm.value = false
    await load()
  }
}

// FR-ROM-05: 자습실 삭제 (Soft Delete — 서버가 deletedAt 만 기록한다)
async function remove(room: StudyRoom) {
  if (!confirm(`'${room.name}' 자습실을 삭제할까요?`)) return
  const done = await run(async () => {
    await api.deleteRoom(room.id)
    return true
  })
  if (done) await load()
}

onMounted(load)
</script>

<template>
  <div class="d-flex align-center mb-4">
    <h1 class="text-h5">자습실 목록</h1>
    <v-spacer />
    <v-btn
      v-if="session.isInstructor"
      color="primary"
      :prepend-icon="mdiPlus"
      @click="showForm = true"
    >
      자습실 등록
    </v-btn>
  </div>

  <v-alert v-if="error" type="error" variant="tonal" class="mb-4">{{ error }}</v-alert>

  <v-dialog v-model="showForm" max-width="600">
    <v-card title="자습실 등록">
      <v-card-text>
        <RoomForm
          submit-label="등록"
          :default-branch="defaultBranch"
          :busy="busy"
          @submit="create"
        />
      </v-card-text>
    </v-card>
  </v-dialog>

  <!-- 지점 탭: 전체 + 지점별 (자습실 수 표시) -->
  <v-tabs v-model="tab" color="primary" show-arrows class="mb-6 branch-tabs">
    <v-tab value="ALL">
      전체
      <v-chip size="x-small" class="ms-2" variant="tonal">{{ rooms.length }}</v-chip>
    </v-tab>
    <v-tab v-for="g in groups" :key="g.branch.code" :value="g.branch.code">
      {{ g.branch.short }}
      <v-chip size="x-small" class="ms-2" variant="tonal">{{ g.rooms.length }}</v-chip>
    </v-tab>
  </v-tabs>

  <v-alert v-if="rooms.length === 0" type="info" variant="tonal">등록된 자습실이 없습니다.</v-alert>

  <section v-for="g in visibleGroups" :key="g.branch.code" class="mb-8">
    <!-- 지점 머리말: 이름·주소·운영 시간 -->
    <div class="d-flex align-start flex-wrap mb-3">
      <div class="me-4">
        <div class="d-flex align-center">
          <h2 class="branch-title">{{ g.branch.short }}</h2>
          <v-chip
            v-if="g.open !== null"
            :color="g.open ? 'success' : 'grey'"
            size="x-small"
            variant="tonal"
            class="ms-2"
          >
            {{ g.open ? '운영 중' : '운영 종료' }}
          </v-chip>
        </div>
        <div class="text-body-2 text-medium-emphasis">{{ g.branch.name }}</div>
      </div>
      <div class="text-body-2 text-medium-emphasis">
        <div>
          <v-icon :icon="mdiMapMarkerOutline" size="16" class="me-1" />{{ g.branch.address }}
          <span v-if="g.branch.detail"> · {{ g.branch.detail }}</span>
        </div>
        <div>
          <v-icon :icon="mdiClockOutline" size="16" class="me-1" />
          {{ g.branch.hours ? `매일 ${g.branch.hours}` : '운영 시간은 지점에 문의' }}
        </div>
      </div>
    </div>

    <v-alert v-if="g.rooms.length === 0" type="info" variant="tonal" density="compact">
      이 지점에는 등록된 자습실이 없습니다.
      <template v-if="session.isInstructor">위의 '자습실 등록'으로 추가해 보세요.</template>
    </v-alert>

    <v-row v-else>
      <v-col v-for="room in g.rooms" :key="room.id" cols="12" sm="6" lg="4">
        <v-card height="100%" class="d-flex flex-column">
          <RoomImage :room="room" :height="160" />
          <v-card-item>
            <template #title>
              <div class="font-weight-bold text-wrap" style="word-break: keep-all">
                {{ room.name }}
              </div>
            </template>
            <template #append>
              <v-chip v-if="isFull(room)" color="error" size="small" variant="flat">마감</v-chip>
              <v-chip v-else color="success" size="small" variant="flat">신청 가능</v-chip>
            </template>
          </v-card-item>

          <v-card-text class="flex-grow-1">
            <div class="d-flex align-center text-body-2 text-medium-emphasis mb-3">
              <v-icon :icon="mdiCalendarRange" size="18" class="me-1" />
              <span>{{ formatDateTime(room.startDate) }} ~ {{ formatDateTime(room.endDate) }}</span>
            </div>

            <div class="d-flex justify-space-between text-body-2 mb-1">
              <span>신청 인원</span>
              <strong>{{ room.currentCount }} / {{ room.maxPersonnel }}명</strong>
            </div>
            <v-progress-linear
              :model-value="occupancyPercent(room)"
              :color="occupancyColor(room)"
              height="10"
              rounded
            />
          </v-card-text>

          <v-card-actions>
            <v-btn
              color="primary"
              variant="tonal"
              :to="{ name: names.roomDetail, params: { id: room.id } }"
            >
              상세 보기
            </v-btn>
            <v-spacer />
            <v-btn
              v-if="session.isInstructor"
              color="error"
              variant="text"
              :prepend-icon="mdiDelete"
              :disabled="busy"
              @click="remove(room)"
            >
              삭제
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
  </section>
</template>

<style scoped>
.branch-title {
  font-size: 1.35rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}
</style>
