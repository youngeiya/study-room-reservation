<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { mdiCalendarRange, mdiDelete, mdiPlus } from '@mdi/js'
import { api } from '@/api'
import type { RoomPayload, StudyRoom } from '@/api/types'
import RoomForm from '@/components/RoomForm.vue'
import { useAction } from '@/composables/useAction'
import { useSessionStore } from '@/stores/session'
import { formatDateTime } from '@/utils/datetime'
import { isFull, occupancyColor, occupancyPercent } from '@/utils/room'

const session = useSessionStore()
const { error, busy, run } = useAction()

const rooms = ref<StudyRoom[]>([])
const showForm = ref(false)

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
    <h1 class="text-h5 font-weight-bold">자습실 목록</h1>
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
        <RoomForm submit-label="등록" :busy="busy" @submit="create" />
      </v-card-text>
    </v-card>
  </v-dialog>

  <v-alert v-if="rooms.length === 0" type="info" variant="tonal">등록된 자습실이 없습니다.</v-alert>

  <v-row v-else>
    <v-col v-for="room in rooms" :key="room.id" cols="12" sm="6" lg="4">
      <v-card height="100%" class="d-flex flex-column">
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
            :to="{ name: 'room-detail', params: { id: room.id } }"
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
</template>
