-- =====================================================================
-- 10_instructor_profile_migration.sql : 강사 등록 항목 확장 (사번·연락처·이메일·직책·담당 과목·재직 상태·입사일·메모)
-- STUDYROOM 계정으로 실행한다. 09_instructor_management_migration.sql 을 먼저 실행한 뒤에 실행한다.
-- 02_schema.sql 로 새로 만드는 경우에는 필요 없다.
--
-- 바뀌는 것
--   1) instructor 에 컬럼 추가 (직책·재직 상태는 기본값이 있어서 기존 행도 그대로 둘 수 있다)
--   2) 직책·재직 상태 값 제약, 사번 유일 인덱스(삭제되지 않은 강사끼리)
--   3) 기본 강사 계정(admin)의 직책을 원장(DIRECTOR)으로 지정
-- =====================================================================
ALTER TABLE instructor ADD (
  employee_no  VARCHAR2(20),
  phone        VARCHAR2(20),
  email        VARCHAR2(100),
  job_title    VARCHAR2(20) DEFAULT 'LECTURER' NOT NULL,
  subjects     VARCHAR2(100),
  status       VARCHAR2(10) DEFAULT 'ACTIVE'   NOT NULL,
  hire_date    VARCHAR2(10),
  memo         VARCHAR2(200 CHAR)
);

ALTER TABLE instructor ADD CONSTRAINT ck_instructor_title
  CHECK (job_title IN ('DIRECTOR', 'VICE_DIRECTOR', 'HOMEROOM', 'LECTURER', 'ASSISTANT', 'STAFF'));

ALTER TABLE instructor ADD CONSTRAINT ck_instructor_status
  CHECK (status IN ('ACTIVE', 'ON_LEAVE', 'RESIGNED'));

CREATE UNIQUE INDEX uq_instructor_employee_active
  ON instructor (CASE WHEN deleted_at IS NULL THEN employee_no END);

UPDATE instructor SET job_title = 'DIRECTOR' WHERE login_id = 'admin';

COMMIT;
