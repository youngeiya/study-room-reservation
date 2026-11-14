<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { api } from '@/api'
import type { VisitView } from '@/api/types'
import { useAction } from '@/composables/useAction'
import { useSessionStore } from '@/stores/session'
import { formatDateTime, isoToLocalInput, localInputToIso } from '@/utils/datetime'

// FR-VST-04: 학생 본인의 신청 목록 (취소된 신청도 상태와 함께 보여 준다)
const session = useSessionStore()
const { error, busy, run } = useAction()

const visits = ref<VisitView[]>([])
const editingId = ref<number | null>(null)
const editValue = ref('')

async function load() {
  if (session.studentId === null) return
  const list = await run(() => api.listStudentVisits(session.studentId!))
  if (list) visits.value = list
}

function startEdit(v: VisitView) {
  editingId.value = v.id
  editValue.value = isoToLocalInput(v.visitAt)
}

// FR-VST-02: 방문 시간 수정
async function saveEdit(v: VisitView) {
  const updated = await run(() =>
    api.updateVisit(v.id, { studentId: v.studentId, visitAt: localInputToIso(editValue.value) }),
  )
  if (updated) {
    editingId.value = null
    await load()
  }
}

// FR-VST-03: 방문 취소
async function cancel(v: VisitView) {
  if (!confirm('방문 신청을 취소할까요?')) return
  const cancelled = await run(() => api.cancelVisit(v.id, v.studentId))
  if (cancelled) await load()
}

onMounted(load)
</script>

<template>
  <section class="panel">
    <h1>내 신청 ({{ session.currentStudent?.name ?? '-' }})</h1>
    <p v-if="error" class="error">{{ error }}</p>

    <p v-if="visits.length === 0" class="muted">신청한 내역이 없습니다.</p>
    <table v-else>
      <thead>
        <tr>
          <th>자습실</th>
          <th>방문 시간</th>
          <th>상태</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="v in visits" :key="v.id">
          <td>
            <RouterLink :to="{ name: 'room-detail', params: { id: v.roomId } }">
              {{ v.roomName ?? `자습실 #${v.roomId}` }}
            </RouterLink>
          </td>
          <td>
            <div v-if="editingId === v.id" class="row">
              <input v-model="editValue" type="datetime-local" />
              <button :disabled="busy" @click="saveEdit(v)">저장</button>
              <button class="secondary" @click="editingId = null">취소</button>
            </div>
            <span v-else>{{ formatDateTime(v.visitAt) }}</span>
          </td>
          <td>
            <span v-if="v.status === 'ACTIVE'" class="badge ok">신청됨</span>
            <span v-else class="badge off">취소됨</span>
          </td>
          <td>
            <div v-if="v.status === 'ACTIVE' && editingId !== v.id" class="row">
              <button class="secondary" @click="startEdit(v)">시간 수정</button>
              <button class="danger" :disabled="busy" @click="cancel(v)">신청 취소</button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
