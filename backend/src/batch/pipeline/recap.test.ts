import { assembleRecapInput, buildRecapPrompt, injectDemoRecap } from './recap';
import { QueryClient } from './register';

interface FakeChapter {
  chapter_no: number;
  title: string;
  start_page: number;
  end_page: number;
}

interface FakeDb {
  chapters: FakeChapter[];
  chapterSummaries: { chapter_no: number; summary: string }[];
  pages: { page_no: number; content: string }[];
}

/** 실제 Postgres의 ANY/BETWEEN 필터를 그대로 흉내낸다 — SQL 텍스트만 보고 통과시키지 않는다 */
function fakeClient(db: FakeDb): {
  client: QueryClient;
  inserts: { sql: string; params?: unknown[] }[];
} {
  const inserts: { sql: string; params?: unknown[] }[] = [];
  const client: QueryClient = {
    query: async (sql: string, params?: unknown[]) => {
      if (sql.includes('FROM chapters')) {
        return { rows: db.chapters };
      }
      if (sql.includes('FROM chapter_summaries')) {
        const allowed = params?.[1] as number[];
        return { rows: db.chapterSummaries.filter((r) => allowed.includes(r.chapter_no)) };
      }
      if (sql.includes('FROM pages')) {
        const [, start, end] = params as [string, number, number];
        return { rows: db.pages.filter((p) => p.page_no >= start && p.page_no <= end) };
      }
      if (sql.includes('INSERT INTO saved_recap')) {
        inserts.push({ sql, params });
        return { rows: [] };
      }
      throw new Error(`예상치 못한 쿼리: ${sql}`);
    },
  };
  return { client, inserts };
}

function buildFixtureDb(): FakeDb {
  return {
    chapters: [
      { chapter_no: 1, title: '1장', start_page: 1, end_page: 10 },
      { chapter_no: 2, title: '2장', start_page: 11, end_page: 20 },
      { chapter_no: 3, title: '3장', start_page: 21, end_page: 30 },
    ],
    // 공개 콘텐츠 스토어엔 책 전체 요약이 이미 다 들어있다 — R3 "본문 접근은 제한하지 않는다" —
    // 3장 요약이 DB에 존재해도 쿼리가 걸러야 한다
    chapterSummaries: [
      { chapter_no: 1, summary: '1장 요약' },
      { chapter_no: 2, summary: '2장 요약' },
      { chapter_no: 3, summary: '3장 요약(미래 사건 — 절대 노출 금지)' },
    ],
    pages: Array.from({ length: 10 }, (_, i) => {
      const page_no = 21 + i;
      return {
        page_no,
        content: page_no <= 25 ? `p${page_no}-현재까지` : `p${page_no}-미래스포일러`,
      };
    }),
  };
}

describe('assembleRecapInput — FR-SPL-002: 조회 결과에 기준점 초과 레코드 0건', () => {
  test('완결된 장 요약만 포함한다 — 미래 장 요약 0건(negative)', async () => {
    const { client } = fakeClient(buildFixtureDb());
    const result = await assembleRecapInput(client, 'takryu', 25);

    const chapterNos = result.chapter_summaries.map((cs) => cs.chapter_no);
    expect(chapterNos).not.toContain(3);
    expect(result.chapter_summaries.some((cs) => cs.content.includes('미래'))).toBe(false);
  });

  test('완결된 장 요약은 정상 포함된다(positive) — negative 단독이면 항상 빈 배열이 통과하므로 반드시 쌍으로 확인', async () => {
    const { client } = fakeClient(buildFixtureDb());
    const result = await assembleRecapInput(client, 'takryu', 25);

    const chapterNos = result.chapter_summaries.map((cs) => cs.chapter_no);
    expect(chapterNos).toEqual([1, 2]);
    expect(result.chapter_summaries.find((cs) => cs.chapter_no === 1)?.content).toBe('1장 요약');
  });

  test('현재 장 원문은 기준점까지만 절단한다 — 미래 페이지 내용 0건(negative)', async () => {
    const { client } = fakeClient(buildFixtureDb());
    const result = await assembleRecapInput(client, 'takryu', 25);

    expect(result.current_chapter_text).not.toContain('미래스포일러');
  });

  test('현재 장 원문은 기준점까지는 정상 포함된다(positive)', async () => {
    const { client } = fakeClient(buildFixtureDb());
    const result = await assembleRecapInput(client, 'takryu', 25);

    expect(result.current_chapter_text).toContain('p21-현재까지');
    expect(result.current_chapter_text).toContain('p25-현재까지');
    expect(result.cutoff).toBe(25);
  });

  test('기준점이 장 경계와 정확히 일치하면(cutoff=20) 그 장은 완결로 처리하고 현재 장 원문은 없다', async () => {
    const { client } = fakeClient(buildFixtureDb());
    const result = await assembleRecapInput(client, 'takryu', 20);

    expect(result.chapter_summaries.map((cs) => cs.chapter_no)).toEqual([1, 2]);
    expect(result.current_chapter_text).toBeNull();
  });

  test('기준점 0(첫 진입)이면 완결된 장·현재 장 원문 모두 없다', async () => {
    const { client } = fakeClient(buildFixtureDb());
    const result = await assembleRecapInput(client, 'takryu', 0);

    expect(result.chapter_summaries).toEqual([]);
    expect(result.current_chapter_text).toBeNull();
  });
});

