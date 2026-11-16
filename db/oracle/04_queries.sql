-- =====================================================================
-- 04. 핵심 쿼리 모음 (참고용)  ※ 앱의 서비스 로직을 SQL 로 옮기면 이런 모양이 된다
--   :이름 은 바인드 변수. 모든 쓰기는 "한 트랜잭션"으로 묶고, 아래 "영향 행 0" 이면 롤백 후 처음부터 재시도한다.
--   (이 파일은 참고용이다. 02_schema.sql 의 제약조건과 낙관적 락 UPDATE 는 실제 DB 에서 동작을 확인했다.)
-- =====================================================================

-- ---------------------------------------------------------------------
-- [조회] 자습실 목록 (삭제 제외) - current_count 가 현재 신청 인원
-- ---------------------------------------------------------------------
SELECT id, version, name, max_personnel, current_count, start_date, end_date
  FROM study_room
 WHERE deleted_at IS NULL
 ORDER BY id;

-- 학생 목록 (삭제 제외)
SELECT id, version, student_no, name, grade, phone, guardian_phone, status
  FROM student
 WHERE deleted_at IS NULL
 ORDER BY id;

-- 학생 본인의 신청 목록 (자습실 이름 포함)
SELECT v.id, v.room_id, r.name AS room_name, v.visit_at, v.status
  FROM visit_reservation v
  JOIN study_room r ON r.id = v.room_id
 WHERE v.student_id = :student_id
 ORDER BY v.created_at DESC;

-- 자습실 상세의 신청·수정·취소 이력 (시간순). 삭제된 학생의 이름도 보이도록 학생은 LEFT JOIN
SELECT h.id, h.created_at, h.action, h.before_visit_at, h.after_visit_at,
       h.student_id, s.name AS student_name
  FROM visit_history h
  LEFT JOIN student s ON s.id = h.student_id
 WHERE h.room_id = :room_id
 ORDER BY h.created_at, h.id;

-- ---------------------------------------------------------------------
-- [방문 신청] 한 트랜잭션: 읽기 → 검사 → 신청/이력/인원 갱신 → COMMIT
-- ---------------------------------------------------------------------
-- 1) 자습실을 읽는다 (version 을 기억해 둔다). 삭제됐으면 거부, 운영 기간 밖이면 거부.
SELECT id, version, max_personnel, current_count, start_date, end_date, deleted_at
  FROM study_room WHERE id = :room_id;

-- 2) 학생을 읽는다. 삭제됐거나 재원(ENROLLED)이 아니면 거부.
SELECT id, version, status, deleted_at FROM student WHERE id = :student_id;

-- 3) 이 학생의 활성 신청을 읽는다. 방문 시각이 같은 날(한국 시간)인 것이 있으면 거부
--    (같은 자습실이면 ALREADY_APPLIED, 다르면 OTHER_ROOM). 다른 날짜의 신청은 있어도 된다.
--    날짜 비교는 앱이 하고, DB 는 uq_visit_student_day 인덱스로 최종 방어한다.
SELECT id, room_id, visit_at FROM visit_reservation
 WHERE student_id = :student_id AND status = 'ACTIVE';

-- 4) 정원 검사: current_count >= max_personnel 이면 ROOM_FULL 로 거부.

-- 5) 신청 행 생성. 신청은 항상 새 행이다 (취소된 옛 행은 그대로 남는다)
INSERT INTO visit_reservation (room_id, student_id, visit_at, status)
VALUES (:room_id, :student_id, :visit_at, 'ACTIVE')
RETURNING id INTO :reservation_id;

-- 6) 이력 추가 (CREATE: 전 없음 / 후 있음)
INSERT INTO visit_history (reservation_id, room_id, student_id, action, before_visit_at, after_visit_at)
VALUES (:reservation_id, :room_id, :student_id, 'CREATE', NULL, :visit_at);

-- 7) 현재 인원 +1  ← 1)에서 읽은 version 이 그대로일 때만. 정원의 "문지기"
UPDATE study_room
   SET current_count = current_count + 1, version = version + 1,
       updated_at = SYS_EXTRACT_UTC(SYSTIMESTAMP)
 WHERE id = :room_id AND version = :room_version;
-- 영향 행 0 → 그 사이 다른 신청·취소·수정이 있었음 = 충돌 → ROLLBACK 후 처음부터 재시도
-- (ck_room_count_range 제약이 정원 초과/음수를 마지막으로 막아 준다)

-- 8) 학생 행도 건드려 version 을 올린다 (같은 학생이 다른 자습실에 동시에 신청하는 경우를 잡기 위함)
UPDATE student
   SET version = version + 1
 WHERE id = :student_id AND version = :student_version;
-- 영향 행 0 → 충돌.   uq_visit_student_day 인덱스가 같은 날(한국 시간) 활성 신청 2건을 최종적으로 막는다.

-- COMMIT;

