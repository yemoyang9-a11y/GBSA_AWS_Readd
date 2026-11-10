import { api } from './api';

export interface PositionResponse {
  applied_cutoff: number;
  current_chapter_no: number | null;
  read_chapter_nos: number[];
  is_complete: boolean;
}

// FR-SPL-002 🚦
export async function fetchPosition(bookId: string): Promise<PositionResponse> {
  const { data } = await api.get<PositionResponse>(`/books/${bookId}/position`);
  return data;
}
