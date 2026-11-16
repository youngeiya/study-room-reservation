<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { useDisplay } from 'vuetify'
import { mdiAccountGroup, mdiBookOpenPageVariant, mdiCalendarCheck, mdiOwl } from '@mdi/js'
import { useAction } from '@/composables/useAction'
import { useSessionStore } from '@/stores/session'
import type { Role } from '@/api/types'

const session = useSessionStore()
const route = useRoute()
const router = useRouter()
const { error, run } = useAction()
const { mdAndUp } = useDisplay()

// null 이면 Vuetify 가 화면 크기에 맞춰 정한다: 넓은 화면에서는 열려 있고, 좁은 화면(모바일)에서는 닫혀 있다.
// 햄버거 버튼으로 열고 닫을 수 있다.
const drawer = ref<boolean | null>(null)

// 메뉴를 눌러 이동할 때, 모바일에서만 메뉴를 닫는다 (넓은 화면에서는 계속 보여 준다)
function closeOnMobile() {
  if (!mdAndUp.value) drawer.value = false
}

// 학생 목록은 "어떤 학생으로 볼지" 고르는 데 쓰이므로 앱이 뜰 때 한 번 불러온다.
onMounted(() => run(() => session.loadStudents()))

// 학생 전용 화면에서 강사로 바꾸는 식으로 역할이 바뀌면, 볼 수 없는 화면에서 목록으로 이동시킨다.
watch(
  () => session.role,
  () => {
    if (route.meta.role && route.meta.role !== session.role) router.replace({ name: 'rooms' })
  },
)

function onRoleChange(value: Role | null) {
  if (value) session.setRole(value)
}

function onStudentChange(value: number | null) {
  if (value !== null) session.setStudent(value)
}
</script>

<template>
  <v-app>
    <v-app-bar color="primary" flat>
      <v-app-bar-nav-icon v-if="!mdAndUp" @click="drawer = !drawer" />
      <v-icon :icon="mdiOwl" size="28" class="ms-3 me-2" />
      <v-app-bar-title class="font-weight-bold">부엉이 라이브러리 자습실 예약</v-app-bar-title>
      <v-spacer />
      <!-- 지금 누구로 보고 있는지 한눈에 -->
      <v-chip variant="flat" color="white" class="me-4">
        {{ session.isInstructor ? '강사' : `학생 · ${session.currentStudent?.name ?? '-'}` }}
      </v-chip>
    </v-app-bar>

    <v-navigation-drawer v-model="drawer" width="260">
      <!-- 로그인 대신 역할(과 학생)을 고르는 영역 -->
      <div class="pa-4">
        <div class="text-caption text-medium-emphasis mb-2">보기 전환</div>
        <v-btn-toggle
          :model-value="session.role"
          mandatory
          divided
          color="primary"
          variant="outlined"
          class="w-100 mb-3"
          @update:model-value="onRoleChange"
        >
          <v-btn value="INSTRUCTOR" class="flex-grow-1">강사</v-btn>
          <v-btn value="STUDENT" class="flex-grow-1">학생</v-btn>
        </v-btn-toggle>
        <v-select
          v-if="!session.isInstructor"
          label="학생 선택"
          :items="session.students"
          item-title="name"
          item-value="id"
          :model-value="session.studentId"
          hide-details
          @update:model-value="onStudentChange"
        />
      </div>

      <v-divider />

      <v-list nav color="primary" class="pa-2">
        <v-list-item
          :to="{ name: 'rooms' }"
          :prepend-icon="mdiBookOpenPageVariant"
          title="자습실 목록"
          rounded="lg"
          @click="closeOnMobile"
        />
        <v-list-item
          v-if="session.isInstructor"
          :to="{ name: 'students' }"
          :prepend-icon="mdiAccountGroup"
          title="학생 목록"
          rounded="lg"
          @click="closeOnMobile"
        />
        <v-list-item
          v-else
          :to="{ name: 'my-visits' }"
          :prepend-icon="mdiCalendarCheck"
          title="내 신청"
          rounded="lg"
          @click="closeOnMobile"
        />
      </v-list>
    </v-navigation-drawer>

    <v-main>
      <v-container style="max-width: 1100px">
        <v-alert v-if="error" type="error" variant="tonal" class="mb-4">{{ error }}</v-alert>

        <!-- 역할·학생이 바뀌면 화면을 새로 만들어 서버 데이터를 다시 불러오게 한다 -->
        <RouterView :key="`${session.role}-${session.studentId}`" />
      </v-container>
    </v-main>
  </v-app>
</template>
