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

  /**
   * 아래부터는 관계도 화면을 실제 규모(「탁류」100p 시점 기준 인물 30명 안팎,
   * RelationshipGraph.tsx 주석 참고)에 가깝게 로컬에서 눈으로 확인하려고 채운
   * **순수 화면 채우기용 인물**이다(사용자 요청, 2026-08-25) — 원문에서 뽑아낸
   * 실제 등장인물이 아니다. 실제 인물 데이터의 정본은 여전히 백엔드
   * seeds/dev_data.sql(R1·R2 소유)이며, 이 인물들은 그 파일에 없다 — 이 대역을
   * 넘어 다른 화면·테스트가 이름으로 이 인물들을 참조하지 않게 주의할 것.
   * 대부분 1~20페이지 사이에 등장시켜 기본 진도(currentPage=21, K=20)에서
   * 바로 30명 안팎이 보이게 했다.
   */
  { id: 'yuci', name: '유씨', first_appearance_page: 2 },
  { id: 'hyeongju', name: '형주', first_appearance_page: 4 },
  { id: 'byeongju', name: '병주', first_appearance_page: 5 },
  { id: 'parkjusa', name: '박주사', first_appearance_page: 2 },
  { id: 'gochambong', name: '고참봉', first_appearance_page: 2 },
  { id: 'yunseogi', name: '윤서기', first_appearance_page: 3 },
  { id: 'hanyeonggam', name: '한영감', first_appearance_page: 4 },
  { id: 'choichabu', name: '최차부', first_appearance_page: 3 },
  { id: 'yakgukjuin', name: '제중당 주인', first_appearance_page: 5 },
  { id: 'songjeomwon', name: '송점원', first_appearance_page: 6 },
  { id: 'kimhalmeoni', name: '김할머니', first_appearance_page: 7 },
  { id: 'ossi', name: '오씨', first_appearance_page: 9 },
  { id: 'imyakguk', name: '임약국', first_appearance_page: 10 },
  { id: 'baechabu', name: '배차부', first_appearance_page: 11 },
  { id: 'sinyeonggam', name: '신영감', first_appearance_page: 6 },
  { id: 'moonjigi', name: '문지기', first_appearance_page: 7 },
  { id: 'bangmuljangsu', name: '방물장수', first_appearance_page: 9 },
  { id: 'pomoksang', name: '포목상', first_appearance_page: 10 },
  { id: 'omsunsa', name: '오순사', first_appearance_page: 13 },
  { id: 'gangseogi', name: '강서기', first_appearance_page: 14 },
  { id: 'yeojucheom', name: '최여사', first_appearance_page: 15 },
  { id: 'hanssidaek', name: '한씨댁', first_appearance_page: 16 },
  { id: 'jangdolsoe', name: '장돌쇠', first_appearance_page: 17 },
  { id: 'bakcheomji', name: '박첨지', first_appearance_page: 18 },
  { id: 'gimseobang', name: '김서방', first_appearance_page: 19 },
  { id: 'leejib', name: '이집사', first_appearance_page: 20 },
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

  /** 화면 채우기용 인물들 사이의 간선 — 위 mockCharacters 주석과 같은 목적(2026-08-25) */
  { id: 'r6', a: 'jeong', b: 'yuci', label: '부부', established_page: 2 },
  { id: 'r7', a: 'yuci', b: 'hyeongju', label: '모자', established_page: 4 },
  { id: 'r8', a: 'jeong', b: 'hyeongju', label: '부자', established_page: 4 },
  { id: 'r9', a: 'yuci', b: 'byeongju', label: '모자', established_page: 5 },
  { id: 'r10', a: 'jeong', b: 'byeongju', label: '부자', established_page: 5 },
  { id: 'r11', a: 'yuci', b: 'chobong', label: '모녀', established_page: 3 },
  { id: 'r12', a: 'yuci', b: 'gyebong', label: '모녀', established_page: 8 },
  { id: 'r13', a: 'hyeongju', b: 'byeongju', label: '형제', established_page: 5 },
  { id: 'r14', a: 'hyeongju', b: 'chobong', label: '남매', established_page: 4 },
  { id: 'r15', a: 'hyeongju', b: 'gyebong', label: '남매', established_page: 8 },
  { id: 'r16', a: 'byeongju', b: 'chobong', label: '남매', established_page: 5 },
  { id: 'r17', a: 'byeongju', b: 'gyebong', label: '남매', established_page: 8 },

  { id: 'r18', a: 'jeong', b: 'parkjusa', label: '지인', established_page: 2 },
  { id: 'r19', a: 'jeong', b: 'gochambong', label: '거래', established_page: 2 },
  { id: 'r20', a: 'parkjusa', b: 'gochambong', label: '동료', established_page: 2 },
  { id: 'r21', a: 'gochambong', b: 'yunseogi', label: '동료', established_page: 3 },
  { id: 'r22', a: 'parkjusa', b: 'hanyeonggam', label: '지인', established_page: 4 },
  { id: 'r23', a: 'jeong', b: 'hanyeonggam', label: '지인', established_page: 4 },
  { id: 'r24', a: 'gochambong', b: 'choichabu', label: '안면', established_page: 3 },
  { id: 'r25', a: 'yunseogi', b: 'choichabu', label: '안면', established_page: 3 },

  { id: 'r26', a: 'chobong', b: 'yakgukjuin', label: '고용', established_page: 5 },
  { id: 'r27', a: 'chobong', b: 'songjeomwon', label: '동료', established_page: 6 },
  { id: 'r28', a: 'yakgukjuin', b: 'songjeomwon', label: '고용', established_page: 6 },
  { id: 'r29', a: 'yakgukjuin', b: 'imyakguk', label: '경쟁', established_page: 10 },
  { id: 'r30', a: 'songjeomwon', b: 'imyakguk', label: '안면', established_page: 10 },

  { id: 'r31', a: 'chobong', b: 'kimhalmeoni', label: '이웃', established_page: 7 },
  { id: 'r32', a: 'seungjae', b: 'kimhalmeoni', label: '이웃', established_page: 12 },
  { id: 'r33', a: 'chobong', b: 'ossi', label: '이웃', established_page: 9 },
  { id: 'r34', a: 'kimhalmeoni', b: 'ossi', label: '이웃', established_page: 9 },
  { id: 'r35', a: 'sinyeonggam', b: 'jeong', label: '마름', established_page: 6 },
  { id: 'r36', a: 'sinyeonggam', b: 'moonjigi', label: '안면', established_page: 7 },
  { id: 'r37', a: 'moonjigi', b: 'bangmuljangsu', label: '안면', established_page: 9 },
  { id: 'r38', a: 'bangmuljangsu', b: 'pomoksang', label: '동업', established_page: 10 },
  { id: 'r39', a: 'baechabu', b: 'choichabu', label: '동료', established_page: 11 },
  { id: 'r40', a: 'baechabu', b: 'jeong', label: '안면', established_page: 11 },

  { id: 'r41', a: 'omsunsa', b: 'jeong', label: '안면', established_page: 13 },
  { id: 'r42', a: 'omsunsa', b: 'gangseogi', label: '동료', established_page: 14 },
  { id: 'r43', a: 'gangseogi', b: 'yeojucheom', label: '안면', established_page: 15 },
  { id: 'r44', a: 'yeojucheom', b: 'hanssidaek', label: '이웃', established_page: 16 },
  { id: 'r45', a: 'hanssidaek', b: 'kimhalmeoni', label: '이웃', established_page: 16 },
  { id: 'r46', a: 'jangdolsoe', b: 'baechabu', label: '동료', established_page: 17 },
  { id: 'r47', a: 'jangdolsoe', b: 'bakcheomji', label: '안면', established_page: 18 },
  { id: 'r48', a: 'bakcheomji', b: 'sinyeonggam', label: '지인', established_page: 18 },
  { id: 'r49', a: 'gimseobang', b: 'jangdolsoe', label: '동료', established_page: 19 },
  { id: 'r50', a: 'gimseobang', b: 'jeong', label: '안면', established_page: 19 },
  { id: 'r51', a: 'leejib', b: 'yeojucheom', label: '교우', established_page: 20 },
  { id: 'r52', a: 'leejib', b: 'hanssidaek', label: '교우', established_page: 20 },
  { id: 'r53', a: 'seungjae', b: 'omsunsa', label: '안면', established_page: 13 },
];

