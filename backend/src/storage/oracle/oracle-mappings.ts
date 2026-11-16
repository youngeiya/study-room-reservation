/**
 * 컬렉션(코드의 이름) ↔ Oracle 테이블·컬럼 대응표. 테이블 정의는 db/oracle/02_schema.sql 과 같아야 한다.
 * 엔티티(도메인) 코드는 Oracle 을 모르게 두고, 매핑은 이 파일에만 모아 둔다.
 */
export type ColumnType = 'string' | 'number' | 'timestamp';

export interface ColumnSpec {
  /** 엔티티의 프로퍼티 이름 (camelCase) */
  prop: string;
  /** 테이블의 컬럼 이름 (snake_case) */
  column: string;
  type: ColumnType;
}

export interface TableSpec {
  collection: string;
  table: string;
  /** version 컬럼(낙관적 락)이 있는가. 이력 테이블은 추가만 하므로 없다. */
  versioned: boolean;
  /** id, version 을 뺀 컬럼들 */
  columns: ColumnSpec[];
  /**
   * 유니크 제약(인덱스) 이름(대문자) → 위반했을 때 UniqueViolationError 로 알려 줄 프로퍼티.
   * 여기에 없는 유니크 위반은 "동시 요청과의 충돌"로 보고 트랜잭션을 처음부터 다시 실행한다.
   */
  uniques: Record<string, string>;
}

const s = (prop: string, column: string): ColumnSpec => ({
  prop,
  column,
  type: 'string',
});
const n = (prop: string, column: string): ColumnSpec => ({
  prop,
  column,
  type: 'number',
});
const t = (prop: string, column: string): ColumnSpec => ({
  prop,
  column,
  type: 'timestamp',
});

const TABLES: TableSpec[] = [
  {
    collection: 'students',
    table: 'STUDENT',
    versioned: true,
    columns: [
      s('name', 'name'),
      s('phone', 'phone'),
      s('studentNo', 'student_no'),
      s('guardianPhone', 'guardian_phone'),
      s('grade', 'grade'),
      s('memo', 'memo'),
      s('status', 'status'),
      t('createdAt', 'created_at'),
      t('updatedAt', 'updated_at'),
      t('deletedAt', 'deleted_at'),
    ],
    uniques: { UQ_STUDENT_NO_ACTIVE: 'studentNo' },
  },
  {
    collection: 'studyRooms',
    table: 'STUDY_ROOM',
    versioned: true,
    columns: [
      s('name', 'name'),
      n('maxPersonnel', 'max_personnel'),
      n('currentCount', 'current_count'),
      t('startDate', 'start_date'),
      t('endDate', 'end_date'),
      t('createdAt', 'created_at'),
      t('updatedAt', 'updated_at'),
      t('deletedAt', 'deleted_at'),
    ],
    uniques: {},
  },
  {
    collection: 'visitReservations',
    table: 'VISIT_RESERVATION',
    versioned: true,
    columns: [
      n('roomId', 'room_id'),
      n('studentId', 'student_id'),
      t('visitAt', 'visit_at'),
      s('status', 'status'),
      t('createdAt', 'created_at'),
      t('updatedAt', 'updated_at'),
    ],
    uniques: {},
  },
  {
    collection: 'visitHistories',
    table: 'VISIT_HISTORY',
    versioned: false,
    columns: [
      n('reservationId', 'reservation_id'),
      n('roomId', 'room_id'),
      n('studentId', 'student_id'),
      s('action', 'action'),
      t('beforeVisitAt', 'before_visit_at'),
      t('afterVisitAt', 'after_visit_at'),
      t('createdAt', 'created_at'),
    ],
    uniques: {},
  },
];

export function tableSpecOf(collection: string): TableSpec {
  const found = TABLES.find((x) => x.collection === collection);
  if (!found) throw new Error(`Oracle 매핑이 없는 컬렉션입니다: ${collection}`);
  return found;
}
