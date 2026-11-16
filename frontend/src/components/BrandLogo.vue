<script setup lang="ts">
// 서비스 로고(부엉이 일러스트, public/logo.png). 원본 비율(389x400)을 그대로 유지하고 높이만 정한다.
withDefaults(defineProps<{ height?: number }>(), { height: 44 })
</script>

<template>
  <img
    src="/logo.png"
    alt="부엉이 라이브러리"
    class="brand-logo"
    :style="{ height: `${height}px` }"
    draggable="false"
  />
</template>

<style scoped>
.brand-logo {
  width: auto;
  flex: none;
  user-select: none;
}
</style>
