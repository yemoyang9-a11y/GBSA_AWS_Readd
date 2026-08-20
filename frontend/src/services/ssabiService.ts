/**
 * 싸비 조회 ③ (dev-spec R4-frontend S4)
 *   GET /books/:bookId/ssabi/graph?page=&seq=
 *   GET /books/:bookId/ssabi/characters/:characterId?page=&seq=
 *
 * `(page, seq)` 를 반드시 동봉한다 (team-sync-r4.md §4.3, 00-shared §2.5). 서버는 이를
 * 진도 이벤트와 동일하게 처리한 뒤 기준점을 파생하므로, 페이지를 넘긴 직후 재조회해도
 * 최신 K 로 응답이 온다 (FR-SVB-003). 이게 없으면 저장 순서에 따라 옛 K 가 섞인다.
 *
 * 응답은 이미 K 이하로 걸러져 온다. 프론트는 초과 여부를 판별하지 않는다 (절대 규칙 7번).
 */

import { api } from './api';
import { USE_MOCK } from '../utils/constants';
import type { CharacterResponse, GraphResponse } from '../types';

export async function fetchGraph(
  bookId: string,
  page: number,
  seq: number
): Promise<GraphResponse> {
  if (USE_MOCK) {
    const { mockGraphResponse } = await import('../../mocks/server');
    return mockGraphResponse(page);
  }
  const { data } = await api.get<GraphResponse>(`/books/${bookId}/ssabi/graph`, {
    params: { page, seq },
  });
  return data;
}

export async function fetchCharacter(
  bookId: string,
  characterId: string,
  page: number,
  seq: number
): Promise<CharacterResponse> {
  if (USE_MOCK) {
    const { mockCharacterResponse } = await import('../../mocks/server');
    const character = mockCharacterResponse(characterId, page);
    if (!character) throw new Error('NOT_FOUND');
    return character;
  }
  const { data } = await api.get<CharacterResponse>(
    `/books/${bookId}/ssabi/characters/${characterId}`,
    { params: { page, seq } }
  );
  return data;
}
