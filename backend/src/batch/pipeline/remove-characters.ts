/**
 * 잘못 추출된 인물 노드(예: 조직·장소를 인물로 오인)를 공개 콘텐츠 스토어에서 제거한다.
 * FK(aliases/character_notes/relationships → characters)에 ON DELETE CASCADE가 없어
 * 자식 행부터 순서대로 지운다.
 */
import { QueryClient } from './register';

export async function removeCharacters(
  client: QueryClient,
  bookId: string,
  characterIds: string[]
): Promise<void> {
  for (const id of characterIds) {
    await client.query('DELETE FROM aliases WHERE book_id = $1 AND character_id = $2', [
      bookId,
      id,
    ]);
    await client.query('DELETE FROM character_notes WHERE book_id = $1 AND character_id = $2', [
      bookId,
      id,
    ]);
    await client.query(
      'DELETE FROM relationships WHERE book_id = $1 AND (character_a_id = $2 OR character_b_id = $2)',
      [bookId, id]
    );
    await client.query('DELETE FROM characters WHERE book_id = $1 AND id = $2', [bookId, id]);
  }
}
