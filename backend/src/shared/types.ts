/**
 * 싸비 공통 타입 정의
 *
 * ⚠️ 이 파일은 R1, R2, R3, R4 전원이 공유합니다
 * ⚠️ 수정 시 반드시 팀 합의 후 진행
 */

// ============================================================================
// 기준점 스냅샷 (R2 제공 → R3, R4 소비)
// ============================================================================

/**
 * 기준점 스냅샷
 * R2의 getCutoffSnapshot 반환 타입
 *
 * @see architecture-r1.md 3.3절
 * @see dev-spec-00-shared.md 2.1절
 */
export interface CutoffSnapshot {
  /** 마지막으로 열어본 페이지 (저장값) */
  current_page: number;

  /** 기준점 (진도 레코드가 없으면 0, 있으면 current_page) - FR-PRG-003 🚦 */
  cutoff: number;

  /** 진도 퍼센트 (current_page / total_pages) */
  percent: number;

  /** 현재 장 정보 */
  chapter: {
    chapter_no: number;
    title: string;
  };
}

// ============================================================================
// 진도 이벤트 (클라이언트 → R2)
// ============================================================================

/**
 * 진도 이벤트
 *
 * @see architecture-r1.md 3.3절
 */
export interface ProgressEvent {
  /** 페이지 번호 */
  page: number;

  /** 클라이언트 단조 증가 시퀀스 (순서 보장용) */
  seq: number;
}

// ============================================================================
// 리캡 관련 (R2)
// ============================================================================

/**
 * 리캡 입력 (종합 코어용)
 */
export interface RecapInput {
  /** 완결된 장 요약 목록 (종료 페이지 <= K) */
  chapter_summaries: ChapterSummary[];

  /** 현재 장 원문 절단 [현재 장 시작 .. K] */
  current_chapter_text: string | null;

  /** 기준점 (로그용) */
  cutoff: number;
}

export interface ChapterSummary {
  chapter_no: number;
  title: string;
  content: string;
  end_page: number;
}

/**
 * 브리핑 응답
 *
 * ⚠️ applied_cutoff 추가 — R2·R4·R3 CP0 회신 합의(docs-local/R2-reply-to-R4-0820.txt 항목 3·7)로
 *    브리핑 응답 최상단에 K를 싣는다. 첫 진입(applied_cutoff === 0)은 `recap: null`이어도
 *    스트리밍 폴백 대상이 **아니다** — 클라이언트가 이 필드로 "폴백 필요"와 "표시할 내용
 *    자체가 없음"을 구분한다(❓Q1). recap/stream의 done 프레임에도 같은 이름으로 싣는다.
 */
export interface BriefingResponse {
  /** 이 응답이 적용한 기준점 K. 첫 진입 구분의 근거(❓Q1) — recap.service의 판단을 재계산하지 않는다 */
  applied_cutoff: number;

  /** 저장 리캡 (없으면 null, applied_cutoff > 0일 때만 클라이언트가 스트리밍 폴백 호출) */
  recap: string | null;

  /** 목차 위치 */
  current_chapter: {
    chapter_no: number;
    title: string;
  };

  /** 진도 파생값 */
  progress: {
    current_page: number;
    total_pages: number;
    percent: number;
  };
}

// ============================================================================
// 챗봇 관련 (R3)
// ============================================================================

/**
 * 챗봇 질의 요청
 */
export interface ChatRequest {
  /** 사용자 질문 */
  query: string;

  /** 진도 이벤트 동봉 (선택사항) */
  page?: number;
  seq?: number;
}

/**
 * 챗봇 근거 컨텍스트 (R3 내부)
 *
 * ⚠️ assembleChatbotContext 함수가 query를 인자로 받지 않음 (NFR-SEC-006 🚦)
 */
export interface ChatbotContext {
  /** 책 제목·저자 (상한 없음 — 배경지식과 같은 고정 메타데이터) */
  book: {
    title: string;
    author: string;
  };

  /** 장 요약 전량 */
  chapter_summaries: ChapterSummary[];

  /** 현재 장 원문 */
  current_chapter_text: string | null;

  /** 엔티티 전량 */
  entities: {
    characters: Character[];
    relationships: Relationship[];
    character_notes: CharacterNote[];
    terms: Term[];
    events: Event[];
  };

  /** 배경지식 전문 (상한 없음 - R5) */
  background: string;
}

/**
 * 검색 청크 결과
 */
export interface SearchChunk {
  page_no: number;
  content: string;
  distance: number;
}

// ============================================================================
// 챗봇 대화 이력 (R3, 2026-08-24 사용자·R2 조율 결정)
//
// @see backend/migrations/005_chatbot_conversation_history.sql
// ============================================================================

/**
 * 대화 목록 항목
 */
export interface ChatbotConversationSummary {
  id: number;
  /** KST 자정 기준 캘린더 날짜 'YYYY-MM-DD' */
  conversation_date: string;
  /** 첫 질문으로 자동 채워짐 */
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatbotConversationTurnView {
  role: 'user' | 'assistant';
  text: string;
}

/**
 * 대화 상세 — 전체 문답
 */
export interface ChatbotConversationDetail extends ChatbotConversationSummary {
  turns: ChatbotConversationTurnView[];
}

// ============================================================================
// 조회 API 관련 (R4)
// ============================================================================

/**
 * 카탈로그 아이템
 */
export interface BookCatalogItem {
  book_id: string;
  title: string;
  author: string;
  cover_url: string;
  total_pages: number;

  /** 싸비 데이터 준비 여부 (완비 여부) */
  ssabi_ready: boolean;

