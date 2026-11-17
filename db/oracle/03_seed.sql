-- =====================================================================
-- 03. 예시 데이터   ※ STUDYROOM 계정으로 실행 (앱의 시드와 같은 내용)
--   파일은 UTF-8. 실행 전에  NLS_LANG=KOREAN_KOREA.AL32UTF8  로 맞출 것 (한글 깨짐 방지)
-- =====================================================================
WHENEVER SQLERROR EXIT FAILURE ROLLBACK
SET DEFINE OFF

INSERT INTO student (name, phone, student_no, grade, guardian_phone) VALUES ('김민준', '010-1111-0001', '2026001', '고2', '010-2222-0001');
INSERT INTO student (name, phone, student_no, grade, guardian_phone) VALUES ('이서연', '010-1111-0002', '2026002', '고3', '010-2222-0002');
INSERT INTO student (name, phone, student_no, grade, guardian_phone) VALUES ('박지호', '010-1111-0003', '2026003', '고1', '010-2222-0003');
INSERT INTO student (name, phone, student_no, grade, guardian_phone) VALUES ('최수아', '010-1111-0004', '2026004', '중3', '010-2222-0004');
INSERT INTO student (name, phone, student_no, grade, guardian_phone) VALUES ('정도윤', '010-1111-0005', '2026005', 'N수', NULL);

-- 강사(원장 계정과 예시 강사 6명)는 이 SQL로 넣지 않는다: 비밀번호 해시(scrypt)가 필요해서 앱이 시작할 때 만든다.
--   (원장: INSTRUCTOR_ID/INSTRUCTOR_PASSWORD, 예시 강사 6명: 사번이 있는 강사가 없을 때 한 번, 초기 비밀번호는 사번)

-- 운영 기간: 어제부터 30일 뒤까지 (UTC 기준)
INSERT INTO study_room (name, branch, max_personnel, start_date, end_date)
VALUES ('부엉이 라이브러리 1관', 'H', 10, SYS_EXTRACT_UTC(SYSTIMESTAMP) - INTERVAL '1' DAY, SYS_EXTRACT_UTC(SYSTIMESTAMP) + INTERVAL '30' DAY);
INSERT INTO study_room (name, branch, max_personnel, start_date, end_date)
VALUES ('부엉이 라이브러리 2관', 'S', 10, SYS_EXTRACT_UTC(SYSTIMESTAMP) - INTERVAL '1' DAY, SYS_EXTRACT_UTC(SYSTIMESTAMP) + INTERVAL '30' DAY);
INSERT INTO study_room (name, branch, max_personnel, start_date, end_date)
VALUES ('부엉이 라이브러리 3관 (소수 정예)', 'MOKDONG', 5, SYS_EXTRACT_UTC(SYSTIMESTAMP) - INTERVAL '1' DAY, SYS_EXTRACT_UTC(SYSTIMESTAMP) + INTERVAL '30' DAY);

COMMIT;
EXIT
