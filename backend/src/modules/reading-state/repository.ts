/**
 * ② 독서 상태 서비스 — 리포지토리 계약 (R2)
 *
 * @see dev-spec-00-shared.md 2.2절 — 리포지토리 시그니처 규칙
 * @see architecture-r1.md 4.3절 · 5.1.2절
 *
 * ⚠️ 상한(cutoff)이 걸리는 저장소 접근은 전부 `findX(bookId, cutoff, ...)` 형태를 갖는다
 *    (FR-SPL-002 🚦). 이 파일의 함수들은 **상한이 걸리는 조회가 아니다** — 각각의 근거를
 *    시그니처마다 주석으로 남긴다. cutoff 인자가 없는 이유가 명시되지 않은 조회 함수를
 *    이 계층에 추가하지 않는다 (CP4 교차 리뷰 항목 1·2).
 */

/** 진도 테이블(reading_position)의 저장 레코드 — 5.1.2절 */
export interface StoredPosition {
  /** 마지막으로 열어본 페이지. 이 시스템의 유일한 저장값 (3.3절) */
  current_page: number

  /** 클라이언트 단조 증가 시퀀스. 순서 보장용 (FR-PRG-002) */
  event_seq: number
}

/** 장 경계 테이블에서 뽑은 장 식별 정보 */
export interface ChapterRef {
  chapter_no: number
  title: string
}

/**
 * 장 경계 전체(시작/종료 페이지 포함) — S5 리캡 조립이 "K가 장 중간인지"를
 * 판정하려면 시작·종료 페이지가 필요하다. ChapterRef를 좁게 유지한 이유(목차 표시용,
 * S1)와 다른 소비처이므로 별도 타입으로 둔다 — 기존 소비처의 계약을 넓히지 않는다.
 */
export interface ChapterBoundary extends ChapterRef {
  start_page: number
  end_page: number
}

/**
 * 진도 리포지토리 — 독서 상태 스토어 (R2 소유, 쓰기 주체 ②)
 */
export interface ReadingPositionRepository {
  /**
   * (디바이스, 도서)의 저장 위치를 읽는다. 없으면 null (= 첫 진입).
   *
   * cutoff 인자 없음의 근거 — 이 조회가 **cutoff의 원천**이다. 상한을 적용받는 쪽이
   * 아니라 상한을 만들어내는 쪽이므로 상한 개념이 성립하지 않는다 (3.3절).
   */
  findPosition(deviceId: string, bookId: string): Promise<StoredPosition | null>

  /**
   * 진도 이벤트를 그대로 저장한다. "더 새로운 seq일 때만 수용"의 판단은 이 함수의
   * 책임이 아니다 — progress.service.ts가 판단을 마친 뒤에만 이 함수를 호출한다
   * (FR-PRG-002, S2). 리포지토리 계층에 판단 로직을 두면 조회 요청 동봉 경로(3.3절)에서
   * 같은 판단이 중복·분산될 위험이 있다.
   *
   * cutoff 인자 없음의 근거 — findPosition과 동일하게 cutoff의 원천이다.
   */
  savePosition(deviceId: string, bookId: string, position: StoredPosition): Promise<void>

  /**
   * 저장된 `event_seq`를 0으로 되돌린다. 저장 위치가 없으면 아무 것도 하지 않는다 —
   * 첫 진입은 `acceptProgressEvent`가 "저장 위치 없음 = seq 무관 수용"으로 이미 처리한다.
   *
   * 진입 시 seq 기준선을 리셋한다 (S3, R4 CP0 회신 항목 2 — 앱 재시작은 반드시 entry를
   * 거치므로 클라이언트가 seq를 이어붙이지 않아도 된다). cutoff 인자 없음의 근거 —
   * findPosition·savePosition과 동일하게 cutoff의 원천이다.
   */
  resetEventSeq(deviceId: string, bookId: string): Promise<void>
}

/**
 * 공개 콘텐츠 스토어 읽기 — 도서 메타·장 경계 (R1 소유 테이블, ②는 읽기 전용)
 *
 * 파생값 계산에 필요한 최소 두 가지만 노출한다. 본문·엔티티 조회는 ①③의 몫이다.
 */
