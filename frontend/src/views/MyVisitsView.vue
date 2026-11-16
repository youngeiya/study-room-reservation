<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '@/api'
import type { VisitView } from '@/api/types'
import { useAction } from '@/composables/useAction'
import { useRouteNames } from '@/composables/useRouteNames'
import { useSessionStore } from '@/stores/session'
import { formatDateTime, isoToLocalInput, localInputToIso } from '@/utils/datetime'

// FR-VST-04: 학생 본인의 신청 목록 (취소된 신청도 상태와 함께 보여 준다)
const session = useSessionStore()
const names = useRouteNames()
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
    api.updateVisit(v.id, { visitAt: localInputToIso(editValue.value) }),
  )
  if (updated) {
    editingId.value = null
    await load()
  }
}

// FR-VST-03: 방문 취소
async function cancel(v: VisitView) {
  if (!confirm('방문 신청을 취소할까요?')) return
  const cancelled = await run(() => api.cancelVisit(v.id))
  if (cancelled) await load()
}

onMounted(load)
</script>

<template>
  <h1 class="text-h5 font-weight-bold mb-4">내 신청 ({{ session.user?.name ?? '-' }})</h1>

  <v-alert v-if="error" type="error" variant="tonal" class="mb-4">{{ error }}</v-alert>

  <v-alert v-if="visits.length === 0" type="info" variant="tonal">신청한 내역이 없습니다.</v-alert>
  <v-card v-else>
    <v-table hover>
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
            <router-link :to="{ name: names.roomDetail, params: { id: v.roomId } }">
              {{ v.roomName ?? `자습실 #${v.roomId}` }}
            </router-link>
          </td>
          <td>
            <div v-if="editingId === v.id" class="d-flex flex-wrap ga-2 align-center py-2">
              <v-text-field
                v-model="editValue"
                type="datetime-local"
                density="compact"
                hide-details
                style="min-width: 220px"
              />
              <v-btn color="primary" :disabled="busy || !editValue" @click="saveEdit(v)"
                >저장</v-btn
              >
              <v-btn variant="text" @click="editingId = null">닫기</v-btn>
            </div>
            <span v-else>{{ formatDateTime(v.visitAt) }}</span>
          </td>
          <td>
            <v-chip v-if="v.status === 'ACTIVE'" color="success" size="small" variant="tonal"
              >신청됨</v-chip
            >
            <v-chip v-else color="grey" size="small" variant="tonal">취소됨</v-chip>
          </td>
          <td class="text-right">
            <template v-if="v.status === 'ACTIVE' && editingId !== v.id">
              <v-btn
                variant="tonal"
                color="primary"
                size="small"
                class="me-2"
                @click="startEdit(v)"
              >
                시간 수정
              </v-btn>
              <v-btn variant="text" color="error" size="small" :disabled="busy" @click="cancel(v)">
                신청 취소
              </v-btn>
            </template>
          </td>
        </tr>
      </tbody>
    </v-table>
  </v-card>
</template>
