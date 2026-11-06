import type {
  BookInfoResponse,
  CatalogResponse,
  ChapterSummary,
  GraphResponse,
  PageResponse,
} from '../../src/types';

export const BOOK_ID = 'takryu-e2e';

const PARAGRAPH =
  '금강이 오백 리를 흘러 강경에 이르면 물은 흐리고 탁해진다. 정 주사는 오늘도 미두장 앞을 서성이며 ' +
  '하루 벌이를 셈하다가 한숨을 쉬고, 초봉은 제중당 약국 창가에서 지나가는 사람들을 내다본다. ';

export function chapters(totalPages: number): ChapterSummary[] {
  const third = Math.floor(totalPages / 3);
  return [
    { chapter_no: 1, title: '인간기념물', start_page: 1, end_page: third },
    { chapter_no: 2, title: '생활 제일과', start_page: third + 1, end_page: third * 2 },
    { chapter_no: 3, title: '신판 흥보전', start_page: third * 2 + 1, end_page: totalPages },
  ];
}

export function bookInfo(totalPages: number): BookInfoResponse {
  return {
    basic_info: { title: '탁류', author: '채만식', published_year: 1937, length_note: `${totalPages}페이지` },
    introduction: '군산을 배경으로 한 장편소설.',
    background: '1930년대 군산 미두장.',
    chapters: chapters(totalPages),
  };
}

export function pageResponse(pageNo: number, totalPages: number): PageResponse {
  return {
    page_no: pageNo,
    content: `${pageNo}쪽. ` + Array.from({ length: 14 }, () => PARAGRAPH).join('\n\n'),
    prev_page: pageNo > 1 ? pageNo - 1 : null,
    next_page: pageNo < totalPages ? pageNo + 1 : null,
  } as PageResponse;
}

export function graph(): GraphResponse {
  return {
    nodes: [
      { id: 'jeong', name: '정주사', first_appearance_page: 1, aliases: ['정 주사'] },
      { id: 'chobong', name: '초봉', first_appearance_page: 1, aliases: [] },
    ],
    edges: [{ source: 'jeong', target: 'chobong', label: '아버지', established_page: 1 }],
  } as GraphResponse;
}

export function catalog(): CatalogResponse {
  return {
    books: [
      {
        book_id: BOOK_ID,
        title: '탁류',
        author: '채만식',
        cover_url: '',
        intro_summary: '군산을 배경으로 한 장편소설.',
        ssabi_ready: true,
      },
    ],
  } as CatalogResponse;
}
