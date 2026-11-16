<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { mdiArrowLeft, mdiCalendarClock, mdiCamera, mdiDelete, mdiPencil } from '@mdi/js'
import { api } from '@/api'
import type { RoomPayload, StudyRoom, VisitAction, VisitHistory, VisitView } from '@/api/types'
import RoomForm from '@/components/RoomForm.vue'
import RoomImage from '@/components/RoomImage.vue'
import { useAction } from '@/composables/useAction'
import { useRouteNames } from '@/composables/useRouteNames'
import { useSessionStore } from '@/stores/session'
import { formatDateTime, isoToLocalInput, localInputToIso } from '@/utils/datetime'
import { isFull as isRoomFull, occupancyColor, occupancyPercent } from '@/utils/room'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const names = useRouteNames()
const { error, errorCode, busy, run } = useAction()

const roomId = computed(() => Number(route.params.id))
const room = ref<StudyRoom | null>(null)
const histories = ref<VisitHistory[]>([]) // 강사에게만 보여 준다
// 이 자습실에 대한 내 활성 신청들 (학생). 하루에 한 건이라 날짜가 다르면 여러 건일 수 있다.
const myVisits = ref<VisitView[]>([])

const editingRoom = ref(false) // 강사: 자습실 수정 폼 표시
const editingVisitId = ref<number | null>(null) // 학생: 시간을 수정 중인 신청의 번호
const visitInput = ref('') // 시간 수정에 쓰는 datetime-local 값
const applyInput = ref('') // 새 신청에 쓰는 datetime-local 값

const isDeleted = computed(() => room.value?.deletedAt != null)
const isFull = computed(() => !!room.value && isRoomFull(room.value))

// 예약 가능 기간(서버 정책): 지금부터 며칠 이내. 화면은 안내와 입력 범위 제한만 하고, 최종 검사는 서버가 한다.
const maxDaysAhead = ref(3)
const loadedAt = ref(Date.now()) // 자습실을 불러온 시각 (이 시각을 기준으로 입력 범위를 계산한다)

// 고를 수 있는 범위 = 자습실 운영 기간 ∩ [지금, 지금 + N일]
const minInput = computed(() => {
  if (!room.value) return undefined
  return isoToLocalInput(
    new Date(Math.max(Date.parse(room.value.startDate), loadedAt.value)).toISOString(),
  )
})
const maxInput = computed(() => {
  if (!room.value) return undefined
  const limit = loadedAt.value + maxDaysAhead.value * 24 * 60 * 60 * 1000
  return isoToLocalInput(new Date(Math.min(Date.parse(room.value.endDate), limit)).toISOString())
})
const bookingHint = computed(
  () => `지금부터 ${maxDaysAhead.value}일 이내의 시간만 신청할 수 있어요`,
)

const actionLabel: Record<VisitAction, string> = {
  CREATE: '신청',
  UPDATE: '시간 수정',
  CANCEL: '취소',
}
const actionColor: Record<VisitAction, string> = {
  CREATE: 'success',
  UPDATE: 'primary',
  CANCEL: 'error',
}

