/**
 * R2 테스트용 인메모리 페이크 리포지토리
 *
 * ⚠️ 이 파일은 tests/ 아래에만 존재한다. 프로덕션 코드가 이것을 import하지 않는다
 *    — 테스트용 우회 경로를 프로덕션에 만들지 않는다 (테스트 규약 3.3절).
 *
 * 픽스처는 공통 계약 3장의 시드 데이터 형태(페이지 20~30 · 장 3개)를 따른다.
 * R1의 시드가 적재되면 통합 테스트에서 실 데이터로 교체한다 (테스트 규약 3.1절).
 */

import type {
  BookMetaReader,
  ChapterBoundary,
  ChapterSummaryRecord,
  ConversationHistoryRepository,
  ReadingPositionRepository,
  ReadingSessionRepository,
  RecapCallLogger,
  RecapContentReader,
  RecapState,
  SavedRecapRepository,
  SessionRecapCacheRepository,
  StoredPosition,
  StoredSavedRecap,
  StoredSession,
  SweepTarget,
} from '../../../src/modules/reading-state/repository'
import type { Clock } from '../../../src/modules/reading-state/clock'
import type { RecapCallLog } from '../../../src/shared/types'

/** 진도(reading_position) 페이크 — R2 소유 테이블 */
export class FakeReadingPositionRepository implements ReadingPositionRepository {
  private readonly rows = new Map<string, StoredPosition>()

  /** 테스트에서 저장 위치를 세팅한다 (진도 이벤트 수용은 S2 범위) */
  set(deviceId: string, bookId: string, position: StoredPosition): void {
    this.rows.set(this.key(deviceId, bookId), position)
  }

  async findPosition(deviceId: string, bookId: string): Promise<StoredPosition | null> {
    return this.rows.get(this.key(deviceId, bookId)) ?? null
  }

  async savePosition(deviceId: string, bookId: string, position: StoredPosition): Promise<void> {
    this.rows.set(this.key(deviceId, bookId), position)
  }

  async resetEventSeq(deviceId: string, bookId: string): Promise<void> {
    const key = this.key(deviceId, bookId)
    const existing = this.rows.get(key)
    if (!existing) return
    this.rows.set(key, { ...existing, event_seq: 0 })
  }

  private key(deviceId: string, bookId: string): string {
    return `${deviceId}::${bookId}`
  }
}

interface FakeChapter extends ChapterBoundary {
  summary?: string
}

interface FakeBook {
  total_pages: number
  ready: boolean
  chapters: FakeChapter[]
  /** 장 경계 안의 각 페이지 원문. 키 = 페이지 번호. */
  pages: Map<number, string>
}

/** 공개 콘텐츠 스토어(도서·장 경계·장 요약·본문) 읽기 페이크 — R1 소유 테이블의 스텁 */
export class FakeBookMetaReader implements BookMetaReader, RecapContentReader {
  private readonly books = new Map<string, FakeBook>()

  set(
    bookId: string,
    book: {
      total_pages: number
      ready?: boolean
      chapters: FakeChapter[]
      pageTexts?: Record<number, string>
    }
  ): void {
    const pages = new Map<number, string>(
      Object.entries(book.pageTexts ?? {}).map(([k, v]) => [Number(k), v])
    )
    this.books.set(bookId, {
      total_pages: book.total_pages,
      ready: book.ready ?? true,
      chapters: book.chapters,
      pages,
    })
  }

  async findTotalPages(bookId: string): Promise<number | null> {
    return this.books.get(bookId)?.total_pages ?? null
  }

  async findReadiness(bookId: string): Promise<boolean | null> {
    const book = this.books.get(bookId)
    return book ? book.ready : null
  }

  async findChapterContaining(bookId: string, pageNo: number): Promise<ChapterBoundary | null> {
    const found = this.books
      .get(bookId)
      ?.chapters.find((c) => c.start_page <= pageNo && pageNo <= c.end_page)
    if (!found) return null
    return {
      chapter_no: found.chapter_no,
      title: found.title,
      start_page: found.start_page,
      end_page: found.end_page,
    }
  }

