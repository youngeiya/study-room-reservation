<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { SubmitEventPromise } from 'vuetify'
import { mdiDelete, mdiMagnify, mdiPencil, mdiPlus } from '@mdi/js'
import { api } from '@/api'
import type {
  Instructor,
  InstructorPayload,
  InstructorPosition,
  InstructorStatus,
  Subject,
} from '@/api/types'
import { useAction } from '@/composables/useAction'
import { useSessionStore } from '@/stores/session'
import {
  POSITION_LABEL,
  STATUS_COLOR,
  STATUS_LABEL,
  SUBJECT_LABEL,
  positionItems,
  statusItems,
  subjectItems,
} from '@/utils/instructor'

// 강사 관리 (강사 전용 화면): 목록 · 검색/필터 · 등록 · 수정(비밀번호 재설정, 재직 상태 변경) · 삭제
// 이 화면이 열릴 때 목록을 불러오고, 등록·수정·삭제하면 다시 불러온다.
const session = useSessionStore()
const instructors = ref<Instructor[]>([])
const { error, busy, run } = useAction()

// ── 검색·필터 (화면에서만 거른다) ──
const keyword = ref('')
const positionFilter = ref<InstructorPosition | null>(null)
const statusFilter = ref<InstructorStatus | null>(null)

const filtered = computed(() => {
  const k = keyword.value.trim().toLowerCase()
  return instructors.value.filter((i) => {
    if (positionFilter.value && i.position !== positionFilter.value) return false
    if (statusFilter.value && i.status !== statusFilter.value) return false
    if (!k) return true
    return [i.name, i.loginId, i.employeeNo ?? '', i.phone ?? ''].some((v) =>
      v.toLowerCase().includes(k),
    )
  })
})

// ── 등록·수정 폼 ──
const showForm = ref(false)
const editing = ref<Instructor | null>(null) // null 이면 "등록", 값이 있으면 "수정"
const emptyForm = () => ({
  loginId: '',
  password: '',
  name: '',
  employeeNo: '',
  phone: '',
  email: '',
  position: 'LECTURER' as InstructorPosition,
  subjects: [] as Subject[],
  hireDate: '',
  memo: '',
  status: 'ACTIVE' as InstructorStatus,
})
const form = ref(emptyForm())

const required = (v: string) => (v ?? '').trim() !== '' || '필수 입력입니다.'
// 서버와 같은 형식 (최종 검사는 서버가 한다)
const loginIdRule = (v: string) => /^[A-Za-z0-9_.-]{3,50}$/.test(v) || '영문·숫자·_ . - 3~50자'
const employeeNoRule = (v: string) => /^[A-Za-z0-9-]{2,20}$/.test(v) || '영문·숫자·하이픈 2~20자'
const phoneRule = (v: string) => /^0\d{1,2}-?\d{3,4}-?\d{4}$/.test(v) || '예) 010-1234-5678'
const emailRule = (v: string) => !v || /^\S+@\S+\.\S+$/.test(v) || '이메일 형식이 올바르지 않아요.'
const createPasswordRule = (v: string) => (v ?? '').length >= 4 || '4자 이상 입력해 주세요.'
const editPasswordRule = (v: string) => !v || v.length >= 4 || '4자 이상 입력해 주세요.'

function openCreate() {
  editing.value = null
  form.value = emptyForm()
  showForm.value = true
}

function openEdit(instructor: Instructor) {
  editing.value = instructor
  form.value = {
    loginId: instructor.loginId,
    password: '', // 수정할 때 비워 두면 비밀번호를 바꾸지 않는다
    name: instructor.name,
    employeeNo: instructor.employeeNo ?? '',
    phone: instructor.phone ?? '',
    email: instructor.email ?? '',
    position: instructor.position,
    subjects: [...instructor.subjects],
    hireDate: instructor.hireDate ?? '',
    memo: instructor.memo ?? '',
    status: instructor.status,
  }
  showForm.value = true
}

async function reload() {
  const list = await run(() => api.listInstructors())
  if (list) instructors.value = list
}

onMounted(reload)