  /** 읽던 도서인 경우 진도 정보 */
  progress?: {
    current_page: number;
    percent: number;
  };
}

/**
 * 관계도 그래프 JSON
 *
 * @see architecture-r1.md 5.1.2절
 */
export interface RelationshipGraph {
  /** 노드 = 인물 (최초 등장 페이지 <= K) */
  nodes: GraphNode[];

  /** 간선 = 관계 (확립 페이지 <= K, 최신 라벨 1개) */
  edges: GraphEdge[];
}

export interface GraphNode {
  id: string;
  name: string;
  first_appearance_page: number;

  /** 별칭 목록 (최초 등장 페이지 <= K) */
  aliases: string[];
}

export interface GraphEdge {
  source: string;
  target: string;
  label: string;
  established_page: number;
}

/**
 * 인물 상세 정보
 */
export interface CharacterDetail {
  name: string;
  first_appearance_page: number;

  /** 별칭 목록 */
  aliases: Alias[];

  /** 인물 노트 (근거 페이지 <= K, 최대 8문장) */
  notes: string;
}

// ============================================================================
// 데이터베이스 엔티티 (공통)
// ============================================================================

export interface Character {
  id: string;
  book_id: string;
  name: string;
  first_appearance_page: number;
}

/**
 * 별칭 — `aliases` 테이블에는 **대리키가 없다.** PK 가 (book_id, alias, character_id)
 * 복합키다 (001_content_store.sql).
 *
 * 이 타입에 `id` 가 있어 실제 스키마와 어긋나 있었고, mock QueryClient 테스트가 그
 * 어긋남을 잡지 못해 실 DB 를 붙인 뒤에야 드러났다 (`column a.id does not exist`).
 *
 * `type` 은 API 계약의 필드명이고 DB 컬럼명은 `alias_type` 이다 — 매핑은 어댑터의
 * SQL 이 `alias_type AS type` 으로 한다.
 */
export interface Alias {
  character_id: string;
  alias: string;
  type: 'name' | 'title' | 'kinship' | 'nickname';
  first_appearance_page: number;
}

/**
 * 관계 (이력형)
 * 같은 쌍의 관계가 시간에 따라 변하면 복수 행
 *
 * @see A6 결정
 */
export interface Relationship {
  id: string;
  book_id: string;
  character_a_id: string;
  character_b_id: string;
  label: string;
  established_page: number;
}

export interface CharacterNote {
  id: string;
  character_id: string;
  note: string;
  source_page: number;
}

export interface Term {
  id: string;
  book_id: string;
  term: string;
  definition: string;
  first_appearance_page: number;
}

export interface Event {
  id: string;
  book_id: string;
  event: string;
  description: string;
  occurrence_page: number;
}

export interface Page {
  id: string;
  book_id: string;
  page_no: number;
  content: string;
  embedding?: number[]; // 1024 차원 벡터
}

export interface Chapter {
  id: string;
  book_id: string;
  chapter_no: number;
  title: string;
  start_page: number;
  end_page: number;
}

// ============================================================================
// 로그 필드 (NFR-OBS)
// ============================================================================

/**
 * 리캡 호출 로그
 * NFR-OBS-002 🚦
 */
export interface RecapCallLog {
  timestamp: Date;
  device_id: string;
  book_id: string;
  cutoff_page: number;

  /** 투입 장 요약 ID 목록 */
  input_chapter_summary_ids: string[];

  /** 현재 장 절단 페이지 */
  current_chapter_cutoff: number | null;

  /** 출력 참조 (S3 또는 로그 ID) */
  output_ref: string;

  /** 사용 모델 */
  model: string;

  /** 토큰 수 */
  tokens: {
    input: number;
    output: number;
  };

  /** 트리거 유형 */
  trigger: 'realtime' | 'session_end';
}

/**
 * 챗봇 질의 로그
 * NFR-OBS-005 🚦
 */
export interface ChatbotQueryLog {
  timestamp: Date;
  device_id: string;
  book_id: string;
  cutoff_page: number;
  query: string;
  /** 본문 드래그 인용(신규 UX). K와 무관하게 프롬프트에 별도 주입된 문장 — CP5 인젝션
   *  판정 시 이 필드도 봐야 "K 밖 콘텐츠가 어디서 들어왔는지" 설명이 된다 */
  quote?: string;

  /** 투입 레코드 ID 전수 (구분별) */
  input_records: {
    chapter_summaries: string[];
    current_chapter_pages: number[];
    characters: string[];
    relationships: string[];
    character_notes: string[];
    terms: string[];
    events: string[];
    background: string;
  };

  /** 검색 선정 페이지 번호·스코어 */
  search_selected_pages: Array<{
    page_no: number;
    distance: number;
  }>;

  /** 근거 부재 여부 */
  no_evidence: boolean;

  /** 선택된 모델 */
  model: string;

  /** 출력 참조 */
  output_ref: string;

  /** 토큰 수 */
  tokens: {
    input: number;
    output: number;
  };
}

// ============================================================================
// API 응답 공통
// ============================================================================

export interface ApiError {
  error: string;
  message: string;
  code?: string;
}

export interface ApiSuccess<T = unknown> {
  success: true;
  data: T;
}

// ============================================================================
// 환경 변수 타입
// ============================================================================

export interface EnvConfig {
  DATABASE_URL: string;
  AWS_REGION: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  BEDROCK_EMBED_MODEL: string;
  BEDROCK_CLAUDE_SONNET: string;
  BEDROCK_CLAUDE_HAIKU: string;
  PORT: number;
  NODE_ENV: 'development' | 'production' | 'test';
}
