-- =====================================================================
-- 02. 테이블 생성   ※ STUDYROOM 계정으로 실행
--   JSON 파일 DB(backend/data/db.json)의 구조와 규칙을 Oracle 로 옮긴 것.
--   - PK 는 IDENTITY(자동 증가)
--   - version 컬럼: 낙관적 락.  UPDATE ... WHERE id = :id AND version = :version  후
--                   영향 행이 0 이면 "다른 요청이 먼저 바꿈" = 충돌 → 처음부터 재시도
--   - 시각은 UTC 로 저장 (TIMESTAMP(3), 기본값 SYS_EXTRACT_UTC(SYSTIMESTAMP))
--   - 삭제는 deleted_at 으로 하는 Soft Delete
--   - 업무 규칙의 최종 방어선을 제약조건(CHECK / UNIQUE)으로 둔다
-- =====================================================================
WHENEVER SQLERROR EXIT FAILURE ROLLBACK
SET DEFINE OFF

-- ---------------------------------------------------------------------
-- 학생
-- ---------------------------------------------------------------------
CREATE TABLE student (
  id              NUMBER GENERATED ALWAYS AS IDENTITY,
  version         NUMBER(10)          DEFAULT 0          NOT NULL,
  name            VARCHAR2(30 CHAR)                      NOT NULL,
  phone           VARCHAR2(20)                           NOT NULL,
  student_no      VARCHAR2(20),
  password_hash   VARCHAR2(200),
  guardian_phone  VARCHAR2(20),
  grade           VARCHAR2(10 CHAR),
  memo            VARCHAR2(200 CHAR),
  status          VARCHAR2(10)        DEFAULT 'ENROLLED' NOT NULL,
  created_at      TIMESTAMP(3)        DEFAULT SYS_EXTRACT_UTC(SYSTIMESTAMP) NOT NULL,
  updated_at      TIMESTAMP(3)        DEFAULT SYS_EXTRACT_UTC(SYSTIMESTAMP) NOT NULL,
  deleted_at      TIMESTAMP(3),
  CONSTRAINT pk_student PRIMARY KEY (id),
  CONSTRAINT ck_student_status CHECK (status IN ('ENROLLED', 'ON_LEAVE', 'WITHDRAWN'))
);

-- 학번은 "삭제되지 않은 학생끼리" 유일해야 한다 (삭제된 학생의 학번은 재사용 가능).
-- CASE 가 NULL 을 돌려주는 행(삭제된 학생, 학번 없는 학생)은 인덱스에 들어가지 않아 중복이어도 된다.
CREATE UNIQUE INDEX uq_student_no_active
  ON student (CASE WHEN deleted_at IS NULL THEN student_no END);

COMMENT ON TABLE  student                IS '학생';
COMMENT ON COLUMN student.version        IS '낙관적 락 버전 (수정될 때마다 +1)';
COMMENT ON COLUMN student.student_no     IS '학번(수강번호). 삭제되지 않은 학생끼리 중복 불가';
COMMENT ON COLUMN student.password_hash   IS '비밀번호 해시(scrypt). 원문은 저장하지 않는다. 학생 로그인 아이디는 student_no';
COMMENT ON COLUMN student.status         IS '재원 상태: ENROLLED 재원 / ON_LEAVE 휴원 / WITHDRAWN 퇴원';
COMMENT ON COLUMN student.deleted_at     IS 'Soft Delete (NULL = 삭제되지 않음)';

-- ---------------------------------------------------------------------
-- 강사 (로그인 계정). 로그인 아이디는 중복 불가.
-- ---------------------------------------------------------------------
CREATE TABLE instructor (
  id             NUMBER GENERATED ALWAYS AS IDENTITY,
  version        NUMBER(10)         DEFAULT 0 NOT NULL,
  login_id       VARCHAR2(50)                 NOT NULL,
  password_hash  VARCHAR2(200)                NOT NULL,
  name           VARCHAR2(30 CHAR)            NOT NULL,
  created_at     TIMESTAMP(3)       DEFAULT SYS_EXTRACT_UTC(SYSTIMESTAMP) NOT NULL,
  updated_at     TIMESTAMP(3)       DEFAULT SYS_EXTRACT_UTC(SYSTIMESTAMP) NOT NULL,
  CONSTRAINT pk_instructor PRIMARY KEY (id),
  CONSTRAINT uq_instructor_login_id UNIQUE (login_id)
);

COMMENT ON TABLE instructor IS '강사 로그인 계정';

-- ---------------------------------------------------------------------
-- 자습실
-- ---------------------------------------------------------------------
CREATE TABLE study_room (
  id              NUMBER GENERATED ALWAYS AS IDENTITY,
  version         NUMBER(10)          DEFAULT 0 NOT NULL,
  name            VARCHAR2(50 CHAR)             NOT NULL,
  max_personnel   NUMBER(5)                     NOT NULL,
  current_count   NUMBER(5)           DEFAULT 0 NOT NULL,
  start_date      TIMESTAMP(3)                  NOT NULL,
  end_date        TIMESTAMP(3)                  NOT NULL,
  created_at      TIMESTAMP(3)        DEFAULT SYS_EXTRACT_UTC(SYSTIMESTAMP) NOT NULL,
  updated_at      TIMESTAMP(3)        DEFAULT SYS_EXTRACT_UTC(SYSTIMESTAMP) NOT NULL,
  deleted_at      TIMESTAMP(3),
  CONSTRAINT pk_study_room PRIMARY KEY (id),
  CONSTRAINT ck_room_max_positive CHECK (max_personnel >= 1),
  -- 현재 인원은 0 이상, 최대 인원 이하. 서비스 검사가 뚫려도 DB 가 정원 초과/음수를 막는다.
  CONSTRAINT ck_room_count_range CHECK (current_count >= 0 AND current_count <= max_personnel),
  CONSTRAINT ck_room_period CHECK (start_date < end_date)
);

