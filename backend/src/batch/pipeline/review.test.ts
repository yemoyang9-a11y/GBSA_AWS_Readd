import {
  buildReviewSheetRows,
  toReviewSheetCsv,
  parseCsv,
  parseFilledReviewSheet,
  applyReviewJudgments,
  checkReviewComplete,
  publishBook,
  reviewKey,
  passedReviewKeys,
} from './review';
import { QueryClient } from './register';
import { ResolvedBookData } from './check-integrity';

const DATA: ResolvedBookData = {
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
  ],
  relationships: [
    { id: 'rel-1', character_a_id: 'char-1', character_b_id: 'char-1', label: '자기소개', established_page: 2 },
  ],
  terms: [{ id: 'term-1', term: '미두장', definition: '선물 곡물 거래소', first_appearance_page: 2 }],
  events: [{ id: '1-0', event: '멱살잡이', description: '정주사가 봉욕을 당함', occurrence_page: 2 }],
  background_and_intro: { background: '배경 설명, 쉼표 포함', intro: '소개 문구\n줄바꿈 포함' },
};

describe('buildReviewSheetRows — FR-ADM-005 🚦 내보내기', () => {
  test('생성물 전량(장요약·인물·별칭·노트·관계·용어·사건·배경지식·소개)이 대상 행으로 펼쳐진다', () => {
    const rows = buildReviewSheetRows(DATA);
    const types = rows.map((r) => r.target_type);
    expect(types).toEqual(
      expect.arrayContaining([
        'chapter_summary',
        'character',
        'alias',
        'character_note',
        'relationship',
        'term',
        'event',
        'background',
        'intro',
      ])
    );
    expect(rows).toHaveLength(9);
  });

  test('이미 검수된 대상은 다시 내보내지 않는다(재실행 시 판정 보존)', () => {
    const already = new Set([reviewKey('character', 'char-1')]);
    const rows = buildReviewSheetRows(DATA, already);
    expect(rows.find((r) => r.target_type === 'character')).toBeUndefined();
    expect(rows).toHaveLength(8);
  });
});

describe('passedReviewKeys — FR-ADM-005 🚦 FALSE 판정 대상은 재수출 대상에서 제외하지 않는다', () => {
  test('적용 항목 전부 TRUE인 대상만 통과 키에 포함된다(positive)', () => {
    const keys = passedReviewKeys([
      {
        target_type: 'relationship',
        target_id: 'rel-1',
        hallucination_ok: true,
        page_boundary_ok: true,
        info_separation_ok: true,
      },
    ]);
    expect(keys.has(reviewKey('relationship', 'rel-1'))).toBe(true);
  });

  test('적용 항목 중 하나라도 FALSE면 통과 키에서 빠진다 — 재수출돼 재제출 가능해야 한다(negative)', () => {
    const keys = passedReviewKeys([
      {
        target_type: 'relationship',
        target_id: 'rel-1',
        hallucination_ok: false,
        page_boundary_ok: true,
        info_separation_ok: true,
      },
    ]);
    expect(keys.has(reviewKey('relationship', 'rel-1'))).toBe(false);
    expect(keys.size).toBe(0);
  });

  test('통과 키를 alreadyReviewed로 넘기면 buildReviewSheetRows가 FALSE 판정 대상을 다시 내보낸다', () => {
    const passed = passedReviewKeys([
      {
        target_type: 'relationship',
        target_id: 'rel-1',
        hallucination_ok: false,
        page_boundary_ok: true,
        info_separation_ok: true,
      },
    ]);
    const rows = buildReviewSheetRows(DATA, passed);
    expect(rows.find((r) => r.target_type === 'relationship' && r.target_id === 'rel-1')).toBeDefined();
  });
});

describe('검수 시트 CSV 직렬화/파싱 — 대상별 적용 항목만 판정 요구', () => {
  test('대상에 적용되지 않는 판정 컬럼은 N/A로 미리 채워진다', () => {
    const rows = buildReviewSheetRows(DATA);
    const csv = toReviewSheetCsv(rows);
    const aliasLine = csv.split('\n').find((l) => l.startsWith('alias,'));
    expect(aliasLine).toBeDefined();
    // alias는 alias_merge_ok·recap_continuity_ok·info_separation_ok·intro_tone_ok·spoiler_free_ok가 N/A
    expect(aliasLine).toMatch(/N\/A/);
  });

  test('쉼표·줄바꿈이 포함된 본문도 CSV 인용 처리 후 파싱하면 원문과 같다', () => {
    const rows = buildReviewSheetRows(DATA);
    const csv = toReviewSheetCsv(rows);
    const table = parseCsv(csv);
    const header = table[0];
    const bgIdx = header.indexOf('content_preview');

    const bgLine = table.find((r) => r[0] === 'background')!;
    expect(bgLine[bgIdx]).toBe('배경 설명, 쉼표 포함');
    const introLine = table.find((r) => r[0] === 'intro')!;
    expect(introLine[bgIdx]).toBe('소개 문구\n줄바꿈 포함');
  });
});

