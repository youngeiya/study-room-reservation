<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '@/api'
import type { RoomPayload, StudyRoom, VisitAction, VisitHistory, VisitView } from '@/api/types'
import RoomForm from '@/components/RoomForm.vue'
import { useAction } from '@/composables/useAction'
import { useSessionStore } from '@/stores/session'
import { formatDateTime, isoToLocalInput, localInputToIso } from '@/utils/datetime'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const { error, busy, run } = useAction()

const roomId = computed(() => Number(route.params.id))
const room = ref<StudyRoom | null>(null)
const histories = ref<VisitHistory[]>([]) // 강사에게만 보여 준다
const myVisit = ref<VisitView | null>(null) // 이 자습실에 대한 내 신청 (학생)

const editingRoom = ref(false) // 강사: 자습실 수정 폼 표시
const editingVisit = ref(false) // 학생: 시간 수정 입력 표시
const visitInput = ref('') // 신청·수정에 쓰는 datetime-local 값

const isDeleted = computed(() => room.value?.deletedAt != null)
const isFull = computed(() => !!room.value && room.value.currentCount >= room.value.maxPersonnel)
const activeVisit = computed(() => (myVisit.value?.status === 'ACTIVE' ? myVisit.value : null))

// 운영 기간 안에서만 고를 수 있게 입력창의 min/max 를 맞춘다 (최종 검사는 서버가 한다)
const minInput = computed(() => (room.value ? isoToLocalInput(room.value.startDate) : undefined))
const maxInput = computed(() => (room.value ? isoToLocalInput(room.value.endDate) : undefined))

const actionLabel: Record<VisitAction, string> = {
  CREATE: '신청',
  UPDATE: '시간 수정',
  CANCEL: '취소',
}

async function load() {
  await run(async () => {
    room.value = await api.getRoom(roomId.value)
    if (session.isInstructor) {
      histories.value = await api.listHistories(roomId.value) // FR-ROM-03
    } else if (session.studentId !== null) {
      const mine = await api.listStudentVisits(session.studentId)
      myVisit.value = mine.find((v) => v.roomId === roomId.value) ?? null
    }
  })
}

// 주소의 id 가 바뀌거나 처음 열릴 때 불러온다
watch(roomId, load, { immediate: true })

// ── 강사 ──
async function updateRoom(payload: RoomPayload) {
  const updated = await run(() => api.updateRoom(roomId.value, payload))
  if (updated) {
    editingRoom.value = false
    await load()
  }
}

async function removeRoom() {
  if (!room.value || !confirm(`'${room.value.name}' 자습실을 삭제할까요?`)) return
  const done = await run(async () => {
    await api.deleteRoom(roomId.value)
    return true
  })
  if (done) router.push({ name: 'rooms' })
}

// ── 학생 ──
// FR-VST-01: 방문 신청 (운영 기간·정원·중복 검사는 서버가 한다)
async function apply() {
  if (session.studentId === null) return
  const created = await run(() =>
    api.createVisit(roomId.value, {
      studentId: session.studentId!,
      visitAt: localInputToIso(visitInput.value),
    }),
  )
  if (created) {
    visitInput.value = ''
    await load()
  }
}

function startEditVisit() {
  if (!myVisit.value) return
  visitInput.value = isoToLocalInput(myVisit.value.visitAt)
  editingVisit.value = true
}

// FR-VST-02: 방문 시간 수정
async function saveVisit() {
  const visit = activeVisit.value
  if (!visit) return
  const updated = await run(() =>
    api.updateVisit(visit.id, {
      studentId: visit.studentId,
      visitAt: localInputToIso(visitInput.value),
    }),
  )
  if (updated) {
    editingVisit.value = false
    visitInput.value = ''
    await load()
  }
}

// FR-VST-03: 방문 취소
async function cancelVisit() {
  const visit = activeVisit.value
  if (!visit || !confirm('방문 신청을 취소할까요?')) return
  const cancelled = await run(() => api.cancelVisit(visit.id, visit.studentId))
  if (cancelled) await load()
}
</script>

