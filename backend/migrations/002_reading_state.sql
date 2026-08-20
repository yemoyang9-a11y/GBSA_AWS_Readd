-- =============================================================================
-- 002_reading_state.sql — 독서 상태 스토어 (R2 소유)
--
-- 근거: architecture-r1.md 5.1.2절 (쓰기: ②④ / 읽기: ②④⑤)
-- 파트: R2 (독서 상태 ② + 리캡 서비스 ④ + 세션 종료 스위퍼)
--
-- ⚠️ 공개 콘텐츠 스토어(도서·페이지·장 경계·장 요약·엔티티)는 001에서 R1이 만든다.
--    이 파일은 R2 소유 테이블만 담으며, R1 테이블로의 외래 키를 걸지 않는다
--    — 마이그레이션 적용 순서에 결합을 만들지 않기 위한 것이다. book_id 정합성은
--    파이프라인 검증과 진입 판정(FR-BRW-002)이 담당한다.
--
-- ⚠️ 영문 물리명은 이 파일에서 처음 정한 것이다 (스펙은 한글 논리명만 규정).
--    팀 합의 전이므로 병합 시 확인이 필요하다.
--
-- ⚠️ book_id는 TEXT다 (2026-08-20 수정 — 최초 커밋은 UUID로 잘못 선언했었다).
--    R1의 001_content_store.sql이 book_id TEXT PRIMARY KEY로 정의하고 실제 값도
--    'takryu'처럼 사람이 읽는 슬러그다(run-register.ts BOOK_ID 상수). UUID로 두면
--    실제 도서 ID가 들어오는 즉시 "invalid input syntax for type uuid"로 전부
--    깨진다 — 로컬 Postgres에 마이그레이션을 직접 적용해보고서야 발견했다(fake
--    리포지토리는 타입 제약이 없어 이 버그를 못 잡는다). device_id는 계약대로
--    UUID를 유지한다(00-shared 2.4절 "X-Device-Id: <uuid>").
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 진도 — 이 시스템의 유일한 저장값 (3.3절)
--
-- current_page = "마지막으로 열어본 페이지". cutoff·percent·chapter는 전부 이 값의
-- 파생값이며 계산은 기준점 결정기 한 곳에서만 한다 (FR-PRG-003 🚦, FR-BRF-005 🚦).
-- 최대 도달 값(watermark) 컬럼은 존재하지 않는다 (R2 불변식).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reading_position (
    device_id     UUID        NOT NULL,
    book_id       TEXT        NOT NULL,

    current_page  INTEGER     NOT NULL CHECK (current_page >= 1),   -- 1-based

    -- 클라이언트 단조 증가 시퀀스. 서버는 더 새로운 seq일 때만 수용한다 (FR-PRG-002, S2)
    event_seq     BIGINT      NOT NULL,

    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (device_id, book_id)
);

-- -----------------------------------------------------------------------------
-- 세션 — 무조작 30분 판정 + 스위퍼 대상 선별 (FR-DAT-011, R6)
--
-- (디바이스, 도서)당 1행. 이력 테이블은 두지 않는다 (5.1.2절).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reading_session (
    device_id        UUID        NOT NULL,
    book_id          TEXT        NOT NULL,

    -- 조작 이벤트 수신 시 갱신. '조작' = 서버 도달 이벤트 4종 + 가시 하트비트 (A2, 4.4.1절)
    -- 페이지 내 스크롤은 서버 이벤트가 없으므로 계상되지 않는다 (FR-PRG-003 AC④)
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- 조작이 오면 'none'으로 되돌아간다 — 멱등·자기 교정 구조 (4.4.1절, S4)
    recap_state      TEXT        NOT NULL DEFAULT 'none'
                     CHECK (recap_state IN ('none', 'pending', 'done', 'failed')),

    -- 세션 경계 식별자. 대화 이력의 세션 스코프에 쓴다 (FR-QNA-003, P1)
    session_epoch    BIGINT      NOT NULL DEFAULT 1,

    PRIMARY KEY (device_id, book_id)
);

-- 스위퍼 스캔용 — 대상 = recap_state='none' AND last_activity_at < now() - 30분 (S4)
CREATE INDEX IF NOT EXISTS ix_reading_session_sweep
    ON reading_session (recap_state, last_activity_at);

-- -----------------------------------------------------------------------------
-- 저장 리캡 — 사용자·도서당 1건 (R7, FR-DAT-009)
--
-- 세션 종료 시 진도와 무관하게 생성·갱신한다 (10% 미만 미생성 규칙은 폐지 — D1).
-- 재사용은 cutoff_page가 현재 기준점과 완전 일치할 때만 (R8, FR-DAT-010).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS saved_recap (
    device_id   UUID        NOT NULL,
    book_id     TEXT        NOT NULL,

    -- 생성 당시의 기준점 K. current_page가 아니라 cutoff를 저장한다 — 재사용 판정의 키
    cutoff_page INTEGER     NOT NULL CHECK (cutoff_page >= 0),      -- 첫 진입은 0

    recap_text  TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (device_id, book_id)   -- 1건 upsert
);

-- -----------------------------------------------------------------------------
-- 세션 리캡 캐시 — 실시간 생성분 (FR-DAT-010, UC-09 A7)
--
-- ⚠️ 영구 저장이 아니다. 세션 종료 시 만료된다. 저장 리캡과 테이블을 분리한 이유가
--    이것이며, 실시간 생성분을 saved_recap에 쓰지 않는다 (R8).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS session_recap_cache (
    device_id   UUID        NOT NULL,
    book_id     TEXT        NOT NULL,
    cutoff_page INTEGER     NOT NULL CHECK (cutoff_page >= 0),

    recap_text  TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ NOT NULL,

    PRIMARY KEY (device_id, book_id, cutoff_page)   -- 기준점별로 적중 판정
);

CREATE INDEX IF NOT EXISTS ix_session_recap_cache_expiry
    ON session_recap_cache (expires_at);

-- -----------------------------------------------------------------------------
-- 대화 이력 (P1) — 챗봇 대화 맥락 (FR-QNA-003)
--
-- ⚠️ 세션 종료 시 스위퍼가 파기한다 (A7, NFR-SEC-004 자동 충족).
--    챗봇 질의 로그는 운영 기록 스토어의 별도 테이블이며 **파기 대상이 아니다**
--    — 게이트 판정 근거이기 때문에 테이블을 분리했다 (NFR-OBS-005 🚦).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversation_history (
    device_id     UUID        NOT NULL,
    book_id       TEXT        NOT NULL,
    session_epoch BIGINT      NOT NULL,

    turn_no       INTEGER     NOT NULL CHECK (turn_no >= 1),
    role          TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
    text          TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (device_id, book_id, session_epoch, turn_no)
);