  async findCompletedChapterSummaries(
    bookId: string,
    cutoff: number
  ): Promise<ChapterSummaryRecord[]> {
    const book = this.books.get(bookId)
    if (!book) return []
    return book.chapters
      .filter((c) => c.end_page <= cutoff)
      .map((c) => ({
        chapter_no: c.chapter_no,
        title: c.title,
        content: c.summary ?? `[요약 없음: ${c.title}]`,
        end_page: c.end_page,
      }))
  }

  async findCurrentChapterPageTexts(
    bookId: string,
    cutoff: number,
    fromPage: number
  ): Promise<string[]> {
    const book = this.books.get(bookId)
    if (!book) return []
    const texts: string[] = []
    for (let p = fromPage; p <= cutoff; p++) {
      const text = book.pages.get(p)
      if (text !== undefined) texts.push(text)
    }
    return texts
  }
}

/** 세션(reading_session) 페이크 — R2 소유 테이블 (S3·S4) */
export class FakeReadingSessionRepository implements ReadingSessionRepository {
  private readonly rows = new Map<string, StoredSession>()

  /** 테스트에서 세션 레코드를 직접 세팅한다. */
  set(deviceId: string, bookId: string, session: StoredSession): void {
    this.rows.set(this.key(deviceId, bookId), session)
  }

  async findSession(deviceId: string, bookId: string): Promise<StoredSession | null> {
    return this.rows.get(this.key(deviceId, bookId)) ?? null
  }

  async recordActivity(deviceId: string, bookId: string): Promise<void> {
    const key = this.key(deviceId, bookId)
    const existing = this.rows.get(key)
    this.rows.set(key, {
      last_activity_at: this.clock.now(),
      recap_state: 'none',
      session_epoch: existing?.session_epoch ?? 1,
    })
  }

  async startNewSession(deviceId: string, bookId: string): Promise<{ session_epoch: number }> {
    const key = this.key(deviceId, bookId)
    const existing = this.rows.get(key)
    const session_epoch = (existing?.session_epoch ?? 0) + 1
    this.rows.set(key, {
      last_activity_at: this.clock.now(),
      recap_state: 'none',
      session_epoch,
    })
    return { session_epoch }
  }

  async findSweepTargets(before: Date): Promise<SweepTarget[]> {
    const out: SweepTarget[] = []
    for (const [key, session] of this.rows.entries()) {
      if (session.recap_state === 'none' && session.last_activity_at < before) {
        const [device_id, book_id] = key.split('::')
        out.push({ device_id, book_id })
      }
    }
    return out
  }

  async markPending(deviceId: string, bookId: string): Promise<void> {
    this.setState(deviceId, bookId, 'pending')
  }

  async markDone(deviceId: string, bookId: string): Promise<void> {
    this.setState(deviceId, bookId, 'done')
  }

  async markFailed(deviceId: string, bookId: string): Promise<void> {
    this.setState(deviceId, bookId, 'failed')
  }

  constructor(private readonly clock: Clock) {}

  private setState(deviceId: string, bookId: string, state: RecapState): void {
    const key = this.key(deviceId, bookId)
    const existing = this.rows.get(key)
    if (!existing) return
    this.rows.set(key, { ...existing, recap_state: state })
  }

  private key(deviceId: string, bookId: string): string {
    return `${deviceId}::${bookId}`
  }
}

/** 저장 리캡(saved_recap) 페이크 — R2 소유 테이블 (S5·S6) */
export class FakeSavedRecapRepository implements SavedRecapRepository {
  private readonly rows = new Map<string, StoredSavedRecap>()

  set(deviceId: string, bookId: string, recap: StoredSavedRecap): void {
    this.rows.set(this.key(deviceId, bookId), recap)
  }

  async findSavedRecap(deviceId: string, bookId: string): Promise<StoredSavedRecap | null> {
    return this.rows.get(this.key(deviceId, bookId)) ?? null
  }

  async upsertSavedRecap(
    deviceId: string,
    bookId: string,
    cutoffPage: number,
    recapText: string
  ): Promise<void> {
    this.rows.set(this.key(deviceId, bookId), { cutoff_page: cutoffPage, recap_text: recapText })
  }

