<script setup lang="ts">
import { ref } from 'vue'
import { RouterView, useRouter } from 'vue-router'
import { useDisplay } from 'vuetify'
import { mdiChevronDown, mdiInformationOutline, mdiLock, mdiLogout, mdiMenu } from '@mdi/js'
import BrandLogo from '@/components/BrandLogo.vue'
import HeaderStatus from '@/components/HeaderStatus.vue'
import InfoDialog from '@/components/InfoDialog.vue'
import PasswordDialog from '@/components/PasswordDialog.vue'
import TodayStatusPanel from '@/components/TodayStatusPanel.vue'
import { useSessionStore } from '@/stores/session'

/**
 * 로그인한 뒤의 공통 틀: 상단 헤더(로고·이름·사용자 메뉴), 왼쪽 사이드바(메뉴·오늘의 현황·내 정보), 본문.
 * 강사 화면과 학생 화면이 각자 제목·메뉴를 넘겨서 "서로 다른 화면"으로 보이게 한다.
 * 넓은 화면에서는 사이드바가 항상 보이고, 좁은 화면(모바일)에서는 햄버거 버튼으로 열고 닫는다.
 */
defineProps<{
  title: string
  badge: string
  items: { title: string; icon: string; to: { name: string } }[]
}>()

const router = useRouter()
const session = useSessionStore()
const { mdAndUp } = useDisplay()
const showPassword = ref(false)
const showInfo = ref(false) // 이용 안내 · 오시는 길 창
const drawer = ref(false) // 모바일에서만 의미가 있다 (넓은 화면에서는 항상 열려 있다)

// 사이드바(모바일에서는 서랍)의 "이용 안내" 버튼: 서랍을 닫고 안내 창을 연다
function openInfoFromDrawer() {
  drawer.value = false
  showInfo.value = true
}

function logout() {
  session.logout()
  router.replace({ name: 'login' })
}
</script>

<template>
  <v-app-bar color="surface" flat height="72" class="site-header">
    <v-container class="d-flex align-center" style="max-width: 1400px">
      <v-btn
        v-if="!mdAndUp"
        :icon="mdiMenu"
        variant="text"
        aria-label="메뉴"
        class="me-1"
        @click="drawer = !drawer"
      />
      <BrandLogo :height="46" class="me-2" />
      <span class="brand-name me-3">부엉이 라이브러리</span>
      <span class="site-divider me-3" />
      <span class="sub-title">{{ title }}</span>

      <v-spacer />

      <!-- 운영 상태 · 개인 현황 · 이용 안내 (넓은 화면에서만. 모바일은 사이드바에서 연다) -->
      <HeaderStatus v-if="mdAndUp" class="me-3" @open-info="showInfo = true" />

      <v-menu>
        <template #activator="{ props }">
          <v-btn v-bind="props" variant="text" :append-icon="mdiChevronDown">
            {{ session.user?.name }}
          </v-btn>
        </template>
        <v-list density="compact" min-width="200">
          <v-list-item
            :title="session.user?.name"
            :subtitle="`${badge} · ${session.user?.loginId}`"
          />
          <v-divider />
          <v-list-item :prepend-icon="mdiLock" title="비밀번호 변경" @click="showPassword = true" />
          <v-list-item :prepend-icon="mdiLogout" title="로그아웃" @click="logout" />
        </v-list>
      </v-menu>
    </v-container>
  </v-app-bar>

  <!-- 왼쪽 사이드바: 넓은 화면에서는 항상 보이고, 모바일에서는 햄버거로 연다 -->
  <v-navigation-drawer
    :model-value="mdAndUp ? true : drawer"
    :permanent="mdAndUp"
    :temporary="!mdAndUp"
    @update:model-value="drawer = $event"
    width="268"
    class="side-bar"
  >
    <div class="side-label">MENU</div>
    <v-list nav class="side-nav px-3">
      <v-list-item
        v-for="item in items"
        :key="item.title"
        :to="item.to"
        :prepend-icon="item.icon"
        :title="item.title"
        rounded="lg"
        @click="drawer = false"
      />
    </v-list>

    <div class="px-3">
      <v-btn
        block
        variant="text"
        :prepend-icon="mdiInformationOutline"
        class="justify-start"
        @click="openInfoFromDrawer"
      >
        이용 안내 · 오시는 길
      </v-btn>
    </div>

    <TodayStatusPanel />

    <template #append>
      <div class="side-user">
        <div class="d-flex align-center mb-3">
          <v-avatar color="primary" size="36" class="me-3">
            <span class="text-body-2 font-weight-bold">{{ session.user?.name?.slice(0, 1) }}</span>
          </v-avatar>
          <div class="min-width-0">
            <div class="side-user-name">{{ session.user?.name }}</div>
            <div class="side-user-sub">{{ badge }} · {{ session.user?.loginId }}</div>
          </div>
        </div>
        <v-btn block variant="outlined" :prepend-icon="mdiLogout" @click="logout">로그아웃</v-btn>
      </div>
    </template>
  </v-navigation-drawer>

  <v-main>
    <v-container class="py-8" style="max-width: 1100px">
      <RouterView />
    </v-container>
  </v-main>

  <PasswordDialog v-model="showPassword" />
  <InfoDialog v-model="showInfo" />
</template>
