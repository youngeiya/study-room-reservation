<script setup lang="ts">
import { mdiAccountGroup, mdiBookOpenPageVariant } from '@mdi/js'
import AppShell from '@/components/AppShell.vue'

// 강사 화면: 자습실 관리와 학생 관리 (인디고 계열의 "관리" 화면)
const items = [
  { title: '자습실 관리', icon: mdiBookOpenPageVariant, to: { name: 'instructor-rooms' } },
  { title: '학생 관리', icon: mdiAccountGroup, to: { name: 'instructor-students' } },
]
</script>

<template>
  <AppShell
    title="부엉이 라이브러리 · 강사 관리"
    badge="강사"
    color="deep-purple-darken-2"
    :items="items"
  />
</template>