describe('buildRecapPrompt — 조립된 입력 밖의 내용을 추가하지 않는다', () => {
  test('전달받은 장 요약·현재 장 원문만 프롬프트에 담는다', () => {
    const prompt = buildRecapPrompt(
      {
        chapter_summaries: [{ chapter_no: 1, title: '1장', content: '1장 요약', end_page: 10 }],
        current_chapter_text: '현재 원문',
        cutoff: 15,
      },
      '탁류',
      '채만식'
    );

    expect(prompt).toContain('1장 요약');
    expect(prompt).toContain('현재 원문');
    expect(prompt).toContain('15페이지');
    expect(prompt).not.toContain('미래');
  });

  test('완결된 장이 없으면 그 사실을 명시한다(지어내지 않는다)', () => {
    const prompt = buildRecapPrompt(
      { chapter_summaries: [], current_chapter_text: null, cutoff: 3 },
      '탁류',
      '채만식'
    );
    expect(prompt).toContain('없음 — 아직 완결된 장 없음');
  });
});

describe('injectDemoRecap — S8: saved_recap upsert', () => {
  test('조립·LLM 종합 결과를 device_id·book_id·cutoff_page 키로 upsert한다', async () => {
    const { client, inserts } = fakeClient(buildFixtureDb());
    const recap = await injectDemoRecap(
      client,
      async () => '{"recap": "지금까지의 줄거리"}',
      (raw) => JSON.parse(raw),
      {
        deviceId: '11111111-1111-4111-8111-111111111111',
        bookId: 'takryu',
        cutoff: 25,
        title: '탁류',
        author: '채만식',
      }
    );

    expect(recap).toBe('지금까지의 줄거리');
    expect(inserts).toHaveLength(1);
    expect(inserts[0].sql).toContain('ON CONFLICT (device_id, book_id)');
    expect(inserts[0].params).toEqual([
      '11111111-1111-4111-8111-111111111111',
      'takryu',
      25,
      '지금까지의 줄거리',
    ]);
  });

  test('이슈 대응(800자+ 실측): 모델이 500자 지시를 어겨도 저장 전에 문장 경계에서 잘라낸다', async () => {
    const { client, inserts } = fakeClient(buildFixtureDb());
    const sentence = '이것은 분량 제한을 초과하도록 일부러 길게 만든 테스트용 문장입니다.'; // 40자
    const overLength = sentence.repeat(20); // 800자 — 캡이 없다면 그대로 저장됐을 것

    const recap = await injectDemoRecap(
      client,
      async () => JSON.stringify({ recap: overLength }),
      (raw) => JSON.parse(raw),
      {
        deviceId: '11111111-1111-4111-8111-111111111111',
        bookId: 'takryu',
        cutoff: 25,
        title: '탁류',
        author: '채만식',
      }
    );

    expect(recap.length).toBeLessThanOrEqual(500);
    expect(recap.endsWith('.')).toBe(true); // 문장 경계에서 잘림, 중간에 뚝 끊기지 않음
    const maxWholeSentences = Math.floor(500 / sentence.length);
    expect(recap).toBe(sentence.repeat(maxWholeSentences));
    expect(inserts[0].params).toEqual([
      '11111111-1111-4111-8111-111111111111',
      'takryu',
      25,
      recap,
    ]); // DB에 저장되는 값도 동일하게 잘려야 한다
  });
});
