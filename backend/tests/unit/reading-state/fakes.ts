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
  ChapterRef,
  ReadingPositionRepository,
  StoredPosition,
} from '../../../src/modules/reading-state/repository'

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

  private key(deviceId: string, bookId: string): string {
    return `${deviceId}::${bookId}`
  }
}

interface FakeBook {
  total_pages: number
  chapters: Array<ChapterRef & { start_page: number; end_page: number }>
}

/** 공개 콘텐츠 스토어(도서·장 경계) 읽기 페이크 — R1 소유 테이블의 스텁 */
export class FakeBookMetaReader implements BookMetaReader {
  private readonly books = new Map<string, FakeBook>()

  set(bookId: string, book: FakeBook): void {
    this.books.set(bookId, book)
  }

  async findTotalPages(bookId: string): Promise<number | null> {
    return this.books.get(bookId)?.total_pages ?? null
  }

  async findChapterContaining(bookId: string, pageNo: number): Promise<ChapterRef | null> {
    const found = this.books
      .get(bookId)
      ?.chapters.find((c) => c.start_page <= pageNo && pageNo <= c.end_page)
    return found ? { chapter_no: found.chapter_no, title: found.title } : null
  }
}

export const SEED_BOOK_ID = 'seed-book-takryu-v1'
export const SEED_DEVICE_ID = 'seed-device-0001'

/**
 * 시드 형태 픽스처 — 「탁류」 1권 축약본
 * 총 30페이지 · 장 3개 (경계가 정확히 10/20/30에서 끝난다 — 장 경계 케이스 검증용)
 */
export const SEED_BOOK: FakeBook = {
  total_pages: 30,
  chapters: [
    { chapter_no: 1, title: '제1장 인간기념물', start_page: 1, end_page: 10 },
    { chapter_no: 2, title: '제2장 불효자식', start_page: 11, end_page: 20 },
    { chapter_no: 3, title: '제3장 생활 제일과', start_page: 21, end_page: 30 },
  ],
}

/** 시드 픽스처가 적재된 페이크 한 쌍을 만든다 */
export function makeSeededFakes(): {
  positions: FakeReadingPositionRepository
  books: FakeBookMetaReader
} {
  const positions = new FakeReadingPositionRepository()
  const books = new FakeBookMetaReader()
  books.set(SEED_BOOK_ID, SEED_BOOK)
  return { positions, books }
}
