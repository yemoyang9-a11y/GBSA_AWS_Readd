import { AxiosError, type AxiosResponse } from 'axios';
import { api } from './api';
import { USE_MOCK } from '../utils/constants';

export interface PositionResponse {
  applied_cutoff: number;
  current_chapter_no: number | null;
  read_chapter_nos: number[];
  is_complete: boolean;
}

// FR-SPL-002 🚦
export async function fetchPosition(bookId: string): Promise<PositionResponse> {
  if (USE_MOCK) {
    const { mockPositionResponse } = await import('../../mocks/server');
    const result = mockPositionResponse(bookId);
    if (result.status === 200) return result.body;
    throw new AxiosError('mock', 'ERR_BAD_REQUEST', undefined, null, {
      status: result.status,
    } as AxiosResponse);
  }
  const { data } = await api.get<PositionResponse>(`/books/${bookId}/position`);
  return data;
}
