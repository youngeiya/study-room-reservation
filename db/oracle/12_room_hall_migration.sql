-- =====================================================================
-- 12_room_hall_migration.sql : "지점(branch)"을 "관(hall)"으로 바꾸기 (본관·별관·동관·서관)
-- STUDYROOM 계정으로 실행한다. 11_room_branch_migration.sql 을 이미 실행한 DB 용이다.
-- 02_schema.sql 로 새로 만드는 경우에는 필요 없다.
--
-- 바뀌는 것
--   1) 기존 값 H, S, MOKDONG, BANPO 를 MAIN, ANNEX, EAST, WEST 로 바꾼다
--   2) 컬럼 이름 branch -> hall, 기본값 MAIN, 값 제약을 새 코드로 교체 (ck_room_branch -> ck_room_hall)
--   3) 예시 자습실 3개의 이름을 관 이름에 맞게 바꾼다 (이름이 같은 행만 바뀐다. 직접 만든 자습실은 그대로)
-- 순서가 중요하다: 제약을 먼저 지워야 새 값으로 바꿀 수 있다.
-- =====================================================================
ALTER TABLE study_room DROP CONSTRAINT ck_room_branch;

UPDATE study_room SET branch = CASE branch
  WHEN 'H'       THEN 'MAIN'
  WHEN 'S'       THEN 'ANNEX'
  WHEN 'MOKDONG' THEN 'EAST'
  WHEN 'BANPO'   THEN 'WEST'
  ELSE 'MAIN'
END;

ALTER TABLE study_room RENAME COLUMN branch TO hall;
ALTER TABLE study_room MODIFY (hall DEFAULT 'MAIN');

ALTER TABLE study_room ADD CONSTRAINT ck_room_hall
  CHECK (hall IN ('MAIN', 'ANNEX', 'EAST', 'WEST'));

UPDATE study_room SET name = '본관 제1자습실'              WHERE name = '부엉이 라이브러리 1관';
UPDATE study_room SET name = '별관 제1자습실'              WHERE name = '부엉이 라이브러리 2관';
UPDATE study_room SET name = '동관 제1자습실 (소수 정예)'  WHERE name = '부엉이 라이브러리 3관 (소수 정예)';

COMMIT;
