/**
 * FR-ADM-001 원문 등록 — 도서·장 경계·페이지를 공개 콘텐츠 스토어에 적재한다.
 * 공개 콘텐츠 스토어의 유일한 쓰기 주체는 파이프라인(⑦)이다 (4.3절).
 *
 * DB 커넥션 대신 최소 인터페이스(QueryClient)를 받아, 실제 pg.Pool과
 * 테스트용 mock 양쪽에 그대로 쓸 수 있게 한다.
 */
import { Chapter, Page } from '../../shared/types';

export interface QueryClient {
  query(sql: string, params?: unknown[]): Promise<unknown>;
}

export interface BookMeta {
  book_id: string;
  title: string;
  author: string;
  cover_url?: string;
  publish_year?: number;
  /** "분량" — 도서 소개용 짧은 문구(예: "411페이지"). total_pages 컬럼과 별개 — FR-BRW-003 */
  extent?: string;
}

/** 도서 메타 + 장 경계 + 페이지를 upsert한다. 완비 여부/공개 상태는 항상 draft로 등록한다(FR-ADM-006) */
export async function registerBook(
  client: QueryClient,
  meta: BookMeta,
  chapters: Chapter[],
  pages: Page[]
): Promise<void> {
  await client.query(
    `INSERT INTO books (book_id, title, author, cover_url, publish_year, extent, total_pages, ssabi_ready, publish_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, false, 'draft')
     ON CONFLICT (book_id) DO UPDATE SET
       title = $2, author = $3, cover_url = $4, publish_year = $5, extent = $6, total_pages = $7`,
    [meta.book_id, meta.title, meta.author, meta.cover_url ?? null, meta.publish_year ?? null, meta.extent ?? null, pages.length]
  );

  for (const chapter of chapters) {
    await client.query(
      `INSERT INTO chapters (book_id, chapter_no, title, start_page, end_page)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (book_id, chapter_no) DO UPDATE SET
         title = $3, start_page = $4, end_page = $5`,
      [chapter.book_id, chapter.chapter_no, chapter.title, chapter.start_page, chapter.end_page]
    );
  }

  for (const page of pages) {
    await client.query(
      `INSERT INTO pages (book_id, page_no, content)
       VALUES ($1, $2, $3)
       ON CONFLICT (book_id, page_no) DO UPDATE SET content = $3`,
      [page.book_id, page.page_no, page.content]
    );
  }
}
