-- =====================================================================
-- 08_one_visit_per_day_migration.sql : "활성 신청 1건" → "하루(한국 시간)에 활성 신청 1건"
-- STUDYROOM 계정으로 실행한다. 02_schema.sql 로 새로 만드는 경우에는 필요 없다.
--
-- 바뀌는 것
--   1) (room_id, student_id) 유일 제약 삭제: 같은 자습실에 다른 날짜로도 신청할 수 있게 한다.
--   2) 학생당 활성 신청 1건 색인(uq_visit_student_active) 삭제
--   3) 학생 + 한국 날짜당 활성 신청 1건 색인(uq_visit_student_day) 생성
-- 기존 데이터는 학생당 활성 신청이 1건뿐이었으므로 새 색인을 만들 때 충돌하지 않는다.
-- =====================================================================
ALTER TABLE visit_reservation DROP CONSTRAINT uq_visit_room_student;

DROP INDEX uq_visit_student_active;

CREATE UNIQUE INDEX uq_visit_student_day
  ON visit_reservation (
    CASE WHEN status = 'ACTIVE' THEN student_id END,
    CASE WHEN status = 'ACTIVE' THEN TRUNC(CAST(visit_at AS DATE) + 9 / 24) END
  );
