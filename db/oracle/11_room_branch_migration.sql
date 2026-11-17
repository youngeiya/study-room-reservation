-- =====================================================================
-- 11_room_branch_migration.sql : 자습실을 지점(H관·S관·목동·반포)별로 나누기
-- STUDYROOM 계정으로 실행한다. 02_schema.sql 로 새로 만드는 경우에는 필요 없다.
--
-- 바뀌는 것
--   1) study_room.branch 컬럼 추가 (기존 자습실은 기본값 H 로 채워진다)
--   2) 지점 값 제약 (H, S, MOKDONG, BANPO)
--   3) 예시 자습실 3개를 H관·S관·목동으로 나눈다 (이름이 같은 행만 바뀌고, 직접 만든 자습실은 그대로 H)
-- =====================================================================
ALTER TABLE study_room ADD (branch VARCHAR2(10) DEFAULT 'H' NOT NULL);

ALTER TABLE study_room ADD CONSTRAINT ck_room_branch
  CHECK (branch IN ('H', 'S', 'MOKDONG', 'BANPO'));

UPDATE study_room SET branch = 'H'       WHERE name = '부엉이 라이브러리 1관';
UPDATE study_room SET branch = 'S'       WHERE name = '부엉이 라이브러리 2관';
UPDATE study_room SET branch = 'MOKDONG' WHERE name = '부엉이 라이브러리 3관 (소수 정예)';

COMMIT;
