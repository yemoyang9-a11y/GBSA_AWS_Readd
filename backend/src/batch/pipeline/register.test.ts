import { registerBook, QueryClient } from './register';
import { splitBook } from './split';

function mockClient(): { client: QueryClient; calls: { sql: string; params?: unknown[] }[] } {
  const calls: { sql: string; params?: unknown[] }[] = [];
  return {
    client: {
      query: async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        return { rows: [] };
      },
    },
    calls,
  };
}

describe('registerBook — FR-ADM-001 원문 등록', () => {
  const rawText = ['1 장1', '', '내용 문장입니다.', '', '2 장2', '', '둘째 장 문장입니다.', ''].join('\n');
  const { pages, chapters } = splitBook(rawText, 'takryu');

  test('도서 메타(발표연도·분량 포함)를 1건 upsert한다', async () => {
    const { client, calls } = mockClient();
    await registerBook(
      client,
      { book_id: 'takryu', title: '탁류', author: '채만식', publish_year: 1937, extent: '411페이지' },
      chapters,
      pages
    );

    const bookCall = calls.find((c) => c.sql.includes('INSERT INTO books'));
    expect(bookCall).toBeDefined();
    expect(bookCall?.params).toEqual(['takryu', '탁류', '채만식', null, 1937, '411페이지', pages.length]);
  });

  test('모든 장을 upsert한다', async () => {
    const { client, calls } = mockClient();
    await registerBook(client, { book_id: 'takryu', title: '탁류', author: '채만식' }, chapters, pages);

    const chapterCalls = calls.filter((c) => c.sql.includes('INSERT INTO chapters'));
    expect(chapterCalls).toHaveLength(chapters.length);
  });

  test('모든 페이지를 upsert한다 (원문 등록 완전성)', async () => {
    const { client, calls } = mockClient();
    await registerBook(client, { book_id: 'takryu', title: '탁류', author: '채만식' }, chapters, pages);

    const pageCalls = calls.filter((c) => c.sql.includes('INSERT INTO pages'));
    expect(pageCalls).toHaveLength(pages.length);
  });

  test('도서 메타 누락 필드는 null로 들어간다(값을 지어내지 않는다)', async () => {
    const { client, calls } = mockClient();
    await registerBook(client, { book_id: 'takryu', title: '탁류', author: '채만식' }, chapters, pages);

    const bookCall = calls.find((c) => c.sql.includes('INSERT INTO books'));
    expect(bookCall?.params?.[3]).toBeNull(); // cover_url
    expect(bookCall?.params?.[4]).toBeNull(); // publish_year
    expect(bookCall?.params?.[5]).toBeNull(); // extent
  });
});
