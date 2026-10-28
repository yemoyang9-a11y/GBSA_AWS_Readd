/**
 * A8-2 — 같은 근거를 공급자 접두 캐시가 맞도록 순서만 바꾼다.
 * 데이터 선택(FR-SPL-002 🚦, R4)은 그대로다. 여기서는 이미 K로 걸러진 레코드의 배치만 본다.
 */
import { buildPrompt, buildStableContext, buildStableContextParts } from '../context-assembly';
import type { ChatbotContext } from '../../../shared/types';

// 2장 진행 중(장 시작 p.18). K는 컨텍스트를 만든 쪽이 정한다 — 여기선 레코드만 다룬다.
function makeContext(currentPages: number[]): ChatbotContext {
  const K = currentPages[currentPages.length - 1];
  const characters = [
    { id: 'c3', book_id: 'b', name: '승재', first_appearance_page: 20 },
    { id: 'c2', book_id: 'b', name: '초봉', first_appearance_page: 3 },
    { id: 'c1', book_id: 'b', name: '정주사', first_appearance_page: 3 },
    { id: 'c4', book_id: 'b', name: '태수', first_appearance_page: 25 },
  ].filter((c) => c.first_appearance_page <= K);
  return {
    book: { title: '탁류', author: '채만식' },
    chapter_summaries: [
      {
        chapter_no: 1,
        title: '인간기념물',
        content: '정주사가 봉욕을 당한다.',
        start_page: 1,
        end_page: 17,
      },
    ],
    current_chapter_text: currentPages.map((p) => `[p.${p}]\n본문 ${p}`).join('\n\n'),
    entities: {
      characters,
      character_notes: [
        { id: 'n2', character_id: 'c3', note: '의사 지망생', source_page: 20 },
        { id: 'n1', character_id: 'c1', note: '미두꾼', source_page: 5 },
      ].filter((n) => n.source_page <= K),
      relationships: [
        {
          id: 'r2',
          book_id: 'b',
          character_a_id: 'c3',
          character_b_id: 'c2',
          label: '호감',
          established_page: 21,
        },
        {
          id: 'r1',
          book_id: 'b',
          character_a_id: 'c1',
          character_b_id: 'c2',
          label: '부녀',
          established_page: 3,
        },
      ].filter((r) => r.established_page <= K),
      terms: [
        {
          id: 't1',
          book_id: 'b',
          term: '미두',
          definition: '쌀 선물 투기',
          first_appearance_page: 4,
        },
      ],
      events: [
        {
          id: 'e1',
          book_id: 'b',
          event: '봉욕',
          description: '미두장에서 망신',
          occurrence_page: 6,
        },
      ],
    },
    background: '',
  };
}

const lines = (text: string) => text.split('\n').filter((l) => l.trim() !== '');

describe('A8-2 캐시 순서 — buildStableContext', () => {
  test('FR-SPL-002: 순서만 바꾼다 — 기존 프롬프트와 레코드 줄이 정확히 같다(추가·누락 0건)', () => {
    const ctx = makeContext([18, 19, 20, 21, 22, 23, 24, 25]);
    const stable = lines(buildStableContext(ctx))
      .filter((l) => !l.startsWith('## '))
      .sort();
    const legacy = lines(buildPrompt(ctx, ''))
      .filter((l) => !l.startsWith('## '))
      .sort();
    expect(stable).toEqual(legacy);
  });

  test('현재 장 시작 전 엔티티는 현재 장 원문 앞, 현재 장 엔티티는 뒤에 놓인다', () => {
    const text = buildStableContext(makeContext([18, 19, 20, 21, 22, 23, 24, 25]));
    const raw = text.indexOf('[p.18]');
    expect(text.indexOf('- 정주사 (첫 등장: p.3)')).toBeLessThan(raw);
    expect(text.indexOf('- 정주사: 미두꾼 (p.5)')).toBeLessThan(raw);
    expect(text.indexOf('- 정주사 - 초봉: 부녀 (확립: p.3)')).toBeLessThan(raw);
    expect(text.indexOf('- **미두**: 쌀 선물 투기 (p.4)')).toBeLessThan(raw);
    expect(text.indexOf('- 승재 (첫 등장: p.20)')).toBeGreaterThan(raw);
    expect(text.indexOf('- 승재: 의사 지망생 (p.20)')).toBeGreaterThan(raw);
    expect(text.indexOf('- 승재 - 초봉: 호감 (확립: p.21)')).toBeGreaterThan(raw);
    // 페이지가 같으면 id 순 — 저장소 반환 순서와 무관하게 결정적이다
    expect(text.indexOf('- 정주사 (첫 등장: p.3)')).toBeLessThan(
      text.indexOf('- 초봉 (첫 등장: p.3)')
    );
    // 고정 설명문은 마지막 엔티티 뒤에 1회
    expect(text.split('이 목록은 읽은 범위의 모든 사실을').length).toBe(2);
    expect(text.indexOf('이 목록은 읽은 범위의 모든 사실을')).toBeGreaterThan(
      text.indexOf('- 승재 - 초봉: 호감 (확립: p.21)')
    );
  });

  test('같은 장 안에서 페이지가 넘어가도 이전 블록의 현재 장 원문 끝까지는 그대로 접두다', () => {
    const before = buildStableContext(makeContext([18, 19, 20, 21, 22, 23, 24]));
    const after = buildStableContext(makeContext([18, 19, 20, 21, 22, 23, 24, 25]));
    const prefixEnd = before.indexOf('본문 24') + '본문 24'.length;
    expect(after.slice(0, prefixEnd)).toBe(before.slice(0, prefixEnd));
  });

  test('입력 레코드 배열을 변경하지 않는다', () => {
    const ctx = makeContext([18, 19, 20]);
    const snapshot = JSON.stringify(ctx);
    buildStableContext(ctx);
    expect(JSON.stringify(ctx)).toBe(snapshot);
  });
});

