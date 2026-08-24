-- =============================================================================
-- 005_chatbot_conversation_history.sql — 사용자 노출용 챗봇 대화 이력 (R3 소유)
--
-- 근거: 2026-08-24 사용자·R2 조율 결정 (dev-spec 문서 부재 — 이 파일 헤더가 결정 기록을 겸한다)
--
-- ⚠️ 002_reading_state.sql 의 conversation_history(R2 소유)와 다른 테이블이다.
--    그건 세션 내 챗봇 프롬프트 컨텍스트용이고 세션 종료 시 스위퍼가 파기한다
--    (A7, NFR-SEC-004). 이 테이블은 사용자가 나중에 다시 열어보는 대화 이력 UI 전용이며
--    세션 경계와 무관하게 영구 보존한다 — R2 승인 완료, NFR-SEC-004 파기 대상 아님.
-- ⚠️ chatbot_query_log(NFR-OBS-005, 미구현)와도 다르다. 그건 게이트 판정용 관측 로그이고
--    질문 텍스트만 있고 답변 본문이 없다. 이 테이블은 사용자 노출이 목적이라 답변 본문을 담는다.
--
-- 스포일러 처리 (절대 규칙 7번과의 경계):
--   대화는 생성 시점 cutoff_page로 "봉인"된다. 대화가 이어지는 동안 기준점이 더 커지면
--   cutoff_page를 그 최댓값으로 래칫한다(아래 GREATEST 갱신, service 쪽). 목록·상세 조회 시
--   "현재 K < 이 대화의 cutoff_page" 면 통째로 숨긴다 — 뒤로 페이지 이동한 경우 그 대화에
--   담긴 정보가 현재 기준점보다 앞선 내용일 수 있기 때문이다.
--   이건 새 콘텐츠 조회 경로에 "초과 판별" 로직을 넣는 것과는 다르다 — 이미 그 시점에
--   합법적으로 생성된 완결 아티팩트(대화 전체)의 노출 여부만 결정하며, 개별 turn 단위로
--   내용을 판별해 자르지 않는다(그건 R7 위반 소지가 있어 채택하지 않음 — 사용자 확인).
-- =============================================================================

CREATE TABLE IF NOT EXISTS chatbot_conversation (
    id                BIGSERIAL   PRIMARY KEY,
    device_id         UUID        NOT NULL,
    book_id           TEXT        NOT NULL,

    -- KST(Asia/Seoul) 자정 기준 캘린더 날짜. 하루가 바뀌면 새 대화로 자동 롤오버한다
    conversation_date DATE        NOT NULL,

    -- 봉인 기준점. 대화 생성 시 K로 시작하고, 대화가 이어지며 K가 커지면 그 최댓값으로 래칫된다.
    -- 현재 기준점이 이 값보다 작아지면(뒤로 이동) 목록·상세 조회에서 통째로 제외한다.
    cutoff_page       INTEGER     NOT NULL CHECK (cutoff_page >= 0),

    -- 첫 사용자 질문으로 자동 채워진다 (목록 UI 표시용)
    title             TEXT,

    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 목록 조회(디바이스·도서 단위, 최신순) 지원
CREATE INDEX IF NOT EXISTS ix_chatbot_conversation_lookup
    ON chatbot_conversation (device_id, book_id, conversation_date DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS chatbot_conversation_turn (
    id              BIGSERIAL   PRIMARY KEY,
    conversation_id BIGINT      NOT NULL REFERENCES chatbot_conversation(id) ON DELETE CASCADE,

    turn_no         INTEGER     NOT NULL CHECK (turn_no >= 1),
    role            TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
    text            TEXT        NOT NULL,

    -- 이 turn이 생성된 시점의 기준점 (2026-08-24 대화 맥락 기억 기능 추가).
    -- conversation.cutoff_page(래칫된 최댓값, 대화 전체 노출 여부 판정용)와는 다르다 —
    -- 이건 turn 하나하나의 값이며, "지난 대화를 다음 질문의 맥락으로 재사용"할 때
    -- 이 값이 현재 K보다 큰 turn은 프롬프트에서 제외한다. 대화창을 계속 연 채로 뒤로
    -- 페이지를 이동한 뒤 같은 대화에서 새로 질문하면(resolveConversation은 이 경우를
    -- 막지 않고 계속 이어가므로), 필터링 없이는 예전(더 큰 K) 답변이 새 프롬프트에
    -- 맥락으로 새어 들어간다 — 그 구멍을 막는 필드다.
    cutoff_page     INTEGER     NOT NULL CHECK (cutoff_page >= 0),

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (conversation_id, turn_no)
);

CREATE INDEX IF NOT EXISTS ix_chatbot_conversation_turn_context
    ON chatbot_conversation_turn (conversation_id, cutoff_page);