describe('parseFilledReviewSheet — FR-ADM-005 🚦 부분 판정으로 반영 진행 금지', () => {
  function sheetWithChapterSummaryRow(cells: Record<string, string>): string {
    const header =
      'target_type,target_id,page_ref,content_preview,hallucination_ok,alias_merge_ok,page_boundary_ok,recap_continuity_ok,info_separation_ok,intro_tone_ok,spoiler_free_ok,corrected_content,correction_note,reviewer';
    const row = [
      'chapter_summary',
      '1',
      '',
      '장 1 요약',
      cells.hallucination_ok ?? 'TRUE',
      'N/A',
      cells.page_boundary_ok ?? 'TRUE',
      cells.recap_continuity_ok ?? 'TRUE',
      cells.info_separation_ok ?? 'TRUE',
      'N/A',
      'N/A',
      '',
      '',
      cells.reviewer ?? '홍길동',
    ].join(',');
    return `${header}\n${row}\n`;
  }

  test('적용 항목이 전부 TRUE/FALSE면 파싱에 성공한다(positive)', () => {
    const parsed = parseFilledReviewSheet(sheetWithChapterSummaryRow({}));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].criteria).toEqual({
      hallucination_ok: true,
      page_boundary_ok: true,
      recap_continuity_ok: true,
      info_separation_ok: true,
    });
  });

  test('적용 항목 하나라도 비어 있으면 실패한다(negative — 0건도 통과 아님)', () => {
    expect(() => parseFilledReviewSheet(sheetWithChapterSummaryRow({ recap_continuity_ok: '' }))).toThrow();
  });

  test('reviewer가 비어 있으면 실패한다', () => {
    expect(() => parseFilledReviewSheet(sheetWithChapterSummaryRow({ reviewer: '' }))).toThrow();
  });
});

function mockClient(responder?: (sql: string) => unknown): { client: QueryClient; calls: { sql: string; params?: unknown[] }[] } {
  const calls: { sql: string; params?: unknown[] }[] = [];
  return {
    client: {
      query: async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        return responder ? responder(sql) : { rows: [] };
      },
    },
    calls,
  };
}

describe('applyReviewJudgments — 판정 기록 적재 + 수정 반영(NFR-AI-012)', () => {
  test('review_records를 대상당 1행 upsert(ON CONFLICT)로 적재한다', async () => {
    const { client, calls } = mockClient();
    await applyReviewJudgments(client, 'takryu', [
      {
        target_type: 'chapter_summary',
        target_id: '1',
        criteria: { hallucination_ok: true, page_boundary_ok: true, recap_continuity_ok: true, info_separation_ok: true },
        corrected_content: null,
        correction_note: null,
        reviewer: '홍길동',
      },
    ]);

    const call = calls.find((c) => c.sql.includes('INSERT INTO review_records'));
    expect(call).toBeDefined();
    expect(call?.sql).toMatch(/ON CONFLICT \(book_id, target_type, target_id\)/);
  });

  test('corrected_content가 있으면 원본 테이블에 먼저 반영한다', async () => {
    const { client, calls } = mockClient();
    await applyReviewJudgments(client, 'takryu', [
      {
        target_type: 'relationship',
        target_id: 'rel-1',
        criteria: { hallucination_ok: true, page_boundary_ok: true, info_separation_ok: true },
        corrected_content: '수정된 라벨',
        correction_note: '라벨 오기 수정',
        reviewer: '홍길동',
      },
    ]);

    const updateCall = calls.find((c) => c.sql.includes('UPDATE relationships'));
    expect(updateCall).toBeDefined();
    expect(updateCall?.params).toEqual(['수정된 라벨', 'takryu', 'rel-1']);
  });
});

describe('checkReviewComplete / publishBook — FR-ADM-006, R12 검수 미완료 시 공개 전환 거절', () => {
  test('전량 미검수(0건)면 공개 전환을 거절한다(negative)', async () => {
    const { client, calls } = mockClient((sql) => {
      if (sql.includes('chapter_summaries')) return { rows: [{ target_id: '1', hallucination_ok: null }] };
      return { rows: [] };
    });

    const report = await publishBook(client, 'takryu');
    expect(report.complete).toBe(false);
    expect(report.missing.length).toBeGreaterThan(0);
    expect(calls.find((c) => c.sql.includes('UPDATE books'))).toBeUndefined();
  });

  test('전량 검수 완료면 공개 전환이 실행된다(positive — negative와 쌍)', async () => {
    const { client, calls } = mockClient((sql) => {
      if (sql.includes('chapter_summaries')) {
        return {
          rows: [
            {
              target_id: '1',
              hallucination_ok: true,
              page_boundary_ok: true,
              recap_continuity_ok: true,
              info_separation_ok: true,
            },
          ],
        };
      }
      return { rows: [] };
    });

    const report = await publishBook(client, 'takryu');
    expect(report.complete).toBe(true);
    const updateCall = calls.find((c) => c.sql.includes('UPDATE books'));
    expect(updateCall).toBeDefined();
    expect(updateCall?.sql).toMatch(/publish_status = 'published'/);
    expect(updateCall?.sql).toMatch(/ssabi_ready = true/);
  });

  test('checkReviewComplete는 부분 판정(일부 항목만 TRUE)도 미완료로 잡는다', async () => {
    const { client } = mockClient((sql) => {
      if (sql.includes('chapter_summaries')) {
        return {
          rows: [
            {
              target_id: '1',
              hallucination_ok: true,
              page_boundary_ok: true,
              recap_continuity_ok: null, // 하나 누락
              info_separation_ok: true,
            },
          ],
        };
      }
      return { rows: [] };
    });

    const report = await checkReviewComplete(client, 'takryu');
    const item = report.missing.find((m) => m.target_type === 'chapter_summary');
    expect(item?.missing_criteria).toEqual(['recap_continuity_ok']);
  });
});