describe('A8-2 쪽 단위 캐시 지점 — buildStableContextParts', () => {
  test('현재 장 원문은 쪽마다 한 조각이고, 각 조각은 그 쪽 본문으로 끝난다', () => {
    const parts = buildStableContextParts(makeContext([18, 19, 20, 21]));
    // [장 시작 전 블록, p.18, p.19, p.20, p.21, 현재 장 엔티티]
    expect(parts).toHaveLength(6);
    expect(parts[0]).not.toContain('[p.');
    expect(parts.slice(1, 5).map((p) => p.slice(-5))).toEqual([
      '본문 18',
      '본문 19',
      '본문 20',
      '본문 21',
    ]);
    expect(parts[5]).toContain('- 승재 (첫 등장: p.20)');
  });

  test('FR-SPL-002: 조각을 이으면 현재 장 원문이 한 글자도 바뀌지 않고 그대로 들어 있다', () => {
    const ctx = makeContext([18, 19, 20, 21, 22, 23, 24, 25]);
    const joined = buildStableContextParts(ctx).join('\n');
    expect(joined).toContain(`## 현재 장 원문 (절단)\n${ctx.current_chapter_text}\n\n## 인물`);
    expect(joined.match(/\[p\.\d+\]/g)).toEqual([
      '[p.18]',
      '[p.19]',
      '[p.20]',
      '[p.21]',
      '[p.22]',
      '[p.23]',
      '[p.24]',
      '[p.25]',
    ]);
  });

  test('쪽을 넘기거나 여러 쪽을 건너뛰어도 이전 요청의 쪽 조각들이 그대로 앞에 남는다', () => {
    const before = buildStableContextParts(makeContext([18, 19, 20, 21, 22]));
    const after = buildStableContextParts(makeContext([18, 19, 20, 21, 22, 23, 24, 25]));
    // 마지막 조각(현재 장 엔티티)만 달라질 수 있다
    expect(after.slice(0, before.length - 1)).toEqual(before.slice(0, -1));
  });

  test('현재 장 원문이 없으면 장 시작 전 블록과 엔티티 블록 두 조각이다', () => {
    const ctx = { ...makeContext([18]), current_chapter_text: null };
    const parts = buildStableContextParts(ctx);
    expect(parts).toHaveLength(2);
    expect(parts.join('\n')).not.toContain('## 현재 장 원문');
    expect(parts[1]).toContain('이 목록은 읽은 범위의 모든 사실을');
  });

  test('현재 장 엔티티가 없으면 원문 뒤에 빈 줄 하나만 남는다', () => {
    const bare = {
      ...makeContext([18, 19]),
      entities: { characters: [], character_notes: [], relationships: [], terms: [], events: [] },
    };
    const joined = buildStableContextParts(bare).join('\n');
    expect(joined.endsWith(`## 현재 장 원문 (절단)\n${bare.current_chapter_text}\n`)).toBe(true);
  });
});
