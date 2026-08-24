import { registerBook, registerGeneratedContent, QueryClient } from './register';
import { splitBook } from './split';
import { ResolvedBookData } from './check-integrity';

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
  const rawText = [
    '1 장1',
    '',
    '내용 문장입니다.',
    '',
    '2 장2',
    '',
    '둘째 장 문장입니다.',
    '',
  ].join('\n');
  const { pages, chapters } = splitBook(rawText, 'takryu');

  test('도서 메타(발표연도·분량 포함)를 1건 upsert한다', async () => {
    const { client, calls } = mockClient();
    await registerBook(
      client,
      {
        book_id: 'takryu',
        title: '탁류',
        author: '채만식',
        publish_year: 1937,
        extent: '411페이지',
      },
      chapters,
      pages
    );

    const bookCall = calls.find((c) => c.sql.includes('INSERT INTO books'));
    expect(bookCall).toBeDefined();
    expect(bookCall?.params).toEqual([
      'takryu',
      '탁류',
      '채만식',
      null,
      1937,
      '411페이지',
      pages.length,
    ]);
  });

  test('모든 장을 upsert한다', async () => {
    const { client, calls } = mockClient();
    await registerBook(
      client,
      { book_id: 'takryu', title: '탁류', author: '채만식' },
      chapters,
      pages
    );

    const chapterCalls = calls.filter((c) => c.sql.includes('INSERT INTO chapters'));
    expect(chapterCalls).toHaveLength(chapters.length);
  });

  test('모든 페이지를 upsert한다 (원문 등록 완전성)', async () => {
    const { client, calls } = mockClient();
    await registerBook(
      client,
      { book_id: 'takryu', title: '탁류', author: '채만식' },
      chapters,
      pages
    );

    const pageCalls = calls.filter((c) => c.sql.includes('INSERT INTO pages'));
    expect(pageCalls).toHaveLength(pages.length);
  });

  test('도서 메타 누락 필드는 null로 들어간다(값을 지어내지 않는다)', async () => {
    const { client, calls } = mockClient();
    await registerBook(
      client,
      { book_id: 'takryu', title: '탁류', author: '채만식' },
      chapters,
      pages
    );

    const bookCall = calls.find((c) => c.sql.includes('INSERT INTO books'));
    expect(bookCall?.params?.[3]).toBeNull(); // cover_url
    expect(bookCall?.params?.[4]).toBeNull(); // publish_year
    expect(bookCall?.params?.[5]).toBeNull(); // extent
  });
});

describe('registerGeneratedContent — S4/S5 산출물 적재 (FR-DAT-003~008)', () => {
  const data: ResolvedBookData = {
    book_id: 'takryu',
    chapter_summaries: [{ chapter_no: 1, title: '인간기념물', summary: '장 1 요약' }],
    characters: [
      {
        id: 'char-1',
        name: '정주사',
        first_appearance_page: 2,
        aliases: [{ alias: '영감님', type: 'nickname', first_appearance_page: 3 }],
        notes: [{ id: 'note-1', note: '중늙은이', source_page: 2 }],
      },
      { id: 'char-2', name: '고태수', first_appearance_page: 2, aliases: [], notes: [] },
    ],
    relationships: [
      {
        id: 'rel-1',
        character_a_id: 'char-1',
        character_b_id: 'char-2',
        label: '싸움 중재',
        established_page: 2,
      },
    ],
    terms: [
      { id: 'term-1', term: '미두장', definition: '선물 곡물 거래소', first_appearance_page: 2 },
    ],
    events: [
      { id: '1-0', event: '멱살잡이', description: '정주사가 봉욕을 당함', occurrence_page: 2 },
    ],
    background_and_intro: { background: '배경 설명', intro: '소개 문구' },
  };

  test('장 요약을 upsert하고 review_status는 건드리지 않는다(재검수 판정 보존)', async () => {
    const { client, calls } = mockClient();
    await registerGeneratedContent(client, data);

    const call = calls.find((c) => c.sql.includes('INSERT INTO chapter_summaries'));
    expect(call).toBeDefined();
    expect(call?.sql).not.toMatch(/review_status/);
    expect(call?.params).toEqual(['takryu', 1, '장 1 요약']);
  });

  test('인물과 그 별칭·노트를 모두 upsert한다', async () => {
    const { client, calls } = mockClient();
    await registerGeneratedContent(client, data);

    expect(calls.filter((c) => c.sql.includes('INSERT INTO characters'))).toHaveLength(2);
    expect(calls.filter((c) => c.sql.includes('INSERT INTO aliases'))).toHaveLength(1);
    expect(calls.filter((c) => c.sql.includes('INSERT INTO character_notes'))).toHaveLength(1);
  });

  test('관계·용어·사건을 모두 upsert한다', async () => {
    const { client, calls } = mockClient();
    await registerGeneratedContent(client, data);

    expect(calls.filter((c) => c.sql.includes('INSERT INTO relationships'))).toHaveLength(1);
    expect(calls.filter((c) => c.sql.includes('INSERT INTO terms'))).toHaveLength(1);
    expect(calls.filter((c) => c.sql.includes('INSERT INTO events'))).toHaveLength(1);
  });

  test('FR-CHR-001: 입력 순서와 무관하게 character_a_id/character_b_id를 정렬된 순서로 저장한다', async () => {
    const flipped: ResolvedBookData = {
      ...data,
      relationships: [
        {
          id: 'rel-1',
          character_a_id: 'char-2', // 정렬 시 char-1보다 뒤
          character_b_id: 'char-1',
          label: '싸움 중재',
          established_page: 2,
        },
      ],
    };
    const { client, calls } = mockClient();
    await registerGeneratedContent(client, flipped);

    const call = calls.find((c) => c.sql.includes('INSERT INTO relationships'));
    expect(call?.params?.[2]).toBe('char-1'); // character_a_id
    expect(call?.params?.[3]).toBe('char-2'); // character_b_id
  });

  test('FR-CHR-001: ON CONFLICT가 character_a_id/character_b_id도 갱신 대상에 포함한다(재실행으로 기존 행 순서 교정)', async () => {
    const { client, calls } = mockClient();
    await registerGeneratedContent(client, data);

    const call = calls.find((c) => c.sql.includes('INSERT INTO relationships'));
    expect(call?.sql).toMatch(/ON CONFLICT[\s\S]*character_a_id\s*=/);
    expect(call?.sql).toMatch(/ON CONFLICT[\s\S]*character_b_id\s*=/);
  });

  test('배경지식·소개를 kind별 2행으로 분리해 적재한다(정보 분리, FR-ADM-005)', async () => {
    const { client, calls } = mockClient();
    await registerGeneratedContent(client, data);

    const bgCalls = calls.filter((c) => c.sql.includes('INSERT INTO background_and_intro'));
    expect(bgCalls).toHaveLength(2);
    expect(bgCalls.map((c) => c.params)).toEqual(
      expect.arrayContaining([
        ['takryu', '배경 설명'],
        ['takryu', '소개 문구'],
      ])
    );
  });
});
