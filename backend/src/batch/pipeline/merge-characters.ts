/**
 * 동일 인물이 엔티티 추출 과정에서 서로 다른 두 노드로 쪼개진 경우(예: 「탁류」의
 * "한참봉"/"탑삭부리 한참봉"), 한쪽(survivor)으로 합치고 다른 쪽(merged)을 지운다.
 * FK(aliases/character_notes/relationships → characters)에 ON DELETE CASCADE가 없어
 * merged를 참조하는 행부터 처리한 뒤 마지막에 characters 행을 지운다.
 */
import { QueryClient } from './register';

export interface AliasToAdd {
  alias: string;
  aliasType: 'name' | 'title' | 'kinship' | 'nickname';
  firstAppearancePage: number;
}

export interface MergeCharactersParams {
  survivorId: string;
  mergedId: string;
  aliasesToAdd: AliasToAdd[];
  relationshipIdsToRepoint: string[];
  relationshipIdsToDelete: string[];
}

export async function mergeCharacters(
  client: QueryClient,
  bookId: string,
  params: MergeCharactersParams
): Promise<void> {
  const { survivorId, mergedId, aliasesToAdd, relationshipIdsToRepoint, relationshipIdsToDelete } =
    params;

  for (const a of aliasesToAdd) {
    await client.query(
      'INSERT INTO aliases (book_id, alias, character_id, alias_type, first_appearance_page) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (book_id, alias, character_id) DO NOTHING',
      [bookId, a.alias, survivorId, a.aliasType, a.firstAppearancePage]
    );
  }

  await client.query(
    'UPDATE character_notes SET character_id = $2 WHERE book_id = $1 AND character_id = $3',
    [bookId, survivorId, mergedId]
  );

  if (relationshipIdsToDelete.length > 0) {
    await client.query('DELETE FROM relationships WHERE book_id = $1 AND id = ANY($2)', [
      bookId,
      relationshipIdsToDelete,
    ]);
  }

  if (relationshipIdsToRepoint.length > 0) {
    await client.query(
      `UPDATE relationships SET
         character_a_id = CASE WHEN character_a_id = $3 THEN $4 ELSE character_a_id END,
         character_b_id = CASE WHEN character_b_id = $3 THEN $4 ELSE character_b_id END
       WHERE book_id = $1 AND id = ANY($2)`,
      [bookId, relationshipIdsToRepoint, mergedId, survivorId]
    );
  }

  await client.query('DELETE FROM aliases WHERE book_id = $1 AND character_id = $2', [
    bookId,
    mergedId,
  ]);
  await client.query('DELETE FROM character_notes WHERE book_id = $1 AND character_id = $2', [
    bookId,
    mergedId,
  ]);
  await client.query(
    'DELETE FROM relationships WHERE book_id = $1 AND (character_a_id = $2 OR character_b_id = $2)',
    [bookId, mergedId]
  );
  await client.query('DELETE FROM characters WHERE book_id = $1 AND id = $2', [bookId, mergedId]);
}
