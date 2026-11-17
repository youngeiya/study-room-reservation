// 부엉이 라이브러리 지점 정보 (이용 안내 · 오시는 길). 안내 내용을 바꾸려면 이 파일만 고치면 된다.

import type { BranchCode } from '@/api/types'

export interface Branch {
  /** 서버가 쓰는 지점 코드 (자습실의 branch 값). 서버의 BRANCH_CODES 와 같아야 한다. */
  code: BranchCode
  /** 짧은 이름 (탭·배지에 표시) */
  short: string
  /** 정식 이름 */
  name: string
  address: string
  /** 건물·층 등 위치 설명 (선택) */
  detail?: string
  /** 운영 시간 "HH:MM~HH:MM" (매일). 모르면 null */
  hours: string | null
}

export const BRANCHES: Branch[] = [
  {
    code: 'H',
    short: 'H관',
    name: '시대인재 H관 부엉이 라이브러리 독서실',
    address: '서울 강남구 도곡로 453',
    detail: '목빌딩',
    hours: '10:00~22:00',
  },
  {
    code: 'S',
    short: 'S관',
    name: '시대인재 S관 부엉이 라이브러리 독서실',
    address: '서울 강남구 삼성로57길 7',
    detail: '더로빌딩',
    hours: '08:00~22:00',
  },
  {
    code: 'MOKDONG',
    short: '목동',
    name: '목동 시대인재 부엉이 라이브러리 독서실',
    address: '서울 양천구 목동서로 225 (목동)',
    detail: '7층 (예술인회관)',
    hours: '08:00~22:00',
  },
  {
    code: 'BANPO',
    short: '반포',
    name: '시대인재 반포 부엉이 라이브러리 독서실',
    address: '서울 서초구 신반포로 165',
    detail: '반포쇼핑타운 2동 5층 504~509호',
    hours: null, // 운영 시간 정보가 없어 "문의"로 안내한다
  },
]

/** 코드로 지점을 찾는다. 모르는 코드면 undefined */
export const branchOf = (code: BranchCode | null | undefined) =>
  BRANCHES.find((b) => b.code === code)

export const INTRO =
  '부엉이 라이브러리는 서울 4곳에서 운영하는 학원 연계 독서실(자습실)입니다. 이 시스템에서 자습실별 정원을 확인하고 방문 시간을 미리 신청할 수 있어요.'

/** 지도 앱으로 여는 링크 (주소로 검색) */
export const kakaoMapUrl = (b: Branch) =>
  `https://map.kakao.com/?q=${encodeURIComponent(b.address)}`
export const naverMapUrl = (b: Branch) =>
  `https://map.naver.com/p/search/${encodeURIComponent(b.address)}`
