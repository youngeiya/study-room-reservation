<script setup lang="ts">
import { ref, watch } from 'vue'
import type { SubmitEventPromise } from 'vuetify'
import { api } from '@/api'
import { useAction } from '@/composables/useAction'

// 비밀번호 변경 (강사·학생 공통). v-model 로 열고 닫는다.
const open = defineModel<boolean>({ required: true })
const { error, busy, run } = useAction()

const current = ref('')
const next = ref('')
const confirm = ref('')
const done = ref(false)

// 열 때마다 입력을 비운다
watch(open, (value) => {
  if (value) {
    current.value = ''
    next.value = ''
    confirm.value = ''
    error.value = ''
    done.value = false
  }
})

const required = (v: string) => (v ?? '') !== '' || '필수 입력입니다.'
const minLength = (v: string) => (v ?? '').length >= 4 || '4자 이상 입력해 주세요.'
const sameAsNew = (v: string) => v === next.value || '새 비밀번호와 같지 않습니다.'

async function submit(event: SubmitEventPromise) {
  const { valid } = await event
  if (!valid) return
  const ok = await run(async () => {
    await api.changePassword({ currentPassword: current.value, newPassword: next.value })
    return true
  })
  if (ok) done.value = true
}
</script>

<template>
  <v-dialog v-model="open" max-width="420">
    <v-card title="비밀번호 변경">
      <v-card-text>
        <v-alert v-if="done" type="success" variant="tonal" class="mb-2">
          비밀번호를 변경했습니다. 다음 로그인부터 새 비밀번호를 사용하세요.
        </v-alert>
        <v-form v-else @submit.prevent="submit">
          <v-text-field
            v-model="current"
            label="현재 비밀번호"
            type="password"
            autocomplete="current-password"
            :rules="[required]"
          />
          <v-text-field
            v-model="next"
            label="새 비밀번호"
            type="password"
            autocomplete="new-password"
            :rules="[required, minLength]"
          />
          <v-text-field
            v-model="confirm"
            label="새 비밀번호 확인"
            type="password"
            autocomplete="new-password"
            :rules="[required, sameAsNew]"
          />
          <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-3">
            {{ error }}
          </v-alert>
          <div class="d-flex justify-end ga-2">
            <v-btn variant="text" @click="open = false">닫기</v-btn>
            <v-btn type="submit" color="primary" :loading="busy">변경</v-btn>
          </div>
        </v-form>
      </v-card-text>
      <v-card-actions v-if="done">
        <v-spacer />
        <v-btn variant="text" @click="open = false">닫기</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
