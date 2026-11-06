import { createEmptyState, mergeRelationships } from './accumulate';
import { validateGroundedChapter } from './grounding';
import { Page } from '../../shared/types';

const page: Page = {
  id: 'p1',
  book_id: 'synthetic-contract',
  page_no: 1,
  content: '민수는 영희를 사랑하지만 영희는 민수를 친구로만 여겼다.',
};
const evidence = {
  source_page: 1,
  quote: page.content,
  start_char: 0,
  end_char: page.content.length,
};
const semantic = (patch: Record<string, unknown> = {}) => ({
  version: 2,
  kind: 'emotion',
  direction: 'a_to_b',
  relation_key: 'affection',
  summary: '민수는 영희를 사랑한다.',
  assertion_status: 'fact',
  temporal_scope: 'ongoing',
  state: 'active',
  evidence,
  ...patch,
});
const candidate = (patch: Record<string, unknown> = {}) => ({
  character_a: '민수',
  character_b: '영희',
  label: '사랑한다',
  established_page: 1,
  assertion_status: 'fact',
  change_type: 'establishment',
  rationale: '서술에서 민수의 감정을 명시한다.',
  evidence,
  semantics: semantic(),
  ...patch,
});
const resolved = (patch: Record<string, unknown> = {}) => ({
  ...candidate(),
  character_a_id: 'z',
  character_b_id: 'a',
  ...patch,
});

test('FR-DAT-005: 추출된 일방 감정의 주체와 객체는 ID 정렬 뒤에도 보존한다', () => {
  const state = createEmptyState('synthetic-contract');
  mergeRelationships(state, [resolved()] as never);
  expect(state.relationships[0]).toMatchObject({
    character_a_id: 'a',
    character_b_id: 'z',
    semantics: { direction: 'b_to_a' },
  });
});

test('FR-CHR-001: 같은 두 인물의 독립적인 관계와 반대 방향 감정은 동시에 보존한다', () => {
  const state = createEmptyState('synthetic-contract');
  mergeRelationships(state, [
    resolved(),
    resolved({
      label: '친구로 여긴다',
      semantics: semantic({
        direction: 'b_to_a',
        relation_key: 'friendship',
        kind: 'social',
        summary: '영희는 민수를 친구로 여긴다.',
      }),
    }),
  ] as never);
  expect(state.relationships).toHaveLength(2);
  expect(state.review).toEqual([]);
});

test('FR-DAT-005: 모호한 추상 라벨과 불완전한 의미 계약은 검수에 남긴다', () => {
  const out = validateGroundedChapter(
    {
      relationships: [
        candidate({ label: '욕망' }),
        candidate({ semantics: { version: 2 } }),
        candidate(),
      ],
    },
    [page]
  );
  expect(out.relationships).toHaveLength(1);
  expect(out.review).toHaveLength(2);
});

test('FR-DAT-005: 귀속된 주장과 불확실성은 사실로 승격하지 않고 보존한다', () => {
  const quote = '민수는 영희가 자기를 사랑한다고 주장했다.';
  const p = { ...page, content: quote };
  const proof = { ...evidence, quote, end_char: quote.length };
  const r = candidate({
    label: '사랑한다고 주장',
    assertion_status: 'claim',
    evidence: proof,
    semantics: semantic({
      direction: 'b_to_a',
      assertion_status: 'claim',
      attribution: '민수',
      summary: '민수는 영희가 자신을 사랑한다고 주장한다.',
      evidence: proof,
    }),
  });
  const out = validateGroundedChapter({ relationships: [r] }, [p]);
  expect(out.relationships).toHaveLength(1);
  expect(out.relationships[0]).toMatchObject({
    semantics: { assertion_status: 'claim', attribution: '민수' },
  });
  expect(
    validateGroundedChapter(
      {
        relationships: [
          { ...r, semantics: { ...(r.semantics as object), attribution: undefined } },
        ],
      },
      [p]
    ).relationships
  ).toEqual([]);
});

