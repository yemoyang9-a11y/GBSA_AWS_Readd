/**
 * ① 콘텐츠 조회 Postgres 어댑터 — mock QueryClient
 * (R2 pg-repository.test.ts, R1 register.test.ts와 같은 스타일: 실 DB 없이 SQL·파라미터 검증)
 */

import { createPgContentRepository } from '../../../src/modules/content/pg-repository';
import type { QueryClient } from '../../../src/modules/content/pg-repository';

function mockClient(...resultSets: any[][]): {
  client: QueryClient;
  calls: { sql: string; params?: unknown[] }[];
} {
  const calls: { sql: string; params?: unknown[] }[] = [];
  let i = 0;
  return {
    client: {
      query: async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        return { rows: resultSets[i++] ?? [] };
      },
    },
    calls,
  };
}

describe('createPgContentRepository', () => {
  test('findCatalog는 books에서 미완비 도서까지 전부 읽는다 (S2 — 표지만 띄우고 잠근다)', async () => {
    const { client, calls } = mockClient([
      {
        book_id: 'takryu',
        title: '탁류',
        author: '채만식',
        cover_url: null,
        intro_summary: '소개',
        ssabi_ready: true,
      },
    ]);
    const repo = createPgContentRepository(client);

    const rows = await repo.findCatalog();

    expect(rows).toHaveLength(1);
    expect(rows[0].book_id).toBe('takryu');
    expect(calls[0].sql).toMatch(/FROM books/);
    // 미완비 도서를 제외하는 WHERE가 없어야 한다
    expect(calls[0].sql).not.toMatch(/ssabi_ready\s*=\s*(TRUE|true)/);
  });

  test('findReadiness는 ssabi_ready를 읽고, 도서가 없으면 null (FR-BRW-002 🚦)', async () => {
    const found = mockClient([{ ssabi_ready: false }]);
    expect(await createPgContentRepository(found.client).findReadiness('takryu')).toBe(false);
    expect(found.calls[0].params).toEqual(['takryu']);

    const missing = mockClient([]);
    expect(await createPgContentRepository(missing.client).findReadiness('nope')).toBeNull();
  });

  test('findBasicInfo는 publish_year·extent·total_pages를 books에서 읽는다 (FR-BRW-003 AC②)', async () => {
    const { client, calls } = mockClient([
      {
        title: '탁류',
        author: '채만식',
        publish_year: 1937,
        extent: '411페이지',
        total_pages: 411,
      },
    ]);
    const result = await createPgContentRepository(client).findBasicInfo('takryu');

    expect(result).toEqual({
      title: '탁류',
      author: '채만식',
      publish_year: 1937,
      extent: '411페이지',
      total_pages: 411,
    });
    expect(calls[0].params).toEqual(['takryu']);
  });

  test('findChapters는 장 경계 4필드만 읽는다 — 장 요약 컬럼을 섞지 않는다 (team-sync §4.1 R2 조건)', async () => {
    const { client, calls } = mockClient([
      { chapter_no: 1, title: '제1장', start_page: 1, end_page: 20 },
    ]);
    const rows = await createPgContentRepository(client).findChapters('takryu');

    expect(rows[0]).toEqual({ chapter_no: 1, title: '제1장', start_page: 1, end_page: 20 });
    expect(calls[0].sql).toMatch(/FROM chapters/);
    // 장 요약이 한 응답에 섞이면 정적 캐시로 전량이 프론트에 내려가 상한이 뚫린다
    expect(calls[0].sql).not.toMatch(/chapter_summaries/);
    expect(calls[0].sql).not.toMatch(/summary/);
  });

  test('findBackgroundAndIntro는 kind로 두 행을 갈라 담고, 없는 구분은 빈 문자열 (R5)', async () => {
    const { client, calls } = mockClient([
      { kind: 'background', content: '일제강점기 후반...' },
      { kind: 'intro', content: '1930년대 군산...' },
    ]);
    const result = await createPgContentRepository(client).findBackgroundAndIntro('takryu');

    expect(result).toEqual({ background: '일제강점기 후반...', introduction: '1930년대 군산...' });
    expect(calls[0].sql).toMatch(/FROM background_and_intro/);

    const empty = mockClient([]);
    expect(await createPgContentRepository(empty.client).findBackgroundAndIntro('takryu')).toEqual({
      background: '',
      introduction: '',
    });
  });

  test('findPage는 이웃 페이지를 산술이 아니라 DB에서 구한다 (team-sync §4.10)', async () => {
    const { client, calls } = mockClient([
      { page_no: 5, content: '본문', prev_page: 4, next_page: 6 },
    ]);
    const result = await createPgContentRepository(client).findPage('takryu', 5);

    expect(result).toEqual({ page_no: 5, content: '본문', prev_page: 4, next_page: 6 });
    expect(calls[0].params).toEqual(['takryu', 5]);
    expect(calls[0].sql).toMatch(/MAX\(page_no\)/);
    expect(calls[0].sql).toMatch(/MIN\(page_no\)/);
  });

  test('findPage — 페이지가 없으면 null (404의 재료)', async () => {
    const { client } = mockClient([]);
    expect(await createPgContentRepository(client).findPage('takryu', 999)).toBeNull();
  });
});
