/**
 * 지금 보고 있는 페이지 본문 → 챗봇 프롬프트 자동 주입 테스트
 *
 * 신규 UX(2026-08-24, 사용자 요청): "13페이지도 포함해서 근거로 써라" — K(기준점, R1)는
 * 그대로 두고, 이미 화면에 떠 있는(R3: 본문 접근 무제한) 현재 페이지 전체를 매 질문마다
 * 자동으로 프롬프트에 얹는다. quote-context.test.ts와 같은 정신 — K로 자르는 근거
 * 조립(assembleContext)·검색(vectorSearch)은 건드리지 않는다.
 */

import { handleQuery, NO_EVIDENCE_MESSAGE } from '../service';
import * as repo from '../repository';
import { vectorSearch } from '../vector-search';
import { stream as llmStream } from '../../llm-gateway/gateway';

jest.mock('../repository');
jest.mock('../vector-search');
jest.mock('../../llm-gateway/gateway', () => ({ stream: jest.fn() }));

describe('지금 보고 있는 페이지 본문 → 프롬프트 주입', () => {
  const BOOK_ID = 'takryu-vol1';
  const DEVICE_ID = 'device-123';
  const K = 12; // 13페이지 진입 → K = 12 (FR-PRG-003)
  const QUERY = "'스래' 이게 뭐야?";
  const CURRENT_PAGE = { pageNo: 13, content: "개복동, 구복동, 둔뱀이 그리고... '스래', 이러한 몇 곳이..." };

  let capturedPrompt = '';

  beforeEach(() => {
    process.env.MOCK_MODE = 'false';

    (repo.findChapterSummaries as jest.Mock).mockResolvedValue([]);
    (repo.getCurrentChapterText as jest.Mock).mockResolvedValue('');
    (repo.findCharacters as jest.Mock).mockResolvedValue([]);
    (repo.findRelationships as jest.Mock).mockResolvedValue([]);
    (repo.findCharacterNotes as jest.Mock).mockResolvedValue([]);
    (repo.findTerms as jest.Mock).mockResolvedValue([]);
    (repo.findEvents as jest.Mock).mockResolvedValue([]);
    (repo.getBackgroundKnowledge as jest.Mock).mockResolvedValue([]);
    (vectorSearch as jest.Mock).mockResolvedValue([]);

    capturedPrompt = '';
    (llmStream as jest.Mock).mockImplementation(async function* (_task: string, prompt: string) {
      capturedPrompt = prompt;
      yield '답변입니다.';
    });

    jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('현재 페이지 본문이 있으면 프롬프트에 "지금 보고 있는 페이지 본문" 섹션으로 그대로 들어간다', async () => {
    for await (const _ of handleQuery(BOOK_ID, QUERY, K, DEVICE_ID, undefined, undefined, CURRENT_PAGE)) {
      // 소비만 한다
    }

    expect(capturedPrompt).toContain('## 지금 보고 있는 페이지 본문 (p.13)');
    expect(capturedPrompt).toContain(CURRENT_PAGE.content);
  });

  test('현재 페이지 본문이 없으면(호출부 조회 실패 등) 섹션 자체가 없다', async () => {
    for await (const _ of handleQuery(BOOK_ID, QUERY, K, DEVICE_ID)) {
      // 소비만 한다
    }

    expect(capturedPrompt).not.toContain('## 지금 보고 있는 페이지 본문');
  });

  test('현재 페이지 본문은 K로 자르는 근거 조립·검색 경로를 거치지 않는다', async () => {
    for await (const _ of handleQuery(BOOK_ID, QUERY, K, DEVICE_ID, undefined, undefined, CURRENT_PAGE)) {
      // 소비만 한다
    }

    expect(vectorSearch).toHaveBeenCalledWith(BOOK_ID, QUERY, K);
  });

  test('노이즈 없이(NO_EVIDENCE 토큰 발생 안 함) 정상 답변이 그대로 흘러나온다', async () => {
    const chunks: string[] = [];
    for await (const chunk of handleQuery(
      BOOK_ID,
      QUERY,
      K,
      DEVICE_ID,
      undefined,
      undefined,
      CURRENT_PAGE
    )) {
      chunks.push(chunk);
    }

    expect(chunks.join('')).toBe('답변입니다.');
    expect(chunks.join('')).not.toBe(NO_EVIDENCE_MESSAGE);
  });
});
