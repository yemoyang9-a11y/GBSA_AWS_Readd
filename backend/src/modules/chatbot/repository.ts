/**
 * 챗봇 데이터 접근 레이어
 *
 * PostgreSQL + pgvector 쿼리
 * 모든 조회는 cutoff(K) 필터 적용 (FR-QNA-006 🚦)
 */

import { pool } from '../../config/database';
import type {
  ChapterSummary,
  Character,
  Relationship,
  CharacterNote,
  Term,
  Event,
  SearchChunk,
} from '../../shared/types';

/**
 * 장 요약 조회 (완결된 장만)
 *
 * FR-QNA-006 🚦: 종료 페이지 <= K
 */
export async function findChapterSummaries(
  bookId: string,
  K: number
): Promise<ChapterSummary[]> {
  const query = `
    SELECT
      chapter_no,
      title,
      summary as content,
      end_page
    FROM chapter_summaries
    WHERE book_id = $1
      AND end_page <= $2
    ORDER BY chapter_no
  `;

  const result = await pool.query(query, [bookId, K]);
  return result.rows;
}

/**
 * 현재 장 원문 조회 (절단)
 *
 * FR-QNA-006 🚦: [현재 장 시작 .. K]
 */
export async function getCurrentChapterText(
  bookId: string,
  K: number
): Promise<string | null> {
  // 1. K가 속한 장 찾기
  const chapterQuery = `
    SELECT chapter_no, start_page, end_page
    FROM chapters
    WHERE book_id = $1
      AND start_page <= $2
      AND end_page >= $2
    LIMIT 1
  `;

  const chapterResult = await pool.query(chapterQuery, [bookId, K]);

  if (chapterResult.rows.length === 0) {
    return null;
  }

  const chapter = chapterResult.rows[0];

  // 2. 현재 장의 페이지들 조회 (시작 ~ K)
  const pagesQuery = `
    SELECT content
    FROM pages
    WHERE book_id = $1
      AND page_no >= $2
      AND page_no <= $3
    ORDER BY page_no
  `;

  const pagesResult = await pool.query(pagesQuery, [
    bookId,
    chapter.start_page,
    K,
  ]);

  // 3. 페이지 내용 연결
  return pagesResult.rows.map(row => row.content).join('\n\n');
}

/**
 * 인물 조회
 *
 * FR-QNA-006 🚦: 최초 등장 페이지 <= K
 */
export async function findCharacters(
  bookId: string,
  K: number
): Promise<Character[]> {
  const query = `
    SELECT
      id,
      book_id,
      name,
      first_appearance_page
    FROM characters
    WHERE book_id = $1
      AND first_appearance_page <= $2
    ORDER BY first_appearance_page
  `;

  const result = await pool.query(query, [bookId, K]);
  return result.rows;
}

/**
 * 관계 조회 (이력 전체)
 *
 * A6: 이력 전체를 확립 페이지와 병기
 * FR-QNA-006 🚦: 확립 페이지 <= K
 */
export async function findRelationships(
  bookId: string,
  K: number
): Promise<Relationship[]> {
  const query = `
    SELECT
      id,
      book_id,
      character_a_id,
      character_b_id,
      label,
      established_page
    FROM relationships
    WHERE book_id = $1
      AND established_page <= $2
    ORDER BY character_a_id, character_b_id, established_page
  `;

  const result = await pool.query(query, [bookId, K]);
  return result.rows;
}

/**
 * 인물 노트 조회
 *
 * FR-QNA-006 🚦: 근거 페이지 <= K
 */
export async function findCharacterNotes(
  bookId: string,
  K: number
): Promise<CharacterNote[]> {
  const query = `
    SELECT
      cn.id,
      cn.character_id,
      cn.note,
      cn.source_page
    FROM character_notes cn
    JOIN characters c ON cn.character_id = c.id
    WHERE c.book_id = $1
      AND c.first_appearance_page <= $2
      AND cn.source_page <= $2
    ORDER BY c.first_appearance_page, cn.source_page
  `;

  const result = await pool.query(query, [bookId, K]);
  return result.rows;
}

/**
 * 용어 조회
 *
 * FR-QNA-006 🚦: 최초 등장 페이지 <= K
 */
export async function findTerms(bookId: string, K: number): Promise<Term[]> {
  const query = `
    SELECT
      id,
      book_id,
      term,
      definition,
      first_appearance_page
    FROM terms
    WHERE book_id = $1
      AND first_appearance_page <= $2
    ORDER BY first_appearance_page
  `;

  const result = await pool.query(query, [bookId, K]);
  return result.rows;
}

/**
 * 사건 조회
 *
 * FR-QNA-006 🚦: 발생 페이지 <= K
 */
export async function findEvents(bookId: string, K: number): Promise<Event[]> {
  const query = `
    SELECT
      id,
      book_id,
      event,
      description,
      occurrence_page
    FROM events
    WHERE book_id = $1
      AND occurrence_page <= $2
    ORDER BY occurrence_page
  `;

  const result = await pool.query(query, [bookId, K]);
  return result.rows;
}

/**
 * 배경지식 조회
 *
 * R5: 상한 없음 (FR-BGK-002 🚦)
 */
export async function getBackgroundKnowledge(bookId: string): Promise<string> {
  const query = `
    SELECT background_knowledge
    FROM books
    WHERE id = $1
  `;

  const result = await pool.query(query, [bookId]);
  return result.rows[0]?.background_knowledge || '';
}

/**
 * 벡터 검색 (pgvector)
 *
 * FR-QNA-006 🚦: WHERE page_no <= K (사전 필터)
 *
 * pgvector의 <=> 연산자 사용 (cosine distance)
 */
export async function vectorSearch(
  bookId: string,
  queryEmbedding: number[],
  K: number,
  topN: number = 6
): Promise<SearchChunk[]> {
  const query = `
    SELECT
      page_no,
      content,
      embedding <=> $1::vector as distance
    FROM pages
    WHERE book_id = $2
      AND page_no <= $3
    ORDER BY distance ASC
    LIMIT $4
  `;

  // pgvector는 배열을 [1,2,3] 형식의 문자열로 변환
  const embeddingString = `[${queryEmbedding.join(',')}]`;

  const result = await pool.query(query, [embeddingString, bookId, K, topN]);
  return result.rows;
}

/**
 * 별칭 조회 (질의 정규화용)
 *
 * K 이하의 별칭만
 */
export async function findAliases(
  bookId: string,
  K: number
): Promise<Array<{ alias: string; characterName: string }>> {
  const query = `
    SELECT
      a.alias,
      c.name as character_name
    FROM aliases a
    JOIN characters c ON a.character_id = c.id
    WHERE c.book_id = $1
      AND a.first_appearance_page <= $2
    ORDER BY a.first_appearance_page
  `;

  const result = await pool.query(query, [bookId, K]);
  return result.rows.map(row => ({
    alias: row.alias,
    characterName: row.character_name,
  }));
}
