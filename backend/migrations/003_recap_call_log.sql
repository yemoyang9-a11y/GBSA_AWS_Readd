-- =============================================================================
-- 003_recap_call_log.sql — 리캡 호출 로그 (R2 소유, 운영 기록 스토어)
--
-- 근거: architecture-r1.md 5.1.3절 · dev-spec-00-shared.md 2.4절 · NFR-OBS-002 🚦
-- 파트: R2 (리캡 서비스 ④가 유일한 쓰기 주체)
--
-- ⚠️ 이 테이블이 없으면 FR-SPL-003(리캡 입력 절단) 판정이 불가능하다 — "기능이
--    동작해도 로그가 비면 통과를 증명할 수 없다"(00-shared 2.4절).
-- ⚠️ 세션 종료 스위퍼가 파기하는 대화 이력(conversation_history, 002)과 다른 테이블이다.
--    이 로그는 게이트 판정 근거이므로 파기 대상이 아니다 (A7 주석).
-- =============================================================================

CREATE TABLE IF NOT EXISTS recap_call_log (
    id                        BIGSERIAL   PRIMARY KEY,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

    device_id                 UUID        NOT NULL,
    book_id                   UUID        NOT NULL,

    -- 이 호출이 적용한 기준점 K (FR-SPL-003 🚦 판정의 핵심 필드)
    cutoff_page               INTEGER     NOT NULL CHECK (cutoff_page >= 0),

    -- 투입된 완결 장 요약의 장 번호 목록. 장 요약 PK가 (도서ID, 장 번호)라 별도 ID가 없다 (5.1.1절)
    input_chapter_summary_ids TEXT[]      NOT NULL DEFAULT '{}',

    -- 현재 장 원문 절단 페이지. 원문을 넣지 않은 호출(K가 장 종료 페이지와 일치)은 NULL
    current_chapter_cutoff    INTEGER,

    output_ref                TEXT        NOT NULL,
    model                     TEXT        NOT NULL,
    input_tokens              INTEGER     NOT NULL,
    output_tokens             INTEGER     NOT NULL,

    trigger                   TEXT        NOT NULL CHECK (trigger IN ('realtime', 'session_end'))
);

-- 게이트 판정 시 (도서, 기준점) 단위로 호출 이력을 훑는 조회를 지원한다
CREATE INDEX IF NOT EXISTS ix_recap_call_log_lookup
    ON recap_call_log (device_id, book_id, cutoff_page);