export interface BookMetaReader {
  /**
   * 도서의 전체 페이지 수 — 진도 % 파생의 분모 (R2 불변식, MVP 1장). 도서가 없으면 null.
   *
   * cutoff 인자 없음의 근거 — 도서 메타이며 위치 값을 가진 레코드가 아니다.
   * 전체 페이지 수는 진도와 무관하게 대시보드에도 노출되는 값이다 (FR-BRW-001).
   */
  findTotalPages(bookId: string): Promise<number | null>

  /**
   * `pageNo`가 속한 장을 찾는다 (start_page <= pageNo <= end_page). 없으면 null.
   *
   * cutoff 인자 없음의 근거 — **목차는 전체 상시 노출**이므로 장 경계는 상한 대상이
   * 아니다 (R3 불변식, FR-SPL-001 주석 · FR-NAV-001). 상한이 걸리는 것은 장 *요약*이며
   * 그쪽은 리캡 조립에서 `end_page <= K`로 절단한다 (S5, FR-SPL-003 🚦).
   *
   * S5가 같은 함수를 K(cutoff)에 대해 호출해 "K가 장 중간인지"를 판정한다 — 그 호출도
   * 조회 대상은 장 경계(상한 비대상)이지 장 요약이 아니므로 이 근거가 그대로 적용된다.
   */
  findChapterContaining(bookId: string, pageNo: number): Promise<ChapterBoundary | null>

  /**
   * 도서의 완비 여부(ssabi_ready) — 미완비 도서 진입 거절의 근거 (FR-BRW-002, S3).
   * 도서가 없으면 null — 호출부가 진입 거절 사유(존재하지만 미완비 vs 부재)를 갈라 쓸지는
   * 라우트 계층 판단이다. R2는 두 경우 모두 진입을 막는다는 사실만 이 함수로 보장한다.
   *
   * cutoff 인자 없음의 근거 — 도서 메타이며 진도와 무관한 정적 플래그다(대시보드에도
   * 동일 값이 노출된다, FR-BRW-002).
   */
  findReadiness(bookId: string): Promise<boolean | null>
}

// ============================================================================
// 세션 — 무조작 30분 판정 + 스위퍼 대상 선별 (R6, FR-DAT-011, S3·S4)
// ============================================================================

export type RecapState = 'none' | 'pending' | 'done' | 'failed'

/** 세션 테이블(reading_session)의 저장 레코드 — 5.1.2절 */
export interface StoredSession {
  last_activity_at: Date
  recap_state: RecapState
  session_epoch: number
}

/** 스위퍼 스캔이 선별한 대상 1건 */
export interface SweepTarget {
  device_id: string
  book_id: string
}

export interface ReadingSessionRepository {
  /** (디바이스, 도서)의 세션 레코드를 읽는다. 없으면 null (= 이 조합 최초 진입). */
  findSession(deviceId: string, bookId: string): Promise<StoredSession | null>

  /**
   * "조작 이벤트 수신" 갱신 — `last_activity_at = now`, `recap_state = 'none'` (4.4.1절).
   * 레코드가 없으면 `session_epoch = 1`로 새로 만든다. 세션 경계(epoch 증가) 판단은
   * 이 함수의 책임이 아니다 — 그 판단은 session.service.ts의 진입 판정이 미리 마친다
   * (S2와 같은 층 분리 원칙: 리포지토리는 판단하지 않고 쓴다).
   */
  recordActivity(deviceId: string, bookId: string): Promise<void>

  /**
   * 새 세션 경계를 연다 — `session_epoch`를 1 증가시키고(레코드가 없으면 1로 시작)
   * `last_activity_at = now`, `recap_state = 'none'`을 함께 쓴다. 진입 판정(S3)이
   * "새 세션"으로 판단했을 때만 호출한다.
   */
  startNewSession(deviceId: string, bookId: string): Promise<{ session_epoch: number }>