-- ---------------------------------------------------------------------
-- [방문 취소] 신청 상태 + 이력 + 인원 -1 을 한 트랜잭션으로
-- ---------------------------------------------------------------------
UPDATE visit_reservation
   SET status = 'CANCELLED', version = version + 1, updated_at = SYS_EXTRACT_UTC(SYSTIMESTAMP)
 WHERE id = :reservation_id AND version = :reservation_version AND status = 'ACTIVE';

INSERT INTO visit_history (reservation_id, room_id, student_id, action, before_visit_at, after_visit_at)
VALUES (:reservation_id, :room_id, :student_id, 'CANCEL', :old_visit_at, NULL);

UPDATE study_room
   SET current_count = current_count - 1, version = version + 1, updated_at = SYS_EXTRACT_UTC(SYSTIMESTAMP)
 WHERE id = :room_id AND version = :room_version;

-- ---------------------------------------------------------------------
-- [방문 시간 수정] 인원은 그대로, 자습실 행의 version 만 올린다 (자습실 기간 수정과의 충돌 감지)
-- ---------------------------------------------------------------------
UPDATE visit_reservation
   SET visit_at = :new_visit_at, version = version + 1, updated_at = SYS_EXTRACT_UTC(SYSTIMESTAMP)
 WHERE id = :reservation_id AND version = :reservation_version AND status = 'ACTIVE';

INSERT INTO visit_history (reservation_id, room_id, student_id, action, before_visit_at, after_visit_at)
VALUES (:reservation_id, :room_id, :student_id, 'UPDATE', :old_visit_at, :new_visit_at);

UPDATE study_room SET version = version + 1 WHERE id = :room_id AND version = :room_version;

-- ---------------------------------------------------------------------
-- [자습실 수정] 보낸 필드만 수정. 아래 검사를 통과해야 한다 (FR-ROM-06)
--   · 새 최대 인원 < 현재 신청 인원 이면 거부   (ck_room_count_range 제약도 최종 방어)
--   · 새 운영 기간 밖으로 밀려나는 활성 신청이 있으면 거부
-- ---------------------------------------------------------------------
SELECT id FROM visit_reservation
 WHERE room_id = :room_id AND status = 'ACTIVE'
   AND (visit_at < :new_start OR visit_at > :new_end);

UPDATE study_room
   SET name = :name, max_personnel = :max_personnel, start_date = :start_date, end_date = :end_date,
       version = version + 1, updated_at = SYS_EXTRACT_UTC(SYSTIMESTAMP)
 WHERE id = :room_id AND version = :room_version AND deleted_at IS NULL;

-- 자습실 삭제 (Soft Delete): 신청·이력은 그대로 남긴다
UPDATE study_room
   SET deleted_at = SYS_EXTRACT_UTC(SYSTIMESTAMP), version = version + 1
 WHERE id = :room_id AND version = :room_version AND deleted_at IS NULL;

-- ---------------------------------------------------------------------
-- [학생 삭제 / 휴원·퇴원] 활성 신청이 없을 때만
-- ---------------------------------------------------------------------
SELECT id FROM visit_reservation WHERE student_id = :student_id AND status = 'ACTIVE';  -- 있으면 거부

UPDATE student
   SET deleted_at = SYS_EXTRACT_UTC(SYSTIMESTAMP), version = version + 1
 WHERE id = :student_id AND version = :student_version AND deleted_at IS NULL;

-- ---------------------------------------------------------------------
-- [로그인] 역할(강사/학생)에 따라 조회하는 테이블이 다르다. 비밀번호 해시는 앱에서 scrypt 로 비교한다 (SQL 로 비교하지 않음).
-- 아이디가 없든 비밀번호가 틀리든 같은 오류로 응답한다.
-- ---------------------------------------------------------------------
-- 강사 로그인
SELECT id, login_id, password_hash, name FROM instructor WHERE login_id = :login_id;

-- 학생 로그인: 로그인 아이디는 학번. 삭제된 학생은 제외한다 (퇴원 학생 여부는 앱에서 status 로 거른다)
SELECT id, student_no, password_hash, name, status
  FROM student
 WHERE student_no = :student_no AND deleted_at IS NULL;

-- 비밀번호 변경 (낙관적 락)
UPDATE student
   SET password_hash = :password_hash, version = version + 1, updated_at = SYS_EXTRACT_UTC(SYSTIMESTAMP)
 WHERE id = :student_id AND version = :student_version;

-- ---------------------------------------------------------------------
-- [점검] 카운터 불변식: 저장된 current_count 가 실제 활성 신청 수와 같아야 한다 (결과가 0 행이면 정상)
-- ---------------------------------------------------------------------
SELECT r.id, r.current_count, COUNT(v.id) AS actual_active
  FROM study_room r
  LEFT JOIN visit_reservation v ON v.room_id = r.id AND v.status = 'ACTIVE'
 GROUP BY r.id, r.current_count
HAVING r.current_count <> COUNT(v.id);
