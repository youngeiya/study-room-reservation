<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { SubmitEventPromise } from 'vuetify'
import { mdiDelete, mdiPencil, mdiPlus } from '@mdi/js'
import { api } from '@/api'
import type { Instructor, InstructorPayload } from '@/api/types'
import { useAction } from '@/composables/useAction'
import { useSessionStore } from '@/stores/session'
import { formatDateTime } from '@/utils/datetime'

// 강사 계정 관리 (강사 전용 화면): 목록 · 등록 · 수정(비밀번호 재설정 포함) · 삭제
// 이 화면이 열릴 때 목록을 불러오고, 등록·수정·삭제하면 다시 불러온다.
const session = useSessionStore()
const instructors = ref<Instructor[]>([])
const { error, busy, run } = useAction()

const showForm = ref(false)
const editing = ref<Instructor | null>(null) // null 이면 "등록", 값이 있으면 "수정"
const form = ref({ loginId: '', name: '', password: '' })

const required = (v: string) => (v ?? '').trim() !== '' || '필수 입력입니다.'
// 서버와 같은 형식 (최종 검사는 서버가 한다)
const loginIdRule = (v: string) => /^[A-Za-z0-9_.-]{3,50}$/.test(v) || '영문·숫자·_ . - 3~50자'
const createPasswordRule = (v: string) => (v ?? '').length >= 4 || '4자 이상 입력해 주세요.'
const editPasswordRule = (v: string) => !v || v.length >= 4 || '4자 이상 입력해 주세요.'

function openCreate() {
  editing.value = null
  form.value = { loginId: '', name: '', password: '' }
  showForm.value = true
}

function openEdit(instructor: Instructor) {
  editing.value = instructor
  // 수정할 때 비밀번호는 비워 두면 바꾸지 않는다
  form.value = { loginId: instructor.loginId, name: instructor.name, password: '' }
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
  const payload: InstructorPayload = {
    loginId: f.loginId.trim(),
    name: f.name.trim(),
    ...(f.password ? { password: f.password } : {}),
  }
  const target = editing.value
  const saved = await run(() =>
    target ? api.updateInstructor(target.id, payload) : api.createInstructor(payload),
  )
  if (saved) {
    showForm.value = false
    await reload()
  }
}

async function remove(instructor: Instructor) {
  if (
    !confirm(
      `'${instructor.name}' 강사 계정을 삭제할까요?\n삭제하면 그 계정으로 로그인할 수 없어요.`,
    )
  )
    return
  const done = await run(async () => {
    await api.deleteInstructor(instructor.id)
    return true
  })
  if (done) await reload()
}

const isMe = (i: Instructor) => i.id === session.user?.id
</script>

<template>
  <div class="d-flex align-center mb-4">
    <h1 class="text-h5">강사 목록</h1>
    <v-spacer />
    <v-btn color="primary" :prepend-icon="mdiPlus" @click="openCreate">강사 등록</v-btn>
  </div>

  <v-alert v-if="error" type="error" variant="tonal" class="mb-4">{{ error }}</v-alert>

  <v-dialog v-model="showForm" max-width="480">
    <v-card :title="editing ? '강사 수정' : '강사 등록'">
      <v-card-text>
        <v-form @submit.prevent="save">
          <v-text-field
            v-model="form.loginId"
            label="아이디"
            placeholder="teacher1"
            maxlength="50"
            autocomplete="off"
            :rules="[required, loginIdRule]"
          />
          <v-text-field v-model="form.name" label="이름" maxlength="30" :rules="[required]" />
          <v-text-field
            v-model="form.password"
            type="password"
            autocomplete="new-password"
            :label="editing ? '비밀번호 재설정 (선택)' : '비밀번호'"
            :hint="editing ? '비워 두면 바꾸지 않아요' : '4자 이상'"
            persistent-hint
            :rules="[editing ? editPasswordRule : createPasswordRule]"
          />
          <div class="d-flex justify-end ga-2 mt-4">
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
  <v-card v-else>
    <v-table hover>
      <thead>
        <tr>
          <th>아이디</th>
          <th>이름</th>
          <th>등록일</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="i in instructors" :key="i.id">
          <td>{{ i.loginId }}</td>
          <td>
            {{ i.name }}
            <v-chip v-if="isMe(i)" size="x-small" color="primary" variant="flat" class="ms-2">
              나
            </v-chip>
          </td>
          <td>{{ formatDateTime(i.createdAt) }}</td>
          <td class="text-right">
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
