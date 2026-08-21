/**
 * ① 콘텐츠 조회 Postgres 어댑터 (R1)
 *
 * R2 pg-repository.ts와 같은 패턴 — pg.Pool을 직접 import하지 않고 최소 QueryClient를 받는다.
 * 실 배선(pool 주입)은 composition.ts의 몫이고, SQL 자체는 mock QueryClient로 단위 테스트한다.
 *
 * ⚠️ books·pages·chapters·background_and_intro는 R1 소유 테이블이다 (001_content_store.sql).
 *    이 파일은 컬럼명을 그대로 읽기만 한다 — 쓰기 없음 (절대 규칙 5번).
 */

import type {
  BackgroundAndIntro,
  BookBasicRow,
  BookCatalogRow,
  ChapterRow,
  ContentRepository,
  PageRow,
} from './repository'

export interface QueryClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>
}

export function createPgContentRepository(db: QueryClient): ContentRepository {
  return {
    async findCatalog(): Promise<BookCatalogRow[]> {
      // 미완비 도서도 내려보낸다 — 대시보드가 표지만 띄우고 클릭을 잠근다 (S2, FR-BRW-002 🚦).
      // 진입 차단은 UI가 아니라 book-ready.guard.ts와 R2의 POST /entry가 한다.
      const { rows } = await db.query(
        `SELECT book_id, title, author, cover_url, intro_summary, ssabi_ready
           FROM books
          ORDER BY title ASC`
      )
      return rows
    },

    async findReadiness(bookId: string): Promise<boolean | null> {
      // FR-BRW-002 🚦 — R2의 POST /entry와 같은 컬럼(ssabi_ready)을 본다.
      // 서로 다른 컬럼을 보면 대시보드는 잠겨 있는데 직접 진입은 되는 구멍이 생긴다 (R12, team-sync §4.7)
      const { rows } = await db.query(`SELECT ssabi_ready FROM books WHERE book_id = $1`, [bookId])
      if (rows.length === 0) return null
      return rows[0].ssabi_ready
    },

    async findBasicInfo(bookId: string): Promise<BookBasicRow | null> {
      // FR-BRW-003 AC② — 제목·저자·발표연도·분량
      const { rows } = await db.query(
        `SELECT title, author, publish_year, extent, total_pages
           FROM books
          WHERE book_id = $1`,
        [bookId]
      )
      if (rows.length === 0) return null
      return rows[0]
    },

    async findChapters(bookId: string): Promise<ChapterRow[]> {
      // FR-NAV-001, R3 — 목차는 전체 상시 노출이라 cutoff를 걸지 않는다.
      // ⚠️ chapter_summaries를 JOIN하지 않는다. 장 요약은 상한 대상(FR-SPL-003 🚦)이라
      //    한 응답에 섞이면 정적 캐시로 전량이 프론트에 내려가 상한이 뚫린다 (team-sync §4.1)
      const { rows } = await db.query(
        `SELECT chapter_no, title, start_page, end_page
           FROM chapters
          WHERE book_id = $1
          ORDER BY chapter_no ASC`,
        [bookId]
      )
      return rows
    },

    async findBackgroundAndIntro(bookId: string): Promise<BackgroundAndIntro> {
      // R5, FR-BGK-002 🚦 — 배경지식은 상한 대상이 아니다. 1페이지 시점에도 안전한 고정
      // 콘텐츠이며 안전 보증은 검수(R1)가 한다. 여기에 cutoff 필터를 걸지 않는다.
      const { rows } = await db.query(
        `SELECT kind, content FROM background_and_intro WHERE book_id = $1`,
        [bookId]
      )
      const byKind = new Map<string, string>(rows.map((r: any) => [r.kind, r.content]))
      return {
        introduction: byKind.get('intro') ?? '',
        background: byKind.get('background') ?? '',
      }
    },

    async findPage(bookId: string, pageNo: number): Promise<PageRow | null> {
      // R3 — 본문 접근은 제한하지 않는다. 진도에도 관여하지 않는다 (FR-PRG-001, 선요청 안전).
      // prev/next를 page ± 1 산술이 아니라 실제 행에서 구한다 — 페이지 번호에 구멍이 있어도
      // 정확하고, 프론트가 이동 산술을 하지 않게 된다 (team-sync §4.10)
      const { rows } = await db.query(
        `SELECT p.page_no,
                p.content,
                (SELECT MAX(page_no) FROM pages WHERE book_id = $1 AND page_no < $2) AS prev_page,
                (SELECT MIN(page_no) FROM pages WHERE book_id = $1 AND page_no > $2) AS next_page
           FROM pages p
          WHERE p.book_id = $1 AND p.page_no = $2`,
        [bookId, pageNo]
      )
      if (rows.length === 0) return null
      return rows[0]
    },
  }
}
