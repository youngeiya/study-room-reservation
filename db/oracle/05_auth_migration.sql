-- =====================================================================
-- 05. 로그인 기능 추가용 마이그레이션   ※ STUDYROOM 계정으로 실행
--   이미 02_schema.sql 로 스키마를 만든 DB 에 로그인 관련 객체만 더한다.
--   (새로 설치하는 경우에는 02_schema.sql 에 이미 포함되어 있으므로 실행하지 않는다)
--   - student.password_hash 컬럼 추가
--   - instructor 테이블 추가
--   기본 강사 계정과 학생의 초기 비밀번호(학번)는 백엔드가 처음 뜰 때 자동으로 채운다.
-- =====================================================================
WHENEVER SQLERROR EXIT FAILURE ROLLBACK
SET DEFINE OFF

ALTER TABLE student ADD (password_hash VARCHAR2(200));
COMMENT ON COLUMN student.password_hash IS '비밀번호 해시(scrypt). 원문은 저장하지 않는다. 학생 로그인 아이디는 student_no';

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

EXIT
