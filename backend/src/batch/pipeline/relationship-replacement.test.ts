import { replaceRelationshipSnapshot } from './register';
import { sealResolvedOutput } from './grounding';
import { Page } from '../../shared/types';
const pages: Page[] = [{ id: 'p1', book_id: 'book', page_no: 1, content: 'A employs B.' }];
const evidence = {
  source_page: 1,
  quote: pages[0].content,
  start_char: 0,
  end_char: pages[0].content.length,
};
const data = () =>
  sealResolvedOutput(
    {
      book_id: 'book',
      chapter_summaries: [{ chapter_no: 1, title: 'One', summary: '' }],
      characters: [],
      terms: [],
      events: [],
      background_and_intro: { background: '', intro: '' },
      relationships: [
        {
          id: 'new',
          character_a_id: 'a',
          character_b_id: 'b',
          label: '고용한다',
          established_page: 1,
          semantics: {
            version: 2,
            direction: 'a_to_b',
            kind: 'social',
            relation_key: 'employment',
            summary: 'A는 B를 고용한다.',
            assertion_status: 'fact',
            temporal_scope: 'ongoing',
            state: 'active',
            evidence,
          },
        },
      ],
      provenance: {
        relationship_coverage: { complete: true, source_page_count: 1, chapter_nos: [1] },
      },
    },
    pages
  );
function database() {
  const query = jest.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.includes('RETURNING id')) return { rows: [{ id: params?.[0] }] };
    if (sql.includes('book_id <>')) return { rows: [] };
    if (sql.includes('FROM books')) return { rows: [{ publish_status: 'published' }] };
    if (sql.includes('FROM pages')) return { rows: pages };
    if (sql.includes('FROM chapters')) return { rows: [{ chapter_no: 1 }] };
    if (sql.includes('FROM characters')) return { rows: [{ id: 'a' }, { id: 'b' }] };
    if (sql.startsWith('SELECT') && sql.includes('FROM relationships'))
      return { rows: [{ id: 'old', label: '욕망' }] };
    return { rows: [] };
  });
  return { query };
}
test('FR-ADM-005: 전량 검증된 관계 snapshot만 오래된 라벨을 제거하고 재검수 상태로 적재한다', async () => {
  const client = database();
  const report = await replaceRelationshipSnapshot(client, data() as never);
  expect(report.removed_ids).toEqual(['old']);
  expect(
    client.query.mock.calls.find(([sql]) => sql.includes('DELETE FROM relationships'))?.[1]
  ).toEqual(['book', ['new']]);
  const writes = client.query.mock.calls
    .map(([sql]) => sql)
    .filter((sql) => /^(UPDATE|INSERT|DELETE)/.test(sql));
  expect(writes[0]).toMatch(/UPDATE books SET ssabi_ready = false/);
  expect(writes.some((sql) => sql.includes('DELETE FROM review_records'))).toBe(true);
  expect(
    writes.some((sql) => /(?:UPDATE|DELETE FROM|INSERT INTO) (characters|aliases)/.test(sql))
  ).toBe(false);
});
test('FR-ADM-005: 표본 또는 기존 인물 ID에 매핑되지 않은 snapshot은 삭제 없이 실패한다', async () => {
  const partial = data();
  partial.provenance.relationship_coverage.complete = false;
  const client = database();
  await expect(replaceRelationshipSnapshot(client, partial as never)).rejects.toThrow(/complete/i);
  expect(client.query.mock.calls.some(([sql]) => /^(UPDATE|INSERT|DELETE)/.test(sql))).toBe(false);
  const unknown = data();
  unknown.relationships[0].character_a_id = 'unmapped';
  await expect(
    replaceRelationshipSnapshot(client, sealResolvedOutput(unknown, pages) as never)
  ).rejects.toThrow(/identity|endpoint/i);
  expect(client.query.mock.calls.some(([sql]) => /^(UPDATE|INSERT|DELETE)/.test(sql))).toBe(false);
});

test('FR-ADM-005: 다른 도서가 소유한 관계 ID는 자기 도서 준비상태 변경 전 거절한다', async () => {
  const client = database();
  const original = client.query.getMockImplementation()!;
  client.query.mockImplementation(async (sql: string, params?: unknown[]) =>
    sql.includes('FROM relationships') && sql.includes('book_id <>')
      ? { rows: [{ id: 'new' }] }
      : original(sql, params)
  );
  await expect(replaceRelationshipSnapshot(client, data() as never)).rejects.toThrow(
    /another book|ownership/i
  );
  expect(client.query.mock.calls.some(([sql]) => /^(UPDATE|INSERT|DELETE)/.test(sql))).toBe(false);
});

test('FR-ADM-005: 사전 검사 뒤 충돌한 ID의 0행 upsert를 성공으로 보고 후속 삭제하지 않는다', async () => {
  const client = database();
  const original = client.query.getMockImplementation()!;
  client.query.mockImplementation(async (sql: string, params?: unknown[]) =>
    sql.includes('INSERT INTO relationships') ? { rows: [] } : original(sql, params)
  );
  await expect(replaceRelationshipSnapshot(client, data() as never)).rejects.toThrow(/ownership/i);
  const insert = client.query.mock.calls.find(([sql]) =>
    sql.includes('INSERT INTO relationships')
  )![0];
  expect(insert).toMatch(/WHERE relationships.book_id = EXCLUDED.book_id RETURNING id/);
  expect(client.query.mock.calls.some(([sql]) => sql.startsWith('DELETE'))).toBe(false);
});
