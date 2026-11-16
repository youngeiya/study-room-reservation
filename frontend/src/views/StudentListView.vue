<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { SubmitEventPromise } from 'vuetify'
import { mdiDelete, mdiPencil, mdiPlus } from '@mdi/js'
import { api } from '@/api'
import type { Student, StudentPayload, StudentStatus } from '@/api/types'
import { useAction } from '@/composables/useAction'

// FR-STD-01: 학생 목록 / FR-STD-02: 학생 등록·수정·삭제 (강사 전용 화면)
// 이 화면이 열릴 때 목록을 불러오고, 등록·수정·삭제하면 다시 불러온다.
const students = ref<Student[]>([])
const { error, busy, run } = useAction()

const STATUS_LABEL: Record<StudentStatus, string> = {
  ENROLLED: '재원',
  ON_LEAVE: '휴원',
  WITHDRAWN: '퇴원',
}
const STATUS_COLOR: Record<StudentStatus, string> = {
  ENROLLED: 'success',
  ON_LEAVE: 'warning',
  WITHDRAWN: 'grey',
}
const statusItems = (Object.keys(STATUS_LABEL) as StudentStatus[]).map((value) => ({
  value,
  title: STATUS_LABEL[value],
}))
const GRADES = ['초등', '중1', '중2', '중3', '고1', '고2', '고3', 'N수']

const showForm = ref(false)
const editing = ref<Student | null>(null) // null 이면 "등록", 값이 있으면 "수정"
const form = ref({
  name: '',
  phone: '',
  studentNo: '',
  password: '',
  guardianPhone: '',
  grade: null as string | null,
  memo: '',
  status: 'ENROLLED' as StudentStatus,
})

const required = (v: string) => (v ?? '').trim() !== '' || '필수 입력입니다.'
// 서버와 같은 형식 (최종 검사는 서버가 한다)
const phoneRule = (v: string) => /^0\d{1,2}-?\d{3,4}-?\d{4}$/.test(v) || '예) 010-1234-5678'
const optionalPhoneRule = (v: string) => !v || phoneRule(v) === true || '예) 010-1234-5678'
const passwordRule = (v: string) => !v || v.length >= 4 || '4자 이상 입력해 주세요.'
const studentNoRule = (v: string) => /^[A-Za-z0-9-]{3,20}$/.test(v) || '영문·숫자·하이픈 3~20자'

function openCreate() {
  editing.value = null
  form.value = {
    name: '',
    phone: '',
    studentNo: '',
    password: '',
    guardianPhone: '',
    grade: null,
    memo: '',
    status: 'ENROLLED',
  }
  showForm.value = true
}

function openEdit(student: Student) {
  editing.value = student
  form.value = {
    name: student.name,
    phone: student.phone,
    studentNo: student.studentNo ?? '',
    password: '', // 수정할 때는 비워 두면 비밀번호를 바꾸지 않는다
    guardianPhone: student.guardianPhone ?? '',
    grade: student.grade,
    memo: student.memo ?? '',
    status: student.status,
  }
  showForm.value = true
}

async function reload() {
  const list = await run(() => api.listStudents())
  if (list) students.value = list
}

onMounted(reload)

async function save(event: SubmitEventPromise) {
  const { valid } = await event
  if (!valid) return
  const f = form.value
  // 선택 값은 비어 있으면 null 을 보내 서버가 값을 비우게 한다
  const payload: StudentPayload = {
    name: f.name.trim(),
    phone: f.phone.trim(),
    studentNo: f.studentNo.trim(),
    guardianPhone: f.guardianPhone.trim() || null,
    grade: f.grade || null,
    memo: f.memo.trim() || null,
    // 비밀번호는 입력했을 때만 보낸다 (등록: 초기 비밀번호, 수정: 재설정). 비우면 등록은 학번, 수정은 그대로
    ...(f.password ? { password: f.password } : {}),
  }
  const target = editing.value
  const saved = await run(() =>
    target
      ? api.updateStudent(target.id, { ...payload, status: f.status })
      : api.createStudent(payload),
  )
  if (saved) {
    showForm.value = false
    await reload()
  }
}

