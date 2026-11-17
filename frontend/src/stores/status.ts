import { ref } from 'vue'
import { defineStore } from 'pinia'

/**
 * 상단바의 현황(내 다음 방문, 오늘 신청 인원)을 "지금 다시 불러와야 한다"고 알리는 신호.
 * 신청·시간 수정·취소를 한 화면이 bump() 하면, 상단바가 알아서 다시 불러온다 (화면끼리 서로 몰라도 된다).
 */
export const useStatusStore = defineStore('status', () => {
  const version = ref(0)
  function bump() {
    version.value += 1
  }
  return { version, bump }
})
