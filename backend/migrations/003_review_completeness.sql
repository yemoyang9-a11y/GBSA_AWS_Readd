-- S7 검수 보완 — architecture-r1.md 5.1.1절, FR-ADM-005 🚦
-- 001의 review_records는 6개 판정 컬럼을 두었으나 spoiler_free_ok가 FR-BGK-002(배경지식
-- 1페이지 시점 안전)만 가리켜, FR-ADM-005 명세의 "소개 글 수위" 항목이 컬럼을 갖지 못했다.
-- 두 항목은 서로 다른 대상(background vs intro)이라 하나로 합치지 않고 컬럼을 분리한다.
ALTER TABLE review_records ADD COLUMN IF NOT EXISTS intro_tone_ok BOOLEAN; -- 소개 글 수위 (FR-ADM-005 6항목 중 "소개 글 수위")

-- 대상 1건(book_id, target_type, target_id)당 검수 기록은 1건이어야 재실행 시 중복 행이 쌓이지 않는다.
ALTER TABLE review_records ADD CONSTRAINT uq_review_records_target UNIQUE (book_id, target_type, target_id);
