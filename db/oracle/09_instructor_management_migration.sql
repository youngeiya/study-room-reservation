-- =====================================================================
-- 09_instructor_management_migration.sql : 강사 관리(등록·수정·삭제) 기능용
-- STUDYROOM 계정으로 실행한다. 02_schema.sql 로 새로 만드는 경우에는 필요 없다.
--
-- 바뀌는 것
--   1) instructor.deleted_at 컬럼 추가 (Soft Delete)
--   2) 로그인 아이디 유일 제약(uq_instructor_login_id)을 "삭제되지 않은 강사끼리 유일" 인덱스로 교체
-- =====================================================================
ALTER TABLE instructor ADD (deleted_at TIMESTAMP(3));

ALTER TABLE instructor DROP CONSTRAINT uq_instructor_login_id;

CREATE UNIQUE INDEX uq_instructor_login_active
  ON instructor (CASE WHEN deleted_at IS NULL THEN login_id END);
