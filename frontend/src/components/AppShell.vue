<script setup lang="ts">
import { ref } from 'vue'
import { RouterView, useRouter } from 'vue-router'
import { useDisplay } from 'vuetify'
import { mdiAccountCircle, mdiLock, mdiLogout, mdiOwl } from '@mdi/js'
import PasswordDialog from '@/components/PasswordDialog.vue'
import { useSessionStore } from '@/stores/session'

/**
 * 로그인한 뒤의 공통 틀: 상단바, 왼쪽 메뉴, 사용자 메뉴(비밀번호 변경·로그아웃).
 * 강사 화면과 학생 화면이 각자 제목·색·메뉴를 넘겨서 "서로 다른 화면"으로 보이게 한다.
 */
defineProps<{
  title: string
  badge: string
  color: string
  items: { title: string; icon: string; to: { name: string } }[]
}>()

const router = useRouter()
const session = useSessionStore()
const { mdAndUp } = useDisplay()

// null 이면 Vuetify 가 화면 크기에 맞춰 정한다: 넓은 화면에서는 열려 있고, 좁은 화면(모바일)에서는 닫혀 있다.
const drawer = ref<boolean | null>(null)
const showPassword = ref(false)

// 메뉴를 눌러 이동할 때, 모바일에서만 메뉴를 닫는다 (넓은 화면에서는 계속 보여 준다)
function closeOnMobile() {
  if (!mdAndUp.value) drawer.value = false
}

function logout() {
  session.logout()
  router.replace({ name: 'login' })
}
</script>

<template>
  <v-app-bar :color="color" flat>
    <v-app-bar-nav-icon v-if="!mdAndUp" @click="drawer = !drawer" />
    <v-icon :icon="mdiOwl" size="28" class="ms-3 me-2" />
    <v-app-bar-title class="font-weight-bold">{{ title }}</v-app-bar-title>
    <v-spacer />

    <v-menu>
      <template #activator="{ props }">
        <v-btn v-bind="props" variant="tonal" :prepend-icon="mdiAccountCircle" class="me-2">
          {{ session.user?.name }}
        </v-btn>
      </template>
      <v-list density="compact">
        <v-list-item
          :title="session.user?.name"
          :subtitle="`${badge} · ${session.user?.loginId}`"
        />
        <v-divider />
        <v-list-item :prepend-icon="mdiLock" title="비밀번호 변경" @click="showPassword = true" />
        <v-list-item :prepend-icon="mdiLogout" title="로그아웃" @click="logout" />
      </v-list>
    </v-menu>
  </v-app-bar>

  <v-navigation-drawer v-model="drawer" width="240">
    <div class="pa-4">
      <v-chip :color="color" variant="flat" size="small">{{ badge }}</v-chip>
      <div class="text-subtitle-1 font-weight-bold mt-2">{{ session.user?.name }}</div>
      <div class="text-caption text-medium-emphasis">{{ session.user?.loginId }}</div>
    </div>
    <v-divider />
    <v-list nav :color="color" class="pa-2">
      <v-list-item
        v-for="item in items"
        :key="item.title"
        :to="item.to"
        :prepend-icon="item.icon"
        :title="item.title"
        rounded="lg"
        @click="closeOnMobile"
      />
    </v-list>
    <template #append>
      <div class="pa-3">
        <v-btn block variant="tonal" :prepend-icon="mdiLogout" @click="logout">로그아웃</v-btn>
      </div>
    </template>
  </v-navigation-drawer>

  <v-main>
    <v-container style="max-width: 1100px">
      <RouterView />
    </v-container>
  </v-main>

  <PasswordDialog v-model="showPassword" />
</template>
