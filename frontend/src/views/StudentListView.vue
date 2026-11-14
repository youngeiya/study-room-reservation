<script setup lang="ts">
import { useSessionStore } from '@/stores/session'

// FR-STD-01: 학생 목록. 헤더에서 이미 불러온 목록을 그대로 보여 준다.
const session = useSessionStore()
</script>

<template>
  <section class="panel">
    <h1>학생 목록</h1>
    <p v-if="session.students.length === 0" class="muted">등록된 학생이 없습니다.</p>
    <table v-else>
      <thead>
        <tr>
          <th>번호</th>
          <th>이름</th>
          <th>연락처</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="s in session.students" :key="s.id">
          <td>{{ s.id }}</td>
          <td>{{ s.name }}</td>
          <td>{{ s.phone }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