async function save(event: SubmitEventPromise) {
  const { valid } = await event
  if (!valid) return
  const f = form.value
  // 선택 값은 비어 있으면 null 을 보내 서버가 값을 비우게 한다
  const payload: InstructorPayload = {
    loginId: f.loginId.trim(),
    name: f.name.trim(),
    employeeNo: f.employeeNo.trim(),
    phone: f.phone.trim(),
    email: f.email.trim() || null,
    position: f.position,
    subjects: f.subjects,
    hireDate: f.hireDate || null,
    memo: f.memo.trim() || null,
    ...(f.password ? { password: f.password } : {}),
  }
  const target = editing.value
  const saved = await run(() =>
    target
      ? api.updateInstructor(target.id, { ...payload, status: f.status })
      : api.createInstructor(payload),
  )
  if (saved) {
    showForm.value = false
    await reload()
  }
}

async function remove(instructor: Instructor) {
  if (
    !confirm(
      `'${instructor.name}' 강사 계정을 삭제할까요?\n삭제하면 그 계정으로 로그인할 수 없어요.\n(퇴직한 강사의 기록을 남기려면 삭제 대신 재직 상태를 '퇴직'으로 바꾸세요.)`,
    )
  ) {
    return
  }
  const done = await run(async () => {
    await api.deleteInstructor(instructor.id)
    return true
  })
  if (done) await reload()
}

const isMe = (i: Instructor) => i.id === session.user?.id

// 내 계정을 수정할 때는 "퇴직"을 고를 수 없다 (서버도 거부한다)
const statusChoices = computed(() =>
  editing.value && isMe(editing.value)
    ? statusItems.filter((s) => s.value !== 'RESIGNED')
    : statusItems,
)
</script>

