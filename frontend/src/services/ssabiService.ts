/**
 * 싸비 조회 ③ (dev-spec R4-frontend S4)
 *   GET /books/:bookId/ssabi/graph                    관계도 (FR-CHR-001 🚦, FR-SPL-005 🚦)
 *   GET /books/:bookId/ssabi/characters/:characterId  인물 상세 (FR-CHR-004·005)
 *
 * 응답은 이미 K 이하로 걸러져 온다. 프론트는 초과 여부를 판별하지 않는다 (절대 규칙 7번).
 * 페이지 변경 시 열린 탭만 재조회한다 (FR-SVB-003).
 */

import { api } from './api';
import { USE_MOCK } from '../utils/constants';
import type { CharacterResponse, GraphResponse } from '../types';

export async function fetchGraph(bookId: string): Promise<GraphResponse> {
  if (USE_MOCK) {
    const { mockGraphResponse } = await import('../../mocks/server');
    return mockGraphResponse();
  }
  const { data } = await api.get<GraphResponse>(`/books/${bookId}/ssabi/graph`);
  return data;
}

export async function fetchCharacter(
  bookId: string,
  characterId: string
): Promise<CharacterResponse> {
  if (USE_MOCK) {
    const { mockCharacterResponse } = await import('../../mocks/server');
    const character = mockCharacterResponse(characterId);
    if (!character) throw new Error('NOT_FOUND');
    return character;
  }
  const { data } = await api.get<CharacterResponse>(
    `/books/${bookId}/ssabi/characters/${characterId}`
  );
  return data;
}