  private key(deviceId: string, bookId: string): string {
    return `${deviceId}::${bookId}`
  }
}

/** 세션 리캡 캐시(session_recap_cache) 페이크 — R2 소유 테이블 (S5) */
export class FakeSessionRecapCacheRepository implements SessionRecapCacheRepository {
  private readonly rows = new Map<string, string>()

  async findCached(deviceId: string, bookId: string, cutoff: number): Promise<string | null> {
    return this.rows.get(this.key(deviceId, bookId, cutoff)) ?? null
  }

  async saveCached(
    deviceId: string,
    bookId: string,
    cutoff: number,
    recapText: string,
    _expiresAt: Date
  ): Promise<void> {
    this.rows.set(this.key(deviceId, bookId, cutoff), recapText)
  }

  private key(deviceId: string, bookId: string, cutoff: number): string {
    return `${deviceId}::${bookId}::${cutoff}`
  }
}

/** 대화 이력(conversation_history) 페이크 — 세션 종료 시 파기 대상 (A7, S4) */
export class FakeConversationHistoryRepository implements ConversationHistoryRepository {
  private readonly purged: string[] = []

  async purge(deviceId: string, bookId: string): Promise<void> {
    this.purged.push(`${deviceId}::${bookId}`)
  }

  wasPurged(deviceId: string, bookId: string): boolean {
    return this.purged.includes(`${deviceId}::${bookId}`)
  }
}

/** 리캡 호출 로그(NFR-OBS-002 🚦) 페이크 — 기록 건수·필드를 테스트에서 검증한다 (S5) */
export class FakeRecapCallLogger implements RecapCallLogger {
  readonly records: RecapCallLog[] = []

  async record(entry: RecapCallLog): Promise<void> {
    this.records.push(entry)
  }
}

/** 테스트에서 시각을 고정·전진시키는 페이크 시계 (S3·S4) */
export class FakeClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return this.current
  }

  advanceMinutes(minutes: number): void {
    this.current = new Date(this.current.getTime() + minutes * 60_000)
  }
}

export const SEED_BOOK_ID = 'seed-book-takryu-v1'
export const SEED_DEVICE_ID = 'seed-device-0001'

/**
 * 시드 형태 픽스처 — 「탁류」 1권 축약본
 * 총 30페이지 · 장 3개 (경계가 정확히 10/20/30에서 끝난다 — 장 경계 케이스 검증용)
 *
 * ⚠️ `SEED_BOOK.total_pages` · `SEED_BOOK.chapters`는 S1 이후 기존 테스트가 참조하는 형태다
 *    (cutoff.service.test.ts). S5 픽스처(요약·원문)를 더하며 모양을 바꾸지 않았다.
 */
export const SEED_BOOK: { total_pages: number; chapters: FakeChapter[] } = {
  total_pages: 30,
  chapters: [
    { chapter_no: 1, title: '제1장 인간기념물', start_page: 1, end_page: 10, summary: '1장 요약' },
    { chapter_no: 2, title: '제2장 불효자식', start_page: 11, end_page: 20, summary: '2장 요약' },
    { chapter_no: 3, title: '제3장 생활 제일과', start_page: 21, end_page: 30, summary: '3장 요약' },
  ],
}

/** 페이지 전체에 "p.N 원문" 텍스트를 채운다 — S5 현재 장 원문 절단 조립 테스트용. */
function seedPageTexts(): Record<number, string> {
  const out: Record<number, string> = {}
  for (let p = 1; p <= SEED_BOOK.total_pages; p++) out[p] = `p.${p} 원문`
  return out
}

/** 시드 픽스처가 적재된 페이크 한 쌍을 만든다 */
export function makeSeededFakes(): {
  positions: FakeReadingPositionRepository
  books: FakeBookMetaReader
} {
  const positions = new FakeReadingPositionRepository()
  const books = new FakeBookMetaReader()
  books.set(SEED_BOOK_ID, {
    total_pages: SEED_BOOK.total_pages,
    chapters: SEED_BOOK.chapters,
    pageTexts: seedPageTexts(),
  })
  return { positions, books }
}
