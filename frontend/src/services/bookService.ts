/**
 * 콘텐츠 조회 ① (dev-spec R4-frontend S1)
 *   GET /books                        카탈로그 (FR-BRW-001·002)
 *   GET /books/:bookId/info           i 팝업 3영역 + 목차 (FR-BRW-003, FR-NAV-001)
 *   GET /books/:bookId/pages/:pageNo   본문 단건 — 진도에 관여하지 않는다 (FR-PRG-001)
 *
 * 백엔드 미구현 구간에는 src/mocks 대역을 쓴다 (VITE_USE_MOCK).
 */

import { api } from './api';
import { USE_MOCK } from '../utils/constants';
import type { BookInfoResponse, CatalogResponse, PageResponse } from '../types';

export async function fetchCatalog(): Promise<CatalogResponse> {
  if (USE_MOCK) {
    const { mockCatalogResponse } = await import('../../mocks/server');
    return mockCatalogResponse();
  }
  const { data } = await api.get<CatalogResponse>('/books');
  return data;
}

export async function fetchBookInfo(bookId: string): Promise<BookInfoResponse> {
  if (USE_MOCK) {
    const { mockInfoResponse } = await import('../../mocks/server');
    return mockInfoResponse();
  }
  const { data } = await api.get<BookInfoResponse>(`/books/${bookId}/info`);
  return data;
}

/** 진도 무관 — 선요청해도 안전하다. 프리페치가 기준점을 밀지 않는다 (team-sync-r4.md §1.1) */
export async function fetchPage(bookId: string, pageNo: number): Promise<PageResponse> {
  if (USE_MOCK) {
    const { mockPageResponse } = await import('../../mocks/server');
    return mockPageResponse(pageNo);
  }
  const { data } = await api.get<PageResponse>(`/books/${bookId}/pages/${pageNo}`);
  return data;
}
