<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<template>
  <!-- 화면 틀(상단바·메뉴)은 로그인 후 역할별 레이아웃(src/layouts)이 담당한다 -->
  <v-app>
    <RouterView />
  </v-app>
</template>
