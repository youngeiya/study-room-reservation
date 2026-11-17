// 부엉이 라이브러리 관(건물) 정보 (이용 안내 · 오시는 길). 안내 내용을 바꾸려면 이 파일만 고치면 된다.
// ※ 이름·주소는 시연용으로 임의로 만든 가상의 정보이며, 실제 장소와 관계없다.

import type { HallCode } from '@/api/types'

export interface Hall {
  /** 서버가 쓰는 관 코드 (자습실의 hall 값). 서버의 HALL_CODES 와 같아야 한다. */
  code: HallCode
  /** 짧은 이름 (탭·배지에 표시) */
  short: string
  /** 정식 이름 */
  name: string
  address: string
  /** 건물·층 등 위치 설명 (선택) */
  detail?: string
  /** 운영 시간 "HH:MM~HH:MM" (매일). "00:00~24:00" 이면 24시간 운영. 모르면 null */
  hours: string | null
}

export const HALLS: Hall[] = [
  {
    code: 'MAIN',
    short: '본관',
    name: '부엉이 라이브러리 본관',
    address: '서울특별시 올빼미구 지혜로 12',
    detail: '부엉빌딩 3~5층',
    hours: '00:00~24:00',
  },
  {
    code: 'ANNEX',
    short: '별관',
    name: '부엉이 라이브러리 별관',
    address: '서울특별시 올빼미구 지혜로 18',
    detail: '둥지빌딩 2층',
    hours: '00:00~24:00',
  },
  {
    code: 'EAST',
    short: '동관',
    name: '부엉이 라이브러리 동관',
    address: '서울특별시 올빼미구 동쪽숲길 7',
    detail: '새벽타워 6층',
    hours: '00:00~24:00',
  },
  {
    code: 'WEST',
    short: '서관',
    name: '부엉이 라이브러리 서관',
    address: '서울특별시 올빼미구 서쪽숲길 25',
    detail: '노을빌딩 4층',
    hours: '00:00~24:00',
  },
]

/** 코드로 관을 찾는다. 모르는 코드면 undefined */
export const hallOf = (code: HallCode | null | undefined) => HALLS.find((h) => h.code === code)

export const INTRO =
  '부엉이 라이브러리는 본관·별관·동관·서관 4개 관에서 운영하는 학원 연계 독서실(자습실)입니다. 이 시스템에서 관별 자습실의 정원을 확인하고 방문 시간을 미리 신청할 수 있어요.'
