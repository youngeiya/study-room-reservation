/** 날짜는 JSON에 그대로 저장되도록 ISO 8601(UTC) 문자열로 다룬다. */
export interface StudyRoom {
  id: number;
  /**
   * 낙관적 락용 버전 (수정될 때마다 +1).
   * 자습실은 "신청들의 묶음"의 대표 행(Aggregate Root)이라, 신청을 만들거나 바꿀 때도 이 행의 version 을 올려서
   * 정원·중복 같은 여러 행에 걸친 규칙이 동시 요청에서 깨지지 않게 한다.
   */
  version: number;
  /** 과제 필수 필드는 아니지만, 화면에서 자습실을 구분하기 위해 추가한 필드 */
  name: string;
  maxPersonnel: number;
  /**
   * 현재 신청 인원(취소 제외). 저장해 두는 값이다.
   * 반드시 VisitService.changeCount 한 곳에서만 바꾼다: 신청(ACTIVE)될 때 +1, 취소될 때 -1.
   * 신청 상태 변경과 같은 트랜잭션에서 갱신되고, 이 행의 version 으로 동시 신청이 충돌 감지된다.
   */
  currentCount: number;
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export const STUDY_ROOM_COLLECTION = 'studyRooms';
export const STUDY_ROOM_REPOSITORY = Symbol('STUDY_ROOM_REPOSITORY');