async function load() {
  await run(async () => {
    room.value = await api.getRoom(roomId.value)
    loadedAt.value = Date.now()
    if (!session.isInstructor) maxDaysAhead.value = (await api.getBookingPolicy()).maxDaysAhead
    if (session.isInstructor) {
      histories.value = await api.listHistories(roomId.value) // FR-ROM-03
    } else if (session.studentId !== null) {
      const mine = await api.listStudentVisits(session.studentId)
      myVisits.value = mine
        .filter((v) => v.roomId === roomId.value && v.status === 'ACTIVE')
        .sort((a, b) => a.visitAt.localeCompare(b.visitAt))
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
  if (done) router.push({ name: names.value.rooms })
}

// 자습실 사진 등록·교체·삭제 (서버가 SeaweedFS 에 저장한다)
const MAX_IMAGE_MB = 5
const fileInput = ref<HTMLInputElement | null>(null)

async function onPickImage(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // 같은 파일을 다시 골라도 동작하게 비운다
  if (!file) return
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    error.value = '사진은 JPG, PNG, WEBP 형식만 올릴 수 있습니다.'
    return
  }
  if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
    error.value = `사진은 ${MAX_IMAGE_MB}MB 이하만 올릴 수 있습니다.`
    return
  }
  const updated = await run(() => api.uploadRoomImage(roomId.value, file))
  if (updated) room.value = updated
}

async function removeImage() {
  if (!confirm('자습실 사진을 삭제할까요?')) return
  const updated = await run(() => api.deleteRoomImage(roomId.value))
  if (updated) room.value = updated
}

// ── 학생 ──
// FR-VST-01: 방문 신청 (운영 기간·정원·중복 검사는 서버가 한다)
async function apply() {
  if (session.studentId === null || !applyInput.value) return
  const created = await run(() =>
    // 누가 신청하는지는 서버가 로그인 정보(토큰)로 알아낸다 - 학생 번호를 보내지 않는다
    api.createVisit(roomId.value, { visitAt: localInputToIso(applyInput.value) }),
  )
  if (created) {
    applyInput.value = ''
    await load()
  } else if (errorCode.value === 'ROOM_FULL') {
    // 정원 초과는 눈에 띄게 경고창으로 알린다. (판단은 서버가 하고, 화면은 그 결과를 알려 줄 뿐)
    // 다른 사람이 먼저 신청해서 막 마감된 경우일 수 있으니 최신 인원으로 화면도 갱신한다.
    await load()
    alert(
      `정원이 가득 차서 신청할 수 없습니다.\n(신청 인원 ${room.value?.currentCount ?? '-'} / 최대 ${room.value?.maxPersonnel ?? '-'}명)`,
    )
  }
}

function startEditVisit(visit: VisitView) {
  visitInput.value = isoToLocalInput(visit.visitAt)
  editingVisitId.value = visit.id
}

function closeEdit() {
  editingVisitId.value = null
  visitInput.value = ''
}

// FR-VST-02: 방문 시간 수정 (옮기려는 날짜에 다른 신청이 있으면 서버가 거부한다)
async function saveVisit(visit: VisitView) {
  const updated = await run(() =>
    api.updateVisit(visit.id, { visitAt: localInputToIso(visitInput.value) }),
  )
  if (updated) {
    closeEdit()
    await load()
  }
}

// FR-VST-03: 방문 취소
async function cancelVisit(visit: VisitView) {
  if (!confirm('방문 신청을 취소할까요?')) return
  const cancelled = await run(() => api.cancelVisit(visit.id))
  if (cancelled) await load()
}
</script>

<template>
  <v-btn variant="text" :prepend-icon="mdiArrowLeft" :to="{ name: names.rooms }" class="mb-2">
    자습실 목록
  </v-btn>

  <v-alert v-if="error" type="error" variant="tonal" class="mb-4">{{ error }}</v-alert>

  <template v-if="room">
    <!-- 자습실 정보 -->
    <v-card class="mb-4">
      <RoomImage :room="room" :height="260" />
      <v-card-item>
        <template #title>
          <span class="text-h5 font-weight-bold">{{ room.name }}</span>
        </template>
        <template #append>
          <v-chip v-if="isDeleted" color="grey" variant="flat">삭제됨</v-chip>
          <v-chip v-else-if="isFull" color="error" variant="flat">마감</v-chip>
          <v-chip v-else color="success" variant="flat">신청 가능</v-chip>
        </template>
      </v-card-item>

      <v-card-text>
        <div class="d-flex align-center text-body-1 mb-4">
          <v-icon :icon="mdiCalendarClock" class="me-2" />
          {{ formatDateTime(room.startDate) }} ~ {{ formatDateTime(room.endDate) }}
        </div>

        <div class="d-flex justify-space-between mb-1">
          <span>신청 인원</span>
          <strong>{{ room.currentCount }} / {{ room.maxPersonnel }}명</strong>
        </div>
        <v-progress-linear
          :model-value="occupancyPercent(room)"
          :color="occupancyColor(room)"
          height="12"
          rounded
        />
      </v-card-text>

      <v-card-actions v-if="session.isInstructor && !isDeleted">
        <input
          ref="fileInput"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          @change="onPickImage"
        />
        <v-btn
          :prepend-icon="mdiCamera"
          variant="tonal"
          :loading="busy"
          @click="fileInput?.click()"
        >
          {{ room.imageKey ? '사진 변경' : '사진 올리기' }}
        </v-btn>
        <v-btn v-if="room.imageKey" variant="text" :disabled="busy" @click="removeImage">
          사진 삭제
        </v-btn>
        <v-btn
          :prepend-icon="mdiPencil"
          variant="tonal"
          color="primary"
          @click="editingRoom = !editingRoom"
        >
          {{ editingRoom ? '수정 닫기' : '수정' }}
        </v-btn>
        <v-btn
          :prepend-icon="mdiDelete"
          variant="text"
          color="error"
          :disabled="busy"
          @click="removeRoom"
        >
          삭제
        </v-btn>
      </v-card-actions>

      <v-expand-transition>
        <div v-if="editingRoom">
          <v-divider />
          <v-card-text>
            <RoomForm :initial="room" submit-label="저장" :busy="busy" @submit="updateRoom" />
          </v-card-text>
        </div>
      </v-expand-transition>
    </v-card>

    <!-- 학생: 신청 / 수정 / 취소 (하루에 한 건, 날짜가 다르면 이 자습실에도 여러 건 가능) -->
    <v-card v-if="!session.isInstructor" class="mb-4" title="내 방문 신청">
      <v-card-text>
        <div v-for="visit in myVisits" :key="visit.id" class="mb-4">
          <p class="mb-2">
            방문 시간: <strong>{{ formatDateTime(visit.visitAt) }}</strong>
          </p>
          <div v-if="editingVisitId === visit.id" class="d-flex flex-wrap ga-2 align-start">
            <v-text-field
              v-model="visitInput"
              type="datetime-local"
              label="방문 시간"
              :min="minInput"
              :max="maxInput"
              :hint="bookingHint"
              persistent-hint
              style="max-width: 280px"
            />
            <v-btn
              color="primary"
              height="48"
              :disabled="busy || !visitInput"
              @click="saveVisit(visit)"
              >저장</v-btn
            >
            <v-btn variant="text" height="48" @click="closeEdit">닫기</v-btn>
          </div>
          <div v-else class="d-flex ga-2">
            <v-btn
              variant="tonal"
              color="primary"
              :disabled="isDeleted"
              @click="startEditVisit(visit)"
            >
              시간 수정
            </v-btn>
            <v-btn variant="text" color="error" :disabled="busy" @click="cancelVisit(visit)"
              >신청 취소</v-btn
            >
          </div>
        </div>

        <v-divider v-if="myVisits.length > 0" class="mb-4" />

        <v-alert v-if="isDeleted" type="warning" variant="tonal" density="compact">
          삭제된 자습실에는 신청할 수 없습니다.
        </v-alert>
        <form v-else class="d-flex flex-wrap ga-2 align-start" @submit.prevent="apply">
          <v-text-field
            v-model="applyInput"
            type="datetime-local"
            :label="myVisits.length > 0 ? '다른 날짜에 추가 신청' : '방문 시간'"
            :min="minInput"
            :max="maxInput"
            :hint="bookingHint"
            persistent-hint
            style="max-width: 280px"
          />
          <!-- 정원이 차 있어도 누를 수 있게 둔다: 누르면 서버가 ROOM_FULL 로 거부하고 경고창을 띄운다 -->
          <v-btn type="submit" color="primary" height="48" :disabled="busy || !applyInput"
            >신청</v-btn
          >
        </form>
        <p class="text-caption text-medium-emphasis mt-2">하루에 한 건만 신청할 수 있어요.</p>
      </v-card-text>
    </v-card>

    <!-- 강사: 신청·수정·취소 이력 (시간순) -->
    <v-card v-if="session.isInstructor" title="신청 이력">
      <v-card-text v-if="histories.length === 0" class="text-medium-emphasis"
        >이력이 없습니다.</v-card-text
      >
      <v-table v-else hover>
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
            <td>
              <v-chip :color="actionColor[h.action]" size="small" variant="tonal">
                {{ actionLabel[h.action] }}
              </v-chip>
            </td>
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
      </v-table>
    </v-card>
  </template>
</template>
