<script setup lang="ts">
import { computed } from 'vue'

// 시대인재 로고. 원본(225x225)은 가장자리 여백이 크고 글자가 검정이라서,
// 흰 배경 위에 여백을 잘라낸 부분만 보여 준다 (어느 배경색 위에서도 글자가 보이게).
// width 만 정하면 비율은 원본 그대로 유지된다 (늘리거나 색을 바꾸지 않는다).
const props = withDefaults(defineProps<{ width?: number }>(), { width: 96 })

// 원본에서 로고가 있는 영역(px)
const CROP = { x: 15, y: 77, w: 195, h: 70 }
const SIZE = 225

const scale = computed(() => props.width / CROP.w)
const boxStyle = computed(() => ({
  width: `${props.width}px`,
  height: `${CROP.h * scale.value}px`,
}))
const imgStyle = computed(() => ({
  width: `${SIZE * scale.value}px`,
  height: `${SIZE * scale.value}px`,
  left: `${-CROP.x * scale.value}px`,
  top: `${-CROP.y * scale.value}px`,
}))
</script>

<template>
  <div class="brand-logo" :style="boxStyle" role="img" aria-label="시대인재">
    <img src="/logo.png" alt="" :style="imgStyle" />
  </div>
</template>

<style scoped>
.brand-logo {
  position: relative;
  overflow: hidden;
  background: #fff;
  flex: none;
}
.brand-logo img {
  position: absolute;
  max-width: none;
  user-select: none;
}
</style>
