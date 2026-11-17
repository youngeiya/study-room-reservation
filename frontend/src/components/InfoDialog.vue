<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { mdiClockOutline, mdiMapMarkerOutline } from '@mdi/js'
import { api } from '@/api'
import { HALLS, INTRO } from '@/config/academy'
import { hoursLabel, isOpenNow } from '@/utils/openingHours'

// 이용 안내 · 오시는 길 창. 관 정보는 config/academy.ts 에서 가져오고, 예약 가능 기간은 서버 정책 값을 쓴다.
const open = defineModel<boolean>({ required: true })
const tab = ref<'guide' | 'halls'>('guide')
const maxDaysAhead = ref(3)

// 창을 열 때마다 최신 예약 가능 기간을 가져오고 지금 운영 여부를 다시 계산한다
const now = ref(new Date())
watch(open, async (isOpen) => {
  if (!isOpen) return
  now.value = new Date()
  try {
    maxDaysAhead.value = (await api.getBookingPolicy()).maxDaysAhead
  } catch {
    // 안내 창이라 실패해도 기본값(3일)으로 보여 준다
  }
})

const halls = computed(() => HALLS.map((h) => ({ ...h, open: isOpenNow(h, now.value) })))

const rules = computed(() => [
  `방문은 지금부터 ${maxDaysAhead.value}일 이내의 시간만 미리 신청할 수 있어요.`,
  '한 학생은 하루(한국 시간)에 한 건만 신청할 수 있어요. 날짜가 다르면 따로 신청할 수 있어요.',
  '자습실마다 정원이 있어서, 정원이 차면 신청할 수 없어요. 취소하면 그 자리에 다른 학생이 신청할 수 있어요.',
  '신청한 시간은 시간 수정으로 바꿀 수 있고, 가지 못하게 되면 미리 취소해 주세요.',
  '재원 중인 학생만 신청할 수 있어요. 휴원·퇴원 학생은 신청이 제한돼요.',
])
</script>

<template>
  <v-dialog v-model="open" max-width="720" scrollable>
    <v-card title="이용 안내 · 오시는 길">
      <!-- 창이 낮아져도 탭이 찌그러지지 않게 크기를 고정한다 -->
      <v-tabs v-model="tab" color="primary" class="px-2" style="flex: none; min-height: 48px">
        <v-tab value="guide">이용 안내</v-tab>
        <v-tab value="halls">오시는 길</v-tab>
      </v-tabs>
      <v-divider />

      <v-card-text style="max-height: 520px">
        <v-window v-model="tab">
          <!-- 이용 안내 -->
          <v-window-item value="guide">
            <p class="mb-4">{{ INTRO }}</p>
            <div class="text-subtitle-2 mb-2">이용 규칙</div>
            <ul class="ps-5">
              <li v-for="rule in rules" :key="rule" class="mb-2">{{ rule }}</li>
            </ul>
            <v-alert type="info" variant="tonal" density="compact" class="mt-4">
              관별 운영 시간과 위치는 <strong>오시는 길</strong> 탭에서 확인하세요.
            </v-alert>
          </v-window-item>

          <!-- 오시는 길: 관별 주소·운영 시간 (시연용 가상 정보) -->
          <v-window-item value="halls">
            <v-card v-for="b in halls" :key="b.short" variant="outlined" class="mb-3 pa-4">
              <div class="d-flex align-center mb-2">
                <span class="text-subtitle-1 font-weight-bold">{{ b.short }}</span>
                <v-chip
                  v-if="b.open !== null"
                  :color="b.open ? 'success' : 'grey'"
                  size="x-small"
                  variant="tonal"
                  class="ms-2"
                >
                  {{ b.open ? '운영 중' : '운영 종료' }}
                </v-chip>
              </div>
              <div class="text-body-2 text-medium-emphasis mb-2">{{ b.name }}</div>

              <div class="d-flex align-start mb-1">
                <v-icon :icon="mdiMapMarkerOutline" size="18" class="me-2 mt-1" />
                <div>
                  {{ b.address }}
                  <div v-if="b.detail" class="text-caption text-medium-emphasis">
                    {{ b.detail }}
                  </div>
                </div>
              </div>
              <div class="d-flex align-center">
                <v-icon :icon="mdiClockOutline" size="18" class="me-2" />
                <span :class="b.hours ? '' : 'text-medium-emphasis'">{{
                  hoursLabel(b.hours)
                }}</span>
              </div>
            </v-card>
            <div class="text-caption text-medium-emphasis">
              운영 중 표시는 한국 시간 기준의 운영 시간으로 계산한 값이에요. 이름과 주소는
              시연용으로 만든 가상의 정보예요.
            </div>
          </v-window-item>
        </v-window>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="open = false">닫기</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
