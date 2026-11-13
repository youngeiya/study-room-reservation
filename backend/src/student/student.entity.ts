/** 날짜는 JSON에 그대로 저장되도록 ISO 8601 문자열로 다룬다. */
export interface Student {
  id: number;
  name: string;
  phone: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export const STUDENT_COLLECTION = 'students';
export const STUDENT_REPOSITORY = Symbol('STUDENT_REPOSITORY');
