<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { useAction } from '@/composables/useAction'
import { useSessionStore } from '@/stores/session'
import type { Role } from '@/api/types'

const session = useSessionStore()
const route = useRoute()
const router = useRouter()
const { error, run } = useAction()

// 학생 목록은 "어떤 학생으로 볼지" 고르는 데 쓰이므로 앱이 뜰 때 한 번 불러온다.
onMounted(() => run(() => session.loadStudents()))

// 학생 전용 화면에서 강사로 바꾸는 식으로 역할이 바뀌면, 볼 수 없는 화면에서 목록으로 이동시킨다.
watch(
  () => session.role,
  () => {
    if (route.meta.role && route.meta.role !== session.role) router.replace({ name: 'rooms' })
  },
)

function onRoleChange(event: Event) {
  session.setRole((event.target as HTMLSelectElement).value as Role)
}

function onStudentChange(event: Event) {
  session.setStudent(Number((event.target as HTMLSelectElement).value))
}
</script>

<template>
  <header class="panel row" style="justify-content: space-between">
    <div class="row">
      <strong>자습실 예약</strong>
      <nav class="row">
        <RouterLink :to="{ name: 'rooms' }">자습실</RouterLink>
        <RouterLink v-if="session.isInstructor" :to="{ name: 'students' }">학생 목록</RouterLink>
        <RouterLink v-else :to="{ name: 'my-visits' }">내 신청</RouterLink>
      </nav>
    </div>

    <!-- 로그인 대신 역할(과 학생)을 고르는 영역 -->
    <div class="row">
      <label class="row muted">
        역할
        <select :value="session.role" @change="onRoleChange">
          <option value="INSTRUCTOR">강사</option>
          <option value="STUDENT">학생</option>
        </select>
      </label>
      <label v-if="!session.isInstructor" class="row muted">
        학생
        <select :value="session.studentId ?? ''" @change="onStudentChange">
          <option v-for="s in session.students" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
      </label>
    </div>
  </header>

  <p v-if="error" class="error">{{ error }}</p>

  <!-- 역할·학생이 바뀌면 화면을 새로 만들어 서버 데이터를 다시 불러오게 한다 -->
  <RouterView :key="`${session.role}-${session.studentId}`" />
</template>
