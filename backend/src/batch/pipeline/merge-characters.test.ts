import { mergeCharacters } from './merge-characters';
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

describe('mergeCharacters — 동일 인물이 두 노드로 쪼개진 경우 하나로 합친다', () => {
  test('넘겨준 별칭을 survivor 앞으로 추가한다', async () => {
    const { client, calls } = mockClient();
    await mergeCharacters(client, 'takryu', {
      survivorId: 'survivor-1',
      mergedId: 'merged-1',
      aliasesToAdd: [
        { alias: '탑삭부리 한참봉', aliasType: 'nickname', firstAppearancePage: 79 },
        { alias: '바깥주인', aliasType: 'kinship', firstAppearancePage: 79 },
      ],
      relationshipIdsToRepoint: [],
      relationshipIdsToDelete: [],
    });

    const inserts = calls.filter((c) => c.sql.includes('INSERT INTO aliases'));
    expect(inserts).toHaveLength(2);
    expect(inserts[0].params).toEqual(['takryu', '탑삭부리 한참봉', 'survivor-1', 'nickname', 79]);
    expect(inserts[1].params).toEqual(['takryu', '바깥주인', 'survivor-1', 'kinship', 79]);
  });

  test('merged의 노트를 전부 survivor 앞으로 옮긴다', async () => {
    const { client, calls } = mockClient();
    await mergeCharacters(client, 'takryu', {
      survivorId: 'survivor-1',
      mergedId: 'merged-1',
      aliasesToAdd: [],
      relationshipIdsToRepoint: [],
      relationshipIdsToDelete: [],
    });

    const noteUpdate = calls.find((c) => c.sql.includes('UPDATE character_notes'));
    expect(noteUpdate?.params).toEqual(['takryu', 'survivor-1', 'merged-1']);
  });

  test('지정한 관계 id는 삭제한다(중복 간선 정리)', async () => {
    const { client, calls } = mockClient();
    await mergeCharacters(client, 'takryu', {
      survivorId: 'survivor-1',
      mergedId: 'merged-1',
      aliasesToAdd: [],
      relationshipIdsToRepoint: [],
      relationshipIdsToDelete: ['rel-dup-1', 'rel-dup-2'],
    });

    const del = calls.find(
      (c) => c.sql.includes('DELETE FROM relationships') && c.sql.includes('ANY')
    );
    expect(del?.params).toEqual(['takryu', ['rel-dup-1', 'rel-dup-2']]);
  });

  test('지정한 관계 id는 merged를 survivor로 치환한다(양쪽 컬럼 모두)', async () => {
    const { client, calls } = mockClient();
    await mergeCharacters(client, 'takryu', {
      survivorId: 'survivor-1',
      mergedId: 'merged-1',
      aliasesToAdd: [],
      relationshipIdsToRepoint: ['rel-keep-1'],
      relationshipIdsToDelete: [],
    });

    const repoint = calls.find(
      (c) => c.sql.includes('UPDATE relationships') && c.sql.includes('CASE WHEN')
    );
    expect(repoint?.sql).toMatch(/character_a_id/);
    expect(repoint?.sql).toMatch(/character_b_id/);
    expect(repoint?.params).toEqual(['takryu', ['rel-keep-1'], 'merged-1', 'survivor-1']);
  });

  test('마지막에 merged에 남은 별칭·노트·관계·인물 행을 모두 정리한다', async () => {
    const { client, calls } = mockClient();
    await mergeCharacters(client, 'takryu', {
      survivorId: 'survivor-1',
      mergedId: 'merged-1',
      aliasesToAdd: [],
      relationshipIdsToRepoint: [],
      relationshipIdsToDelete: [],
    });

    const cleanupAliasDelete = calls.find(
      (c) => c.sql === 'DELETE FROM aliases WHERE book_id = $1 AND character_id = $2'
    );
    const cleanupNoteDelete = calls.find(
      (c) => c.sql === 'DELETE FROM character_notes WHERE book_id = $1 AND character_id = $2'
    );
    const cleanupRelDelete = calls.find(
      (c) =>
        c.sql.includes('DELETE FROM relationships') &&
        c.sql.includes('character_a_id = $2 OR character_b_id = $2')
    );
    const characterDelete = calls.find(
      (c) => c.sql === 'DELETE FROM characters WHERE book_id = $1 AND id = $2'
    );

    expect(cleanupAliasDelete?.params).toEqual(['takryu', 'merged-1']);
    expect(cleanupNoteDelete?.params).toEqual(['takryu', 'merged-1']);
    expect(cleanupRelDelete?.params).toEqual(['takryu', 'merged-1']);
    expect(characterDelete?.params).toEqual(['takryu', 'merged-1']);
  });

  test('인물 행 삭제는 다른 정리 작업이 전부 끝난 뒤 마지막에 실행된다', async () => {
    const { client, calls } = mockClient();
    await mergeCharacters(client, 'takryu', {
      survivorId: 'survivor-1',
      mergedId: 'merged-1',
      aliasesToAdd: [{ alias: 'x', aliasType: 'nickname', firstAppearancePage: 1 }],
      relationshipIdsToRepoint: ['rel-keep-1'],
      relationshipIdsToDelete: ['rel-dup-1'],
    });

    const characterDeleteIndex = calls.findIndex(
      (c) => c.sql === 'DELETE FROM characters WHERE book_id = $1 AND id = $2'
    );
    expect(characterDeleteIndex).toBe(calls.length - 1);
  });

  test('book_id로 범위를 한정한다(다른 도서 데이터에 영향 없음)', async () => {
    const { client, calls } = mockClient();
    await mergeCharacters(client, 'takryu', {
      survivorId: 'survivor-1',
      mergedId: 'merged-1',
      aliasesToAdd: [{ alias: 'x', aliasType: 'nickname', firstAppearancePage: 1 }],
      relationshipIdsToRepoint: ['rel-keep-1'],
      relationshipIdsToDelete: ['rel-dup-1'],
    });

    calls.forEach((c) => expect(c.params?.[0]).toBe('takryu'));
  });
});