test('FR-DAT-005: 의미 설명에 쓰인 근거는 확립 페이지 뒤를 참조할 수 없다', () => {
  const out = validateGroundedChapter(
    {
      relationships: [
        candidate({ semantics: semantic({ evidence: { ...evidence, source_page: 2 } }) }),
        candidate(),
      ],
    },
    [page, { ...page, id: 'p2', page_no: 2 }]
  );
  expect(out.relationships).toHaveLength(1);
  expect(out.review).toHaveLength(1);
});

test('FR-CHR-001: 같은 관계 키의 방향 변화는 변화 근거 없이 기존 관계를 대체하지 않는다', () => {
  const state = createEmptyState('synthetic-contract');
  mergeRelationships(state, [
    resolved(),
    resolved({
      established_page: 2,
      semantics: semantic({ direction: 'mutual', summary: '민수와 영희는 서로 사랑한다.' }),
    }),
  ] as never);
  expect(state.relationships).toHaveLength(1);
  expect(state.review).toHaveLength(1);
});

test('FR-CHR-001: 변화 근거가 있는 방향 변화는 기존 관계를 대체하는 이력으로 등록된다', () => {
  const state = createEmptyState('synthetic-contract');
  mergeRelationships(state, [
    resolved(),
    resolved({
      established_page: 2,
      change_type: 'transition',
      change_evidence: { ...evidence, source_page: 2 },
      semantics: semantic({ direction: 'mutual', summary: '민수와 영희는 서로 사랑한다.' }),
    }),
  ] as never);
  expect(state.relationships.map((r) => r.semantics?.direction)).toEqual(['b_to_a', 'mutual']);
  expect(state.review).toEqual([]);
});

test('FR-CHR-001: 같은 관계 키라도 반대쪽 인물의 감정은 변화 근거 없이 함께 보존한다', () => {
  const state = createEmptyState('synthetic-contract');
  mergeRelationships(state, [
    resolved(),
    resolved({
      established_page: 2,
      semantics: semantic({ direction: 'b_to_a', summary: '영희는 민수를 사랑한다.' }),
    }),
  ] as never);
  expect(state.relationships).toHaveLength(2);
  expect(state.review).toEqual([]);
});

test('FR-CHR-001: 사건은 이후 같은 행동이 반복되어도 서로 다른 페이지에 보존한다', () => {
  const state = createEmptyState('synthetic-contract');
  const event = semantic({ kind: 'action', relation_key: 'help', temporal_scope: 'event' });
  mergeRelationships(state, [
    resolved({ semantics: event }),
    resolved({
      established_page: 2,
      semantics: { ...event, evidence: { ...evidence, source_page: 2 } },
    }),
  ] as never);
  expect(state.relationships.map((r) => r.established_page)).toEqual([1, 2]);
});

import { applyReviewJudgments, buildReviewSheetRows, checkReviewComplete } from './review';
import { registerGeneratedContent } from './register';
const bookData = () => ({
  book_id: 'synthetic-contract',
  chapter_summaries: [],
  characters: [],
  relationships: [{ ...resolved(), id: 'rel' }],
  terms: [],
  events: [],
  background_and_intro: { background: '', intro: '' },
});

test('FR-ADM-005: 의미와 방향 및 근거가 바뀐 검수 시트는 승인 기록을 쓰지 않는다', async () => {
  const data = bookData();
  const sheet = buildReviewSheetRows(data as never).find(
    (r) => r.target_type === 'relationship'
  ) as unknown as Record<string, unknown>;
  expect(sheet.relationship_snapshot).toBeDefined();
  const snapshot = sheet.relationship_snapshot as Record<string, unknown>;
  const query = jest.fn().mockResolvedValue({
    rows: [{ relationship_snapshot: { ...snapshot, label: '변경된 관계' }, semantics: semantic() }],
  });
  await expect(
    applyReviewJudgments({ query }, data.book_id, [
      {
        target_type: 'relationship',
        target_id: 'rel',
        criteria: { hallucination_ok: true, page_boundary_ok: true, info_separation_ok: true },
        corrected_content: null,
        correction_note: null,
        reviewer: 'reviewer',
        relationship_snapshot: snapshot,
      } as never,
    ])
  ).rejects.toThrow(/changed|stale/i);
  expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO review_records'))).toBe(false);
});