<template>
  <p v-if="error" class="error">{{ error }}</p>

  <template v-if="room">
    <section class="panel">
      <div class="row" style="justify-content: space-between">
        <h1>
          {{ room.name }}
          <span v-if="isDeleted" class="badge off">삭제됨</span>
          <span v-else-if="isFull" class="badge full">마감</span>
          <span v-else class="badge ok">신청 가능</span>
        </h1>
        <div v-if="session.isInstructor && !isDeleted" class="row">
          <button class="secondary" @click="editingRoom = !editingRoom">
            {{ editingRoom ? '수정 닫기' : '수정' }}
          </button>
          <button class="danger" :disabled="busy" @click="removeRoom">삭제</button>
        </div>
      </div>

      <p>
        운영 기간: {{ formatDateTime(room.startDate) }} ~ {{ formatDateTime(room.endDate) }}<br />
        신청 인원: {{ room.currentCount }} / {{ room.maxPersonnel }}명
      </p>

      <RoomForm
        v-if="editingRoom"
        :initial="room"
        submit-label="저장"
        :busy="busy"
        @submit="updateRoom"
      />
    </section>

    <!-- 학생: 신청 / 수정 / 취소 -->
    <section v-if="!session.isInstructor" class="panel">
      <h2>내 방문 신청</h2>

      <template v-if="activeVisit">
        <p>
          방문 시간: <strong>{{ formatDateTime(activeVisit.visitAt) }}</strong>
        </p>
        <div v-if="editingVisit" class="row">
          <input v-model="visitInput" type="datetime-local" :min="minInput" :max="maxInput" />
          <button :disabled="busy || !visitInput" @click="saveVisit">저장</button>
          <button class="secondary" @click="editingVisit = false">닫기</button>
        </div>
        <div v-else class="row">
          <button class="secondary" :disabled="isDeleted" @click="startEditVisit">시간 수정</button>
          <button class="danger" :disabled="busy" @click="cancelVisit">신청 취소</button>
        </div>
      </template>

      <template v-else>
        <p v-if="myVisit" class="muted">이전 신청은 취소되었습니다. 다시 신청할 수 있어요.</p>
        <p v-if="isDeleted" class="muted">삭제된 자습실에는 신청할 수 없습니다.</p>
        <form v-else class="row" @submit.prevent="apply">
          <label class="field">
            방문 시간
            <input
              v-model="visitInput"
              type="datetime-local"
              required
              :min="minInput"
              :max="maxInput"
            />
          </label>
          <button type="submit" :disabled="busy || isFull" style="align-self: flex-end">
            {{ isFull ? '정원 마감' : '신청' }}
          </button>
        </form>
      </template>
    </section>

    <!-- 강사: 신청·수정·취소 이력 (시간순) -->
    <section v-if="session.isInstructor" class="panel">
      <h2>신청 이력</h2>
      <p v-if="histories.length === 0" class="muted">이력이 없습니다.</p>
      <table v-else>
        <thead>
          <tr>
            <th>일시</th>
            <th>학생</th>
            <th>구분</th>
            <th>방문 시간</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="h in histories" :key="h.id">
            <td>{{ formatDateTime(h.createdAt) }}</td>
            <td>{{ h.studentName ?? `학생 #${h.studentId}` }}</td>
            <td>{{ actionLabel[h.action] }}</td>
            <td>
              <template v-if="h.action === 'UPDATE'">
                {{ h.beforeVisitAt ? formatDateTime(h.beforeVisitAt) : '-' }} →
                {{ h.afterVisitAt ? formatDateTime(h.afterVisitAt) : '-' }}
              </template>
              <template v-else-if="h.action === 'CANCEL'">
                {{ h.beforeVisitAt ? formatDateTime(h.beforeVisitAt) : '-' }}
              </template>
              <template v-else>{{
                h.afterVisitAt ? formatDateTime(h.afterVisitAt) : '-'
              }}</template>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </template>
</template>
