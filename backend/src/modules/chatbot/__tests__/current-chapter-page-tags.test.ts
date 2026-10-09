/**
 * 현재 장 원문 절단 - 페이지 태그
 *
 * 버그: "20페이지까지 요약해줘"처럼 질문이 구체적인 페이지 경계를 지정하면,
 * getCurrentChapterText가 반환하는 원문에 페이지 경계 표시가 전혀 없어서(그냥
 * "\n\n"으로 이어붙임) 모델이 그 경계를 어디서 지켜야 할지 알 수 없다.
 * 배치 파이프라인(generate.ts의 buildPageTaggedText)은 이미 같은 문제를
 * "[페이지 N]" 태그로 풀고 있으므로, 챗봇 런타임도 같은 표기를 써야 한다.
 *
 * 단, 이미 완결돼 요약만 저장된 장(장 요약)에는 이 태그가 없다 — 그건 배치 생성
 * 프롬프트 자체를 바꿔야 하는 별도 작업이라 이번 범위(현재 진행 중인 장)에서 제외했다.
 *
 * @see repository.ts getCurrentChapterText
 * @see ../../../batch/pipeline/generate.ts buildPageTaggedText
 */

import { getCurrentChapterText } from '../repository';
import { pool } from '../../../config/database';

jest.mock('../../../config/database', () => ({
  pool: { query: jest.fn() },
}));

describe('getCurrentChapterText - 페이지 태그', () => {
  const BOOK_ID = 'takryu-vol1';

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('반환된 원문의 각 페이지 앞에 [페이지 N] 표시가 붙는다', async () => {
    const mockQuery = pool.query as jest.Mock;
    // 1. 장 조회
    mockQuery.mockResolvedValueOnce({
      rows: [{ chapter_no: 3, start_page: 16, end_page: 70 }],
    });
    // 2. 페이지 본문 조회
    mockQuery.mockResolvedValueOnce({
      rows: [
        { page_no: 16, content: '열여섯 페이지 내용' },
        { page_no: 17, content: '열일곱 페이지 내용' },
      ],
    });

    const text = await getCurrentChapterText(BOOK_ID, 17);

    expect(text).toBe('[페이지 16]\n열여섯 페이지 내용\n\n[페이지 17]\n열일곱 페이지 내용');
  });
});
