<script setup lang="ts">
import { mdiAccountGroup, mdiAccountTie, mdiBookOpenPageVariant } from '@mdi/js'
import AppShell from '@/components/AppShell.vue'

// 강사 화면: 자습실 관리, 학생 관리, 강사 관리
const items = [
  { title: '자습실 관리', icon: mdiBookOpenPageVariant, to: { name: 'instructor-rooms' } },
  { title: '학생 관리', icon: mdiAccountGroup, to: { name: 'instructor-students' } },
  { title: '강사 관리', icon: mdiAccountTie, to: { name: 'instructor-instructors' } },
]
</script>

<template>
  <AppShell title="관리자" badge="강사" :items="items" />
</template>
