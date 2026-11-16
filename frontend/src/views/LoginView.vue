<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { SubmitEventPromise } from 'vuetify'
import { mdiEye, mdiEyeOff } from '@mdi/js'
import type { Role } from '@/api/types'
import BrandLogo from '@/components/BrandLogo.vue'
import { useAction } from '@/composables/useAction'
import { homeOf } from '@/router/home'
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
    <!-- 시대인재 홈페이지처럼 상자 없이 흰 바탕에 왼쪽 정렬 -->
    <div style="width: 100%; max-width: 400px" class="mx-4">
      <div class="mb-8">
        <BrandLogo :width="130" class="mb-6" />
        <h1 class="text-h5">부엉이 라이브러리</h1>
        <div class="text-body-1 mt-1" style="color: #8a8a8a">Study Room Reservation</div>
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
    </div>
  </v-main>
</template>
