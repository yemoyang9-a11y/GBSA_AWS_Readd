-- 공개 콘텐츠 스토어 (⑦ 파이프라인 전용 쓰기, ①③④⑤ 읽기 전용) — architecture-r1.md 5.1.1절
-- 쓰기 주체는 R1 파이프라인 하나뿐이다. 다른 파트는 이 스키마를 읽기만 한다.
-- 검수 기록은 운영 기록 스토어 소속이지만 R1이 유일한 쓰기 주체라 이 파일에 함께 둔다 (FR-ADM-005 🚦).

CREATE EXTENSION IF NOT EXISTS vector;

-- 도서 — FR-BRW-001~003, FR-ADM-006
CREATE TABLE IF NOT EXISTS books (
  book_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  cover_url TEXT,
  publish_year INTEGER,
  extent TEXT, -- "분량" — 도서 소개용 짧은 문구(예: "411페이지"). total_pages와 별개(FR-BRW-003)
  intro_summary TEXT,
  total_pages INTEGER NOT NULL,
  ssabi_ready BOOLEAN NOT NULL DEFAULT FALSE, -- 완비 여부
  publish_status TEXT NOT NULL DEFAULT 'draft' -- draft | review | published — FR-ADM-006, R12
    CHECK (publish_status IN ('draft', 'review', 'published'))
);

-- 페이지 — FR-DAT-002 🚦. 임베딩은 5.3절 — 페이지가 곧 검색 청크(별도 청크 테이블 없음)
CREATE TABLE IF NOT EXISTS pages (
  book_id TEXT NOT NULL REFERENCES books(book_id),
  page_no INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1024), -- Amazon Titan Text Embeddings V2 (A8-1)
  PRIMARY KEY (book_id, page_no)
);
CREATE INDEX IF NOT EXISTS ix_pages_embedding ON pages USING hnsw (embedding vector_cosine_ops);

-- 장 경계 — FR-DAT-001 🚦
CREATE TABLE IF NOT EXISTS chapters (
  book_id TEXT NOT NULL REFERENCES books(book_id),
  chapter_no INTEGER NOT NULL,
  title TEXT NOT NULL,
  start_page INTEGER NOT NULL,
  end_page INTEGER NOT NULL,
  PRIMARY KEY (book_id, chapter_no)
);
CREATE INDEX IF NOT EXISTS ix_chapters_end_page ON chapters (book_id, end_page); -- "완결된 장" 선별
CREATE INDEX IF NOT EXISTS ix_chapters_start_page ON chapters (book_id, start_page); -- 현재 장 탐색

-- 장 요약 — FR-DAT-003 🚦 (해당 장 이후 사건 금지)
CREATE TABLE IF NOT EXISTS chapter_summaries (
  book_id TEXT NOT NULL REFERENCES books(book_id),
  chapter_no INTEGER NOT NULL,
  summary TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'approved', 'rejected')),
  PRIMARY KEY (book_id, chapter_no),
  FOREIGN KEY (book_id, chapter_no) REFERENCES chapters(book_id, chapter_no)
);

-- 인물 — FR-DAT-004
CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(book_id),
  name TEXT NOT NULL,
  first_appearance_page INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_characters_first_appearance ON characters (book_id, first_appearance_page);

-- 인물 별칭 — FR-DAT-004, FR-CHR-002, D6 (전 별칭 태깅 확정)
CREATE TABLE IF NOT EXISTS aliases (
  book_id TEXT NOT NULL REFERENCES books(book_id),
  alias TEXT NOT NULL,
  character_id TEXT NOT NULL REFERENCES characters(id),
  alias_type TEXT NOT NULL CHECK (alias_type IN ('name', 'title', 'kinship', 'nickname')),
  first_appearance_page INTEGER NOT NULL,
  PRIMARY KEY (book_id, alias, character_id)
);
CREATE INDEX IF NOT EXISTS ix_aliases_character ON aliases (book_id, character_id);

-- 인물 노트 — A5. 서술 1문장 = 근거 페이지 1개, 이른 페이지에 귀속
CREATE TABLE IF NOT EXISTS character_notes (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(book_id),
  character_id TEXT NOT NULL REFERENCES characters(id),
  note TEXT NOT NULL,
  source_page INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_character_notes_lookup ON character_notes (book_id, character_id, source_page);

-- 관계 — FR-DAT-005, FR-CHR-001 🚦, A6 (이력형 — 쌍당 복수 행 허용)
CREATE TABLE IF NOT EXISTS relationships (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(book_id),
  character_a_id TEXT NOT NULL REFERENCES characters(id),
  character_b_id TEXT NOT NULL REFERENCES characters(id),
  label TEXT NOT NULL,
  established_page INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_relationships_established ON relationships (book_id, established_page);
CREATE INDEX IF NOT EXISTS ix_relationships_a ON relationships (book_id, character_a_id);
CREATE INDEX IF NOT EXISTS ix_relationships_b ON relationships (book_id, character_b_id);

-- 사건(타임라인) — FR-DAT-008
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(book_id),
  event TEXT NOT NULL,
  description TEXT NOT NULL,
  occurrence_page INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_events_occurrence ON events (book_id, occurrence_page);

-- 용어 — FR-DAT-007
CREATE TABLE IF NOT EXISTS terms (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(book_id),
  term TEXT NOT NULL,
  definition TEXT NOT NULL,
  first_appearance_page INTEGER NOT NULL,
  UNIQUE (book_id, term)
);
CREATE INDEX IF NOT EXISTS ix_terms_first_appearance ON terms (book_id, first_appearance_page);

-- 배경지식·책 소개 — FR-DAT-006, FR-BRW-003 AC③, R5 (상한 없음)
-- 행 자체가 분리된다 — 한 행에 두 구분을 뭉치지 않는다 (검수 기준 "정보 분리", FR-ADM-005)
CREATE TABLE IF NOT EXISTS background_and_intro (
  book_id TEXT NOT NULL REFERENCES books(book_id),
  kind TEXT NOT NULL CHECK (kind IN ('background', 'intro')),
  content TEXT NOT NULL,
  PRIMARY KEY (book_id, kind)
);

-- 검수 기록 — FR-ADM-005 🚦, NFR-AI-011 🚦·012 (운영 기록 스토어 소속, R1이 유일한 쓰기 주체)
CREATE TABLE IF NOT EXISTS review_records (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(book_id),
  target_type TEXT NOT NULL, -- chapter_summary | character | alias | relationship | character_note | background | intro 등
  target_id TEXT NOT NULL,
  hallucination_ok BOOLEAN, -- 환각 없음
  alias_merge_ok BOOLEAN, -- 별칭 통합 정확
  page_boundary_ok BOOLEAN, -- 페이지 경계 일치
  recap_continuity_ok BOOLEAN, -- 리캡 연결성
  info_separation_ok BOOLEAN, -- 정보 분리(배경지식·소개 혼입 없음)
  spoiler_free_ok BOOLEAN, -- 배경지식 1페이지 시점 안전(FR-BGK-002 🚦, 해당 항목만)
  correction_note TEXT, -- 수정 내용
  reviewer TEXT NOT NULL,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_review_records_target ON review_records (book_id, target_type, target_id);
