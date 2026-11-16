<script setup lang="ts">
import AppShell from '@/components/AppShell.vue'

// 강사 화면: 자습실 관리와 학생 관리
const items = [
  { title: '자습실 관리', to: { name: 'instructor-rooms' } },
  { title: '학생 관리', to: { name: 'instructor-students' } },
]
</script>

<template>
  <AppShell title="강사 관리" badge="강사" :items="items" />
</template>
