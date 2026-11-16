<script setup lang="ts">
import { mdiImageOff } from '@mdi/js'
import type { StudyRoom } from '@/api/types'
import { roomImageUrl } from '@/utils/room'

// 자습실 사진. 사진이 없거나 불러오지 못하면(저장소에 파일이 없는 경우 등) 회색 자리표시자를 보여 준다.
defineProps<{ room: Pick<StudyRoom, 'id' | 'imageKey'>; height: number }>()
</script>

<template>
  <v-img v-if="roomImageUrl(room)" :src="roomImageUrl(room)!" :height="height" cover>
    <template #error>
      <div
        class="d-flex align-center justify-center bg-grey-lighten-3 text-medium-emphasis"
        :style="{ height: `${height}px` }"
      >
        <v-icon :icon="mdiImageOff" size="40" />
      </div>
    </template>
  </v-img>
  <div
    v-else
    class="d-flex align-center justify-center bg-grey-lighten-3 text-medium-emphasis"
    :style="{ height: `${height}px` }"
  >
    <v-icon :icon="mdiImageOff" size="40" />
  </div>
</template>