  /**
   * 스위퍼 스캔 대상 — `recap_state = 'none' AND last_activity_at < before` (4.4.1절).
   *
   * cutoff 인자 없음의 근거 — 이 조회의 필터는 진도 상한이 아니라 세션 비활성 시각이다.
   * 스위퍼는 실행 단위이며 상한 개념이 없는 쓰기 주체와 동급이다(00-shared 2.2절 예외).
   */
  findSweepTargets(before: Date): Promise<SweepTarget[]>

  /** 스위퍼가 잡을 발행하기 전에 상태를 선점한다 — 다음 스캔이 같은 대상을 다시 집지 않는다. */
  markPending(deviceId: string, bookId: string): Promise<void>

  /** 리캡 생성 잡 성공 종료. */
  markDone(deviceId: string, bookId: string): Promise<void>

  /** 리캡 생성 잡 실패 종료 — 사용자 동선은 막지 않는다 (NFR-AI-016, 브리핑 폴백으로 흡수). */
  markFailed(deviceId: string, bookId: string): Promise<void>
}

// ============================================================================
// 리캡 조립 입력 — 공개 콘텐츠 스토어 읽기 (R1 소유 테이블, ④는 읽기 전용, S5)
// ============================================================================

/** 완결된 장 요약 1건. `id`는 없다 — PK가 (도서ID, 장 번호)이므로 로그의 "요약 ID"는 장 번호를 쓴다 (5.1.1절). */
export interface ChapterSummaryRecord {
  chapter_no: number
  title: string
  content: string
  end_page: number
}

export interface RecapContentReader {
  /**
   * 완결된 장 요약 전부 — `종료 페이지 <= cutoff` (FR-SPL-003 🚦). 상한이 걸리는 조회이므로
   * `findX(bookId, cutoff, ...)` 형태를 따른다 (00-shared 2.2절).
   */
  findCompletedChapterSummaries(bookId: string, cutoff: number): Promise<ChapterSummaryRecord[]>

  /**
   * `fromPage`부터 `cutoff`까지의 본문 페이지 텍스트 — "현재 장 원문 절단"의 원천
   * (FR-SPL-003 🚦). `fromPage`는 K가 속한 장의 시작 페이지이며, 호출부(recap-assembly)가
   * `findChapterContaining(bookId, cutoff)`로 먼저 구해 넘긴다. 페이지 번호 순으로 반환한다.
   */
  findCurrentChapterPageTexts(bookId: string, cutoff: number, fromPage: number): Promise<string[]>
}

// ============================================================================
// 저장 리캡 · 세션 리캡 캐시 — R2 소유 테이블 (R7·R8, S5·S6)
// ============================================================================

export interface StoredSavedRecap {
  cutoff_page: number
  recap_text: string
}

export interface SavedRecapRepository {
  /** (디바이스, 도서)의 저장 리캡을 읽는다. 없으면 null. */
  findSavedRecap(deviceId: string, bookId: string): Promise<StoredSavedRecap | null>

  /** 사용자·도서당 1건 upsert (R7, FR-DAT-009). */
  upsertSavedRecap(deviceId: string, bookId: string, cutoffPage: number, recapText: string): Promise<void>
}

export interface SessionRecapCacheRepository {
  /** 기준점(cutoff)별 적중 판정 — 다르면 캐시 미스다 (R8, UC-09 A7). */
  findCached(deviceId: string, bookId: string, cutoff: number): Promise<string | null>

  /** 실시간 생성분 적재. 영구 저장이 아니다 — `expiresAt` 이후 스위퍼·TTL이 정리한다 (FR-DAT-010). */
  saveCached(
    deviceId: string,
    bookId: string,
    cutoff: number,
    recapText: string,
    expiresAt: Date
  ): Promise<void>
}

// ============================================================================
// 대화 이력 — 세션 종료 시 파기 대상 (A7, S4)
// ============================================================================

export interface ConversationHistoryRepository {
  /** 세션 종료 시 대화 이력을 파기한다. 질의 로그(운영 기록 스토어)는 별도 테이블이며 대상이 아니다. */
  purge(deviceId: string, bookId: string): Promise<void>
}