export const mockCharacterNotes = [
  { character_id: 'jeong', note: '군산 미두장을 드나들며 재산을 잃었다.', source_page: 2 },
  { character_id: 'jeong', note: '딸 초봉을 시집보내 형편을 펴려 한다.', source_page: 9 },
  { character_id: 'chobong', note: '제중당 약국에서 일한다.', source_page: 5 },
  { character_id: 'taesu', note: '은행원이며 돈 씀씀이가 헤프다.', source_page: 23 },
];

/**
 * 문장 하나짜리였던 예전 mock 본문은 리더 화면(article)이 넘칠 만큼 길지 않아
 * 스크롤바가 아예 안 나타났다(2026-08-24, 사용자 제보) — 아무 텍스트나 한 줄을
 * 여러 번 반복해서 길이만 채운다(사용자 지시 — 실제 내용처럼 채우지 말 것).
 * 인물 이름은 넣지 않는다 — 넣으면 first_appearance_page보다 앞 페이지 본문에
 * 이름이 섞여, 본문을 전역 텍스트로 검색하는 스포일러 게이트 테스트가 깨진다.
 */
const MOCK_LINE = '자리를 채우기 위한 mock 본문 줄입니다. '.repeat(3).trim();

export const mockPages: Record<number, string> = Object.fromEntries(
  Array.from({ length: 30 }, (_, i) => {
    const pageNo = i + 1;
    const body = Array.from({ length: 20 }, () => MOCK_LINE).join('\n');
    return [pageNo, `[${pageNo}페이지]\n${body}\n(mock 본문)`];
  })
);

/** 범위 밖 페이지 번호가 들어와도 빈 화면 대신 1~30 안으로 접어 보여준다. */
export function mockPageContent(pageNo: number): string {
  const clamped = Math.min(30, Math.max(1, pageNo));
  return mockPages[clamped];
}

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
