-- =====================================================================
-- 06_address_migration.sql : 학생 주소 컬럼 추가 (이미 만들어 둔 DB 용)
-- STUDYROOM 계정으로 실행한다. 02_schema.sql 로 새로 만드는 경우에는 필요 없다.
-- =====================================================================
ALTER TABLE student ADD (
  zip_code        VARCHAR2(5),
  address         VARCHAR2(200 CHAR),
  address_detail  VARCHAR2(100 CHAR)
);
