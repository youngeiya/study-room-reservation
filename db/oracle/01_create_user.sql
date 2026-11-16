-- =====================================================================
-- 01. 스키마(사용자) 생성   ※ SYS(또는 DBA)로 실행
--   대상: Oracle 23ai/26ai Free, PDB = FREEPDB1
--   실행: sqlplus /nolog  후
--         DEFINE STUDYROOM_PWD = '비밀번호'
--         @01_create_user.sql
--   비밀번호는 이 파일에 적지 않는다 (저장소에 올라가므로).
--
--   admin / his / inpatient 처럼 업무별로 스키마를 따로 둔다.
--   이 과제의 스키마 이름은 STUDYROOM (다른 스키마의 객체는 건드리지 않는다).
-- =====================================================================
WHENEVER SQLERROR EXIT FAILURE ROLLBACK
SET DEFINE ON
SET VERIFY OFF

CREATE USER studyroom IDENTIFIED BY "&&STUDYROOM_PWD"
  DEFAULT TABLESPACE users
  TEMPORARY TABLESPACE temp
  QUOTA UNLIMITED ON users;

-- 필요한 최소 권한만 준다 (DBA 권한 없음)
GRANT CREATE SESSION  TO studyroom;
GRANT CREATE TABLE    TO studyroom;
GRANT CREATE VIEW     TO studyroom;
GRANT CREATE SEQUENCE TO studyroom;

EXIT
