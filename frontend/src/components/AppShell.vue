<script setup lang="ts">
import { ref } from 'vue'
import { RouterView, useRouter } from 'vue-router'
import { useDisplay } from 'vuetify'
import { mdiChevronDown, mdiLock, mdiLogout, mdiMenu } from '@mdi/js'
import BrandLogo from '@/components/BrandLogo.vue'
import PasswordDialog from '@/components/PasswordDialog.vue'
import { useSessionStore } from '@/stores/session'

/**
 * 로그인한 뒤의 공통 틀: 상단 헤더(로고 · 텍스트 메뉴 · 사용자 메뉴)와 본문.
 * 시대인재 홈페이지처럼 왼쪽 메뉴 없이 위쪽에 메뉴를 둔다.
 * 강사 화면과 학생 화면이 각자 제목·메뉴를 넘겨서 "서로 다른 화면"으로 보이게 한다.
 * 좁은 화면(모바일)에서는 메뉴가 햄버거 버튼 안으로 들어간다.
 */
defineProps<{
  title: string
  badge: string
  items: { title: string; to: { name: string } }[]
}>()

const router = useRouter()
const session = useSessionStore()
const { mdAndUp } = useDisplay()
const showPassword = ref(false)

function logout() {
  session.logout()
  router.replace({ name: 'login' })
}
</script>

<template>
  <v-app-bar color="surface" flat height="72" class="site-header">
    <v-container class="d-flex align-center" style="max-width: 1100px">
      <BrandLogo :width="96" class="me-3" />
      <span class="site-divider me-3" />
      <span class="sub-title">{{ title }}</span>

      <v-spacer />

      <!-- 넓은 화면: 텍스트 메뉴 + 사용자 메뉴 -->
      <template v-if="mdAndUp">
        <v-btn
          v-for="item in items"
          :key="item.title"
          :to="item.to"
          variant="text"
          class="nav-link"
        >
          {{ item.title }}
        </v-btn>
        <v-menu>
          <template #activator="{ props }">
            <v-btn v-bind="props" variant="text" class="ms-2" :append-icon="mdiChevronDown">
              {{ session.user?.name }}
            </v-btn>
          </template>
          <v-list density="compact" min-width="200">
            <v-list-item
              :title="session.user?.name"
              :subtitle="`${badge} · ${session.user?.loginId}`"
            />
            <v-divider />
            <v-list-item
              :prepend-icon="mdiLock"
              title="비밀번호 변경"
              @click="showPassword = true"
            />
            <v-list-item :prepend-icon="mdiLogout" title="로그아웃" @click="logout" />
          </v-list>
        </v-menu>
      </template>

      <!-- 좁은 화면: 햄버거 버튼 하나에 모두 담는다 -->
      <v-menu v-else>
        <template #activator="{ props }">
          <v-btn v-bind="props" icon variant="text" aria-label="메뉴">
            <v-icon :icon="mdiMenu" />
          </v-btn>
        </template>
        <v-list density="comfortable" min-width="220">
          <v-list-item
            :title="session.user?.name"
            :subtitle="`${badge} · ${session.user?.loginId}`"
          />
          <v-divider />
          <v-list-item v-for="item in items" :key="item.title" :to="item.to" :title="item.title" />
          <v-divider />
          <v-list-item :prepend-icon="mdiLock" title="비밀번호 변경" @click="showPassword = true" />
          <v-list-item :prepend-icon="mdiLogout" title="로그아웃" @click="logout" />
        </v-list>
      </v-menu>
    </v-container>
  </v-app-bar>

  <v-main>
    <v-container class="py-8" style="max-width: 1100px">
      <RouterView />
    </v-container>
  </v-main>

  <PasswordDialog v-model="showPassword" />
</template>
