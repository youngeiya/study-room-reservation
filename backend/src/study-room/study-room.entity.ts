/** 날짜는 JSON에 그대로 저장되도록 ISO 8601(UTC) 문자열로 다룬다. */
export interface StudyRoom {
  id: number;
  /** 과제 필수 필드는 아니지만, 화면에서 자습실을 구분하기 위해 추가한 필드 */
  name: string;
  maxPersonnel: number;
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** 응답용: 저장하지 않고 ACTIVE 신청 수를 세어 계산한 값을 덧붙인다. */
export type StudyRoomView = StudyRoom & { currentPersonnel: number };

export const STUDY_ROOM_COLLECTION = 'studyRooms';
export const STUDY_ROOM_REPOSITORY = Symbol('STUDY_ROOM_REPOSITORY');