COMMENT ON TABLE  study_room               IS '자습실';
COMMENT ON COLUMN study_room.version       IS '낙관적 락 버전. 정원 보호의 기준이 되는 행';
COMMENT ON COLUMN study_room.current_count IS '현재 신청 인원(취소 제외). 신청 +1, 취소 -1 을 같은 트랜잭션에서 갱신';

-- ---------------------------------------------------------------------
-- 방문 신청 (현재 상태): 학생당 자습실당 1행. 취소 후 재신청은 이 행을 다시 ACTIVE 로 되살린다.
-- ---------------------------------------------------------------------
CREATE TABLE visit_reservation (
  id              NUMBER GENERATED ALWAYS AS IDENTITY,
  version         NUMBER(10)          DEFAULT 0        NOT NULL,
  room_id         NUMBER                               NOT NULL,
  student_id      NUMBER                               NOT NULL,
  visit_at        TIMESTAMP(3)                         NOT NULL,
  status          VARCHAR2(10)        DEFAULT 'ACTIVE' NOT NULL,
  created_at      TIMESTAMP(3)        DEFAULT SYS_EXTRACT_UTC(SYSTIMESTAMP) NOT NULL,
  updated_at      TIMESTAMP(3)        DEFAULT SYS_EXTRACT_UTC(SYSTIMESTAMP) NOT NULL,
  CONSTRAINT pk_visit_reservation PRIMARY KEY (id),
  CONSTRAINT fk_visit_room    FOREIGN KEY (room_id)    REFERENCES study_room (id),
  CONSTRAINT fk_visit_student FOREIGN KEY (student_id) REFERENCES student (id),
  CONSTRAINT ck_visit_status CHECK (status IN ('ACTIVE', 'CANCELLED')),
  -- 학생당 자습실당 신청 행은 하나
  CONSTRAINT uq_visit_room_student UNIQUE (room_id, student_id)
);

-- 한 학생은 모든 자습실을 통틀어 활성(ACTIVE) 신청을 한 건만 가질 수 있다.
CREATE UNIQUE INDEX uq_visit_student_active
  ON visit_reservation (CASE WHEN status = 'ACTIVE' THEN student_id END);

CREATE INDEX ix_visit_room_status ON visit_reservation (room_id, status);
CREATE INDEX ix_visit_student     ON visit_reservation (student_id);

COMMENT ON TABLE  visit_reservation        IS '방문 신청(현재 상태). 변경 기록은 visit_history';
COMMENT ON COLUMN visit_reservation.status IS 'ACTIVE 신청중 / CANCELLED 취소됨';

-- ---------------------------------------------------------------------
-- 신청·수정·취소 이력: 추가만 한다 (UPDATE / DELETE 하지 않음). version 없음.
-- ---------------------------------------------------------------------
CREATE TABLE visit_history (
  id               NUMBER GENERATED ALWAYS AS IDENTITY,
  reservation_id   NUMBER        NOT NULL,
  room_id          NUMBER        NOT NULL,
  student_id       NUMBER        NOT NULL,
  action           VARCHAR2(10)  NOT NULL,
  before_visit_at  TIMESTAMP(3),
  after_visit_at   TIMESTAMP(3),
  created_at       TIMESTAMP(3)  DEFAULT SYS_EXTRACT_UTC(SYSTIMESTAMP) NOT NULL,
  CONSTRAINT pk_visit_history PRIMARY KEY (id),
  CONSTRAINT fk_history_reservation FOREIGN KEY (reservation_id) REFERENCES visit_reservation (id),
  CONSTRAINT fk_history_room        FOREIGN KEY (room_id)        REFERENCES study_room (id),
  CONSTRAINT fk_history_student     FOREIGN KEY (student_id)     REFERENCES student (id),
  CONSTRAINT ck_history_action CHECK (action IN ('CREATE', 'UPDATE', 'CANCEL')),
  -- 행위별로 변경 전·후 방문 시각의 모양이 정해져 있다
  --   CREATE: 전 없음 / 후 있음,  UPDATE: 둘 다 있음,  CANCEL: 전 있음 / 후 없음
  CONSTRAINT ck_history_shape CHECK (
    (action = 'CREATE' AND before_visit_at IS NULL     AND after_visit_at IS NOT NULL) OR
    (action = 'UPDATE' AND before_visit_at IS NOT NULL AND after_visit_at IS NOT NULL) OR
    (action = 'CANCEL' AND before_visit_at IS NOT NULL AND after_visit_at IS NULL)
  )
);

-- 자습실 상세의 이력 조회(시간순)용
CREATE INDEX ix_history_room_created ON visit_history (room_id, created_at, id);
CREATE INDEX ix_history_reservation  ON visit_history (reservation_id);

COMMENT ON TABLE visit_history IS '신청·수정·취소 이력 (추가만 하는 감사 기록)';

EXIT
