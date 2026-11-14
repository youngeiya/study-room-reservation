<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { api } from '@/api'
import type { RoomPayload, StudyRoom } from '@/api/types'
import RoomForm from '@/components/RoomForm.vue'
import { useAction } from '@/composables/useAction'
import { useSessionStore } from '@/stores/session'
import { formatDateTime } from '@/utils/datetime'

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
  <section class="panel">
    <div class="row" style="justify-content: space-between">
      <h1>자습실 목록</h1>
      <button v-if="session.isInstructor" @click="showForm = !showForm">
        {{ showForm ? '닫기' : '자습실 등록' }}
      </button>
    </div>

    <p v-if="error" class="error">{{ error }}</p>

    <div v-if="showForm" class="panel">
      <h2>자습실 등록</h2>
      <RoomForm submit-label="등록" :busy="busy" @submit="create" />
    </div>

    <p v-if="rooms.length === 0" class="muted">등록된 자습실이 없습니다.</p>
    <table v-else>
      <thead>
        <tr>
          <th>이름</th>
          <th>운영 기간</th>
          <th>신청 / 최대</th>
          <th>상태</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="room in rooms" :key="room.id">
          <td>
            <RouterLink :to="{ name: 'room-detail', params: { id: room.id } }">
              {{ room.name }}
            </RouterLink>
          </td>
          <td>{{ formatDateTime(room.startDate) }} ~ {{ formatDateTime(room.endDate) }}</td>
          <td>{{ room.currentCount }} / {{ room.maxPersonnel }}</td>
          <td>
            <span v-if="room.currentCount >= room.maxPersonnel" class="badge full">마감</span>
            <span v-else class="badge ok">신청 가능</span>
          </td>
          <td>
            <button
              v-if="session.isInstructor"
              class="danger"
              :disabled="busy"
              @click="remove(room)"
            >
              삭제
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
