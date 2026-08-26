import { removeCharacters } from './remove-characters';
import { QueryClient } from './register';

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

describe('removeCharacters — 인물 아닌 노드 제거', () => {
  test('자식 행(별칭·노트·관계)을 인물 행보다 먼저 지운다', async () => {
    const { client, calls } = mockClient();
    await removeCharacters(client, 'takryu', ['char-1']);

    const order = calls.map((c) => c.sql.match(/DELETE FROM (\w+)/)?.[1]);
    expect(order).toEqual(['aliases', 'character_notes', 'relationships', 'characters']);
  });

  test('여러 id를 넘기면 각각에 대해 4개 테이블을 모두 지운다', async () => {
    const { client, calls } = mockClient();
    await removeCharacters(client, 'takryu', ['char-1', 'char-2']);

    expect(calls.filter((c) => c.sql.includes('DELETE FROM characters'))).toHaveLength(2);
    expect(calls.filter((c) => c.sql.includes('DELETE FROM aliases'))).toHaveLength(2);
  });

  test('관계는 character_a_id·character_b_id 어느 쪽이어도 삭제 대상에 포함한다', async () => {
    const { client, calls } = mockClient();
    await removeCharacters(client, 'takryu', ['char-1']);

    const relCall = calls.find((c) => c.sql.includes('DELETE FROM relationships'));
    expect(relCall?.sql).toMatch(/character_a_id = \$2 OR character_b_id = \$2/);
    expect(relCall?.params).toEqual(['takryu', 'char-1']);
  });

  test('book_id로 범위를 한정한다(다른 도서 데이터에 영향 없음)', async () => {
    const { client, calls } = mockClient();
    await removeCharacters(client, 'takryu', ['char-1']);

    calls.forEach((c) => expect(c.params?.[0]).toBe('takryu'));
  });
});
