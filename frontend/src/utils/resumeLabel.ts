import type { BookSummary } from '../types';

// FR-BRW-002 FR-BRF-001
export function resumeLabel(book: BookSummary, busy: boolean): string {
  if (!book.ssabi_ready) return '아직 준비 중입니다';
  if (busy) return '여는 중';
  return book.progress ? '이어서 읽기' : '읽기 시작';
}