<template>
  <div class="d-flex align-center mb-4">
    <h1 class="text-h5">강사 목록</h1>
    <v-spacer />
    <v-btn color="primary" :prepend-icon="mdiPlus" @click="openCreate">강사 등록</v-btn>
  </div>

  <v-alert v-if="error" type="error" variant="tonal" class="mb-4">{{ error }}</v-alert>

  <!-- 검색·필터 -->
  <v-row dense class="mb-2">
    <v-col cols="12" md="5">
      <v-text-field
        v-model="keyword"
        label="이름·아이디·사번·연락처 검색"
        :prepend-inner-icon="mdiMagnify"
        clearable
        hide-details
      />
    </v-col>
    <v-col cols="6" md="3">
      <v-select
        v-model="positionFilter"
        label="직책"
        :items="positionItems"
        clearable
        hide-details
      />
    </v-col>
    <v-col cols="6" md="3">
      <v-select
        v-model="statusFilter"
        label="재직 상태"
        :items="statusItems"
        clearable
        hide-details
      />
    </v-col>
  </v-row>

  <v-dialog v-model="showForm" max-width="640">
    <v-card :title="editing ? '강사 수정' : '강사 등록'">
      <v-card-text>
        <v-form @submit.prevent="save">
          <v-row dense>
            <v-col cols="12" sm="6">
              <v-text-field
                v-model="form.loginId"
                label="로그인 아이디"
                placeholder="teacher1"
                maxlength="50"
                autocomplete="off"
                :rules="[required, loginIdRule]"
              />
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field
                v-model="form.password"
                type="password"
                autocomplete="new-password"
                :label="editing ? '비밀번호 재설정 (선택)' : '비밀번호'"
                :hint="editing ? '비워 두면 바꾸지 않아요' : '4자 이상'"
                persistent-hint
                :rules="[editing ? editPasswordRule : createPasswordRule]"
              />
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field v-model="form.name" label="이름" maxlength="30" :rules="[required]" />
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field
                v-model="form.employeeNo"
                label="사번"
                placeholder="T-001"
                maxlength="20"
                :rules="[required, employeeNoRule]"
              />
            </v-col>
            <v-col cols="12" sm="6">
              <v-select
                v-model="form.position"
                label="직책"
                :items="positionItems"
                :rules="[required]"
              />
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field
                v-model="form.phone"
                label="연락처"
                placeholder="010-1234-5678"
                :rules="[required, phoneRule]"
              />
            </v-col>
            <v-col cols="12">
              <v-text-field
                v-model="form.email"
                label="이메일 (선택)"
                placeholder="teacher@example.com"
                maxlength="100"
                :rules="[emailRule]"
              />
            </v-col>
            <v-col cols="12">
              <v-select
                v-model="form.subjects"
                label="담당 과목 (선택, 여러 개 가능)"
                :items="subjectItems"
                multiple
                chips
                closable-chips
              />
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field v-model="form.hireDate" label="입사일 (선택)" type="date" />
            </v-col>
            <v-col v-if="editing" cols="12" sm="6">
              <v-select
                v-model="form.status"
                label="재직 상태"
                :items="statusChoices"
                :hint="
                  isMe(editing)
                    ? '내 계정은 퇴직으로 바꿀 수 없어요'
                    : '퇴직하면 로그인할 수 없어요'
                "
                persistent-hint
              />
            </v-col>
            <v-col cols="12">
              <v-textarea
                v-model="form.memo"
                label="메모 (선택)"
                rows="2"
                counter="200"
                maxlength="200"
                auto-grow
              />
            </v-col>
          </v-row>
          <div class="d-flex justify-end ga-2">
            <v-btn variant="text" @click="showForm = false">닫기</v-btn>
            <v-btn type="submit" color="primary" :loading="busy">
              {{ editing ? '저장' : '등록' }}
            </v-btn>
          </div>
        </v-form>
      </v-card-text>
    </v-card>
  </v-dialog>

  <v-alert v-if="instructors.length === 0" type="info" variant="tonal">
    등록된 강사가 없습니다.
  </v-alert>
  <v-alert v-else-if="filtered.length === 0" type="info" variant="tonal">
    조건에 맞는 강사가 없습니다.
  </v-alert>
  <v-card v-else>
    <v-table hover>
      <thead>
        <tr>
          <th>사번</th>
          <th>이름</th>
          <th>직책</th>
          <th>담당 과목</th>
          <th>연락처</th>
          <th>상태</th>
          <th>입사일</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="i in filtered" :key="i.id">
          <td>{{ i.employeeNo ?? '-' }}</td>
          <td>
            {{ i.name }}
            <v-chip v-if="isMe(i)" size="x-small" color="primary" variant="flat" class="ms-1">
              나
            </v-chip>
            <div class="text-caption text-medium-emphasis">{{ i.loginId }}</div>
            <v-tooltip v-if="i.memo" activator="parent" location="top" max-width="320">
              {{ i.memo }}
            </v-tooltip>
          </td>
          <td>{{ POSITION_LABEL[i.position] }}</td>
          <td>
            <template v-if="i.subjects.length > 0">
              <v-chip
                v-for="s in i.subjects"
                :key="s"
                size="x-small"
                variant="outlined"
                class="me-1 mb-1"
              >
                {{ SUBJECT_LABEL[s] }}
              </v-chip>
            </template>
            <span v-else>-</span>
          </td>
          <td>
            {{ i.phone ?? '-' }}
            <div v-if="i.email" class="text-caption text-medium-emphasis">{{ i.email }}</div>
          </td>
          <td>
            <v-chip :color="STATUS_COLOR[i.status]" size="small" variant="tonal">
              {{ STATUS_LABEL[i.status] }}
            </v-chip>
          </td>
          <td>{{ i.hireDate ?? '-' }}</td>
          <td class="text-right text-no-wrap">
            <v-btn
              variant="tonal"
              color="primary"
              size="small"
              class="me-2"
              :prepend-icon="mdiPencil"
              @click="openEdit(i)"
            >
              수정
            </v-btn>
            <v-btn
              variant="text"
              color="error"
              size="small"
              :prepend-icon="mdiDelete"
              :disabled="busy || isMe(i)"
              @click="remove(i)"
            >
              삭제
            </v-btn>
          </td>
        </tr>
      </tbody>
    </v-table>
  </v-card>
</template>
