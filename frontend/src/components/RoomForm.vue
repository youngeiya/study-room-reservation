<script setup lang="ts">
import { ref } from 'vue'
import type { SubmitEventPromise } from 'vuetify'
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

// 시작 < 종료 같은 업무 규칙은 서버가 최종 검사하고, 여기서는 빈 값·형식만 확인한다.
const required = (v: unknown) => (v !== '' && v !== null && v !== undefined) || '필수 입력입니다.'
const MAX_PERSONNEL = 500
const personnelRange = (v: number) =>
  (Number(v) >= 1 && Number(v) <= MAX_PERSONNEL) ||
  `1명 이상 ${MAX_PERSONNEL}명 이하로 입력해 주세요.`

async function onSubmit(event: SubmitEventPromise) {
  const { valid } = await event
  if (!valid) return
  emit('submit', {
    name: name.value.trim(),
    maxPersonnel: Number(maxPersonnel.value),
    startDate: localInputToIso(startDate.value),
    endDate: localInputToIso(endDate.value),
  })
}
</script>

<template>
  <v-form @submit.prevent="onSubmit">
    <v-row dense>
      <v-col cols="12" sm="8">
        <v-text-field v-model="name" label="이름" maxlength="50" :rules="[required]" />
      </v-col>
      <v-col cols="12" sm="4">
        <v-text-field
          v-model.number="maxPersonnel"
          label="최대 인원"
          type="number"
          min="1"
          :max="MAX_PERSONNEL"
          suffix="명"
          :rules="[required, personnelRange]"
        />
      </v-col>
      <v-col cols="12" sm="6">
        <v-text-field
          v-model="startDate"
          label="운영 시작"
          type="datetime-local"
          :rules="[required]"
        />
      </v-col>
      <v-col cols="12" sm="6">
        <v-text-field
          v-model="endDate"
          label="운영 종료"
          type="datetime-local"
          :rules="[required]"
        />
      </v-col>
    </v-row>
    <div class="d-flex justify-end">
      <v-btn type="submit" color="primary" :loading="busy">{{ submitLabel }}</v-btn>
    </div>
  </v-form>
</template>