test('FR-ADM-005: 현재 의미 계약과 일치하는 검수만 승인 스냅샷을 기록한다', async () => {
  const data = bookData();
  const sheet = buildReviewSheetRows(data as never).find(
    (r) => r.target_type === 'relationship'
  ) as unknown as Record<string, unknown>;
  const snapshot = sheet.relationship_snapshot;
  const query = jest
    .fn()
    .mockResolvedValue({ rows: [{ relationship_snapshot: snapshot, semantics: semantic() }] });
  await applyReviewJudgments({ query }, data.book_id, [
    {
      target_type: 'relationship',
      target_id: 'rel',
      criteria: { hallucination_ok: true, page_boundary_ok: true, info_separation_ok: true },
      corrected_content: null,
      correction_note: null,
      reviewer: 'reviewer',
      relationship_snapshot: snapshot,
    } as never,
  ]);
  expect(
    query.mock.calls.find(([sql]) => sql.includes('INSERT INTO review_records'))?.[1]
  ).toContain(JSON.stringify(snapshot));
});

test('FR-ADM-005: 구조 검증 통과가 의미 검수의 통과를 대신할 수 없다', async () => {
  const query = jest.fn().mockImplementation(async (sql: string) => ({
    rows: sql.includes('FROM relationships')
      ? [
          {
            target_id: 'rel',
            hallucination_ok: true,
            page_boundary_ok: true,
            info_separation_ok: true,
            snapshot_current: false,
          },
        ]
      : [],
  }));
  expect((await checkReviewComplete({ query }, 'synthetic-contract')).complete).toBe(false);
});

test('FR-DAT-005: 등록은 canonical 방향과 의미 근거를 JSON으로 함께 저장한다', async () => {
  const query = jest
    .fn()
    .mockImplementation(async (sql: string, params?: unknown[]) => ({
      rows: sql.includes('RETURNING id') ? [{ id: params?.[0] }] : [],
    }));
  await registerGeneratedContent({ query }, bookData() as never);
  const insert = query.mock.calls.find(([sql]) => sql.includes('INSERT INTO relationships'));
  expect(JSON.parse(insert![1][6])).toMatchObject({ direction: 'b_to_a', evidence });
});

test('FR-ADM-005: 기존 공개 데이터는 재등록이 쓰기 시작하기 전에 비공개 검수 상태가 된다', async () => {
  const query = jest
    .fn()
    .mockImplementation(async (sql: string, params?: unknown[]) => ({
      rows: sql.includes('RETURNING id') ? [{ id: params?.[0] }] : [],
    }));
  await registerGeneratedContent({ query }, bookData() as never);
  expect(query.mock.calls.filter(([sql]) => /^(UPDATE|INSERT|DELETE)/.test(sql))[0][0]).toMatch(
    /UPDATE books SET ssabi_ready = false/
  );
});

test('FR-DAT-005: 새 생성 경로에서 의미 계약 누락 및 미래 변화 근거는 보류한다', () => {
  const valid = candidate();
  const out = validateGroundedChapter(
    {
      relationships: [
        valid,
        candidate({ semantics: undefined }),
        candidate({ semantics: semantic({ change_evidence: { ...evidence, source_page: 2 } }) }),
      ],
    },
    [page],
    { requireRelationshipSemantics: true }
  );
  expect(out.relationships).toHaveLength(1);
  expect(out.review).toHaveLength(2);
});

test('FR-CHR-001: 같은 페이지의 상충하는 의미 판정은 조용히 버리거나 같은 ID로 덮지 않는다', () => {
  const state = createEmptyState('synthetic-contract');
  mergeRelationships(state, [
    resolved(),
    resolved({ semantics: semantic({ assertion_status: 'claim', attribution: '민수' }) }),
  ] as never);
  expect(state.relationships).toHaveLength(1);
  expect(state.review).toHaveLength(1);
});