async function remove(student: Student) {
  if (!confirm(`'${student.name}' 학생을 삭제할까요?`)) return
  const done = await run(async () => {
    await api.deleteStudent(student.id)
    return true
  })
  if (done) await reload()
}
</script>

<template>
  <div class="d-flex align-center mb-4">
    <h1 class="text-h5 font-weight-bold">학생 목록</h1>
    <v-spacer />
    <v-btn color="primary" :prepend-icon="mdiPlus" @click="openCreate">학생 등록</v-btn>
  </div>

  <v-alert v-if="error" type="error" variant="tonal" class="mb-4">{{ error }}</v-alert>

  <v-dialog v-model="showForm" max-width="560">
    <v-card :title="editing ? '학생 수정' : '학생 등록'">
      <v-card-text>
        <v-form @submit.prevent="save">
          <v-row dense>
            <v-col cols="12" sm="6">
              <v-text-field
                v-model="form.studentNo"
                label="학번"
                placeholder="2026001"
                maxlength="20"
                :rules="[required, studentNoRule]"
              />
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field
                v-model="form.password"
                type="password"
                autocomplete="new-password"
                :label="editing ? '비밀번호 재설정 (선택)' : '초기 비밀번호 (선택)'"
                :hint="editing ? '비워 두면 바꾸지 않아요' : '비워 두면 학번과 같아요'"
                persistent-hint
                :rules="[passwordRule]"
              />
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field v-model="form.name" label="이름" maxlength="30" :rules="[required]" />
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field
                v-model="form.phone"
                label="연락처"
                placeholder="010-1234-5678"
                :rules="[required, phoneRule]"
              />
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field
                v-model="form.guardianPhone"
                label="학부모 연락처 (선택)"
                placeholder="010-1234-5678"
                :rules="[optionalPhoneRule]"
              />
            </v-col>
            <v-col cols="12" sm="6">
              <v-select v-model="form.grade" label="학년 (선택)" :items="GRADES" clearable />
            </v-col>
            <v-col v-if="editing" cols="12" sm="6">
              <v-select
                v-model="form.status"
                label="재원 상태"
                :items="statusItems"
                hint="휴원·퇴원 학생은 신청할 수 없어요"
                persistent-hint
              />
            </v-col>
            <v-col cols="12">
              <v-textarea
                v-model="form.memo"
                label="강사 메모 (선택)"
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

  <v-alert v-if="students.length === 0" type="info" variant="tonal">
    등록된 학생이 없습니다.
  </v-alert>
  <v-card v-else>
    <v-table hover>
      <thead>
        <tr>
          <th>학번</th>
          <th>이름</th>
          <th>학년</th>
          <th>연락처</th>
          <th>상태</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="s in students" :key="s.id">
          <td>{{ s.studentNo ?? '-' }}</td>
          <td>
            {{ s.name }}
            <v-tooltip v-if="s.memo" activator="parent" location="top" max-width="320">
              {{ s.memo }}
            </v-tooltip>
          </td>
          <td>{{ s.grade ?? '-' }}</td>
          <td>
            {{ s.phone }}
            <div v-if="s.guardianPhone" class="text-caption text-medium-emphasis">
              학부모 {{ s.guardianPhone }}
            </div>
          </td>
          <td>
            <v-chip :color="STATUS_COLOR[s.status]" size="small" variant="tonal">
              {{ STATUS_LABEL[s.status] }}
            </v-chip>
          </td>
          <td class="text-right">
            <v-btn
              variant="tonal"
              color="primary"
              size="small"
              class="me-2"
              :prepend-icon="mdiPencil"
              @click="openEdit(s)"
            >
              수정
            </v-btn>
            <v-btn
              variant="text"
              color="error"
              size="small"
              :prepend-icon="mdiDelete"
              :disabled="busy"
              @click="remove(s)"
            >
              삭제
            </v-btn>
          </td>
        </tr>
      </tbody>
    </v-table>
  </v-card>
</template>
