/**
 * 프론트 개발용 mock 데이터 — **백엔드 대역이다.**
 *
 * 이 디렉터리의 코드는 서버가 할 일을 흉내 낸 것이며, `VITE_USE_MOCK` 일 때만 로드된다.
 * 실제 시드 데이터의 정본은 백엔드 `seeds/dev_data.sql`(R1·R2 소유)이고, 여기 값은 그 규격을
 * 따라 만든 사본이다 — 어긋나면 백엔드 쪽이 정본이다.
 *
 * 규격 출처: dev-spec-00-shared.md §3 + R2 8/20 회신(team-sync-r4.md §4.6)
 *   - 페이지 30개, 장 경계 1–10 / 11–20 / 21–30
 *   - 테스트 기준점 K = 5 / 20 / 25 (K=20 이 장 종료 페이지와 일치하는 케이스)
 *   - 라벨이 바뀌는 관계 1쌍을 20~30페이지 범위에 배치 (A6)
 *   - 확립 페이지가 뒤쪽인 관계 1건, 후반부 첫 등장 가족관계 별칭 1건 (FR-SPL-002 🚦, D6)
 */

import type { BookSummary, ChapterSummary } from '../src/types';

export const MOCK_BOOK_ID = 'takryu';

export const mockCatalog: BookSummary[] = [
  {
    book_id: MOCK_BOOK_ID,
    title: '탁류',
    author: '채만식',
    cover_url: '',
    intro_summary:
      '금강 하구 군산을 배경으로, 미두장에서 재산을 잃은 정주사 일가의 몰락을 그린다. (mock 소개)',
    ssabi_ready: true,
    progress: { current_page: 21, percent: 70 },
  },
  {
    book_id: 'not-ready-book',
    title: '검수 전 도서',
    author: '미상',
    cover_url: '',
    intro_summary: null,
    ssabi_ready: false,
  },
];

export const mockChapters: ChapterSummary[] = [
  { chapter_no: 1, title: '제1장 인간기념물', start_page: 1, end_page: 10 },
  { chapter_no: 2, title: '제2장 생활 제일과', start_page: 11, end_page: 20 },
  { chapter_no: 3, title: '제3장 신판 흥부전', start_page: 21, end_page: 30 },
];

/** 인물 — first_page 가 상한 필터의 기준이다 (FR-SPL-002 🚦) */
export const mockCharacters = [
  { id: 'jeong', name: '정주사', first_appearance_page: 1 },
  { id: 'chobong', name: '초봉', first_appearance_page: 3 },
  { id: 'gyebong', name: '계봉', first_appearance_page: 8 },
  { id: 'seungjae', name: '남승재', first_appearance_page: 12 },
  /** 후반부에 처음 나오는 인물 — K=5·20 에서는 노드가 없어야 한다 */
  { id: 'taesu', name: '고태수', first_appearance_page: 22 },
];

export const mockAliases = [
  { character_id: 'jeong', alias: '정 주사', alias_type: 'name', first_appearance_page: 1 },
  { character_id: 'jeong', alias: '주사', alias_type: 'title', first_appearance_page: 2 },
  { character_id: 'chobong', alias: '초봉이', alias_type: 'name', first_appearance_page: 3 },
  { character_id: 'gyebong', alias: '계봉이', alias_type: 'name', first_appearance_page: 8 },
  { character_id: 'seungjae', alias: '승재', alias_type: 'name', first_appearance_page: 12 },
  { character_id: 'taesu', alias: '태수', alias_type: 'name', first_appearance_page: 22 },
  /**
   * D6 확인용 — 후반부에 처음 나오는 **가족관계 호칭** 별칭.
   * 이 별칭이 앞 기준점에서 새어 나가면 관계가 옆문으로 누설된다.
   */
  { character_id: 'taesu', alias: '초봉의 남편', alias_type: 'kinship', first_appearance_page: 26 },
];

/**
 * 관계 — 이력형이라 같은 쌍에 행이 여럿일 수 있다 (A6).
 * 표시는 확립 페이지 <= K 중 **최신 1개**만 (FR-CHR-001 🚦).
 */
export const mockRelationships = [
  { id: 'r1', a: 'jeong', b: 'chobong', label: '부녀', established_page: 3 },
  { id: 'r2', a: 'jeong', b: 'gyebong', label: '부녀', established_page: 8 },
  { id: 'r3', a: 'chobong', b: 'seungjae', label: '이웃', established_page: 13 },
  /** 라벨이 바뀌는 쌍 — K=22 면 약혼, K=28 이면 부부 하나만 나와야 한다 */
  { id: 'r4', a: 'chobong', b: 'taesu', label: '약혼', established_page: 22 },
  { id: 'r5', a: 'chobong', b: 'taesu', label: '부부', established_page: 28 },
];

export const mockCharacterNotes = [
  { character_id: 'jeong', note: '군산 미두장을 드나들며 재산을 잃었다.', source_page: 2 },
  { character_id: 'jeong', note: '딸 초봉을 시집보내 형편을 펴려 한다.', source_page: 9 },
  { character_id: 'chobong', note: '제중당 약국에서 일한다.', source_page: 5 },
  { character_id: 'taesu', note: '은행원이며 돈 씀씀이가 헤프다.', source_page: 23 },
];

export const mockPages: Record<number, string> = Object.fromEntries(
  Array.from({ length: 30 }, (_, i) => {
    const pageNo = i + 1;
    return [pageNo, `[${pageNo}페이지] 정 주사는 여전히 미두장 앞을 서성이고 있었다. (mock 본문)`];
  })
);

export const mockBookInfo = {
  basic_info: {
    title: '탁류',
    author: '채만식',
    published_year: 1937,
    length_note: '411페이지',
  },
  introduction: '1930년대 군산을 배경으로 한 세태소설이다. (mock)',
  background: '일제강점기 후반, 미곡 거래소를 중심으로 한 투기 경제가... (mock)',
  chapters: mockChapters,
};
