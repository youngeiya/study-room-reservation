<script setup lang="ts">
import AppShell from '@/components/AppShell.vue'

// 학생 화면: 자습실 신청과 내 신청
const items = [
  { title: '자습실 신청', to: { name: 'student-rooms' } },
  { title: '내 신청', to: { name: 'student-my-visits' } },
]
</script>

<template>
  <AppShell title="자습실 예약" badge="학생" :items="items" />
</template>
