import type { PageResponse } from '../src/types';

// FR-PRG-001
export function fakePage(pageNo: number, lastPage: number, content: string): PageResponse {
  return {
    page_no: pageNo,
    content,
    prev_page: pageNo > 1 ? pageNo - 1 : null,
    next_page: pageNo < lastPage ? pageNo + 1 : null,
  };
}
