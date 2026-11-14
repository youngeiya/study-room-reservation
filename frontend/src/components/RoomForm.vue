<script setup lang="ts">
import { ref } from 'vue'
import type { RoomPayload, StudyRoom } from '@/api/types'
import { isoToLocalInput, localInputToIso } from '@/utils/datetime'

// 등록과 수정이 같은 폼을 쓴다. initial 이 있으면 수정, 없으면 등록.
const props = defineProps<{ initial?: StudyRoom; submitLabel: string; busy: boolean }>()
const emit = defineEmits<{ submit: [payload: RoomPayload] }>()

const name = ref(props.initial?.name ?? '')
const maxPersonnel = ref(props.initial?.maxPersonnel ?? 10)
// <input type="datetime-local"> 은 내 시간대 문자열을 쓰므로 서버 값(UTC)을 변환해서 보여 준다.
const startDate = ref(props.initial ? isoToLocalInput(props.initial.startDate) : '')
const endDate = ref(props.initial ? isoToLocalInput(props.initial.endDate) : '')

function onSubmit() {
  emit('submit', {
    name: name.value.trim(),
    maxPersonnel: maxPersonnel.value,
    startDate: localInputToIso(startDate.value),
    endDate: localInputToIso(endDate.value),
  })
}
</script>

<template>
  <!-- 시작 < 종료 같은 업무 규칙은 서버가 최종 검사하고, 여기서는 빈 값만 막는다 -->
  <form class="row" @submit.prevent="onSubmit">
    <label class="field">
      이름
      <input v-model="name" required maxlength="50" />
    </label>
    <label class="field">
      최대 인원
      <input v-model.number="maxPersonnel" type="number" min="1" required style="width: 90px" />
    </label>
    <label class="field">
      운영 시작
      <input v-model="startDate" type="datetime-local" required />
    </label>
    <label class="field">
      운영 종료
      <input v-model="endDate" type="datetime-local" required />
    </label>
    <button type="submit" :disabled="busy" style="align-self: flex-end">{{ submitLabel }}</button>
  </form>
</template>
