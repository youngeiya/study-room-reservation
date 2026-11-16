<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { SubmitEventPromise } from 'vuetify'
import { mdiEye, mdiEyeOff, mdiOwl } from '@mdi/js'
import type { Role } from '@/api/types'
import { useAction } from '@/composables/useAction'
import { homeOf } from '@/router'
import { useSessionStore } from '@/stores/session'

const router = useRouter()
const session = useSessionStore()
const { error, busy, run } = useAction()

// 라디오 버튼으로 강사/학생을 고른다. 고른 값이 서버에 "어느 쪽 계정으로 로그인하는지"로 전달된다.
const role = ref<Role>('STUDENT')
const loginId = ref('')
const password = ref('')
const showPassword = ref(false)

const idLabel = computed(() => (role.value === 'INSTRUCTOR' ? '아이디' : '학번'))
const required = (v: string) => (v ?? '').trim() !== '' || '필수 입력입니다.'

async function submit(event: SubmitEventPromise) {
  const { valid } = await event
  if (!valid) return
  const ok = await run(async () => {
    await session.login(role.value, loginId.value, password.value)
    return true
  })
  if (ok && session.user) router.replace(homeOf(session.user.role))
}
</script>

<template>
  <v-main class="d-flex align-center justify-center" style="min-height: 100vh">
    <v-card width="100%" max-width="420" class="pa-4 mx-4" elevation="3">
      <div class="text-center mb-4">
        <v-icon :icon="mdiOwl" size="48" color="primary" />
        <h1 class="text-h5 font-weight-bold mt-2">부엉이 라이브러리</h1>
        <div class="text-body-2 text-medium-emphasis">자습실 예약</div>
      </div>

      <v-form @submit.prevent="submit">
        <v-radio-group v-model="role" inline label="로그인 유형" hide-details class="mb-4">
          <v-radio label="학생" value="STUDENT" color="primary" />
          <v-radio label="강사" value="INSTRUCTOR" color="primary" />
        </v-radio-group>

        <v-text-field
          v-model="loginId"
          :label="idLabel"
          autocomplete="username"
          autofocus
          :rules="[required]"
          class="mb-1"
        />
        <v-text-field
          v-model="password"
          label="비밀번호"
          :type="showPassword ? 'text' : 'password'"
          autocomplete="current-password"
          :append-inner-icon="showPassword ? mdiEyeOff : mdiEye"
          :rules="[required]"
          :hint="role === 'STUDENT' ? '처음에는 비밀번호가 학번과 같아요' : ''"
          :persistent-hint="role === 'STUDENT'"
          @click:append-inner="showPassword = !showPassword"
        />

        <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mt-4">
          {{ error }}
        </v-alert>

        <v-btn type="submit" color="primary" size="large" block class="mt-4" :loading="busy">
          {{ role === 'INSTRUCTOR' ? '강사 로그인' : '학생 로그인' }}
        </v-btn>
      </v-form>
    </v-card>
  </v-main>
</template>
