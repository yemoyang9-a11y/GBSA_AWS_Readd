/**
 * "아모"(챗봇 캐릭터 이름) 자기소개 질문 — 고정 멘트
 *
 * "아모가 뭐야", "아모에 대해 알려줘"처럼 챗봇 자신의 정체를 묻는 질문은 소설 근거와
 * 무관하다. 이름을 명시하지 않은 자기소개 질문도 아모로 답하고, 작품 속 인물의
 * 이름을 묻는 질문이나 복합 질문을 자기소개로 잘못 처리하지 않는다.
 * LLM 판단에 맡기지 않고 코드에서 고정 멘트로 즉시 답한다(근거 조립·검색·LLM 호출
 * 전부 생략 — difficulty-router.ts와 같은 키워드 매칭 스타일).
 */

import { handleQuery, AMO_INTRO_MESSAGE } from '../service';
import * as repo from '../repository';
import { vectorSearch } from '../vector-search';
import { stream as llmStream } from '../../llm-gateway/gateway';
import { getConversationContext, recordTurns } from '../conversation-service';

jest.mock('../repository');
jest.mock('../vector-search');
jest.mock('../conversation-service', () => ({
  getConversationContext: jest.fn(),
  recordTurns: jest.fn(),
}));
// 팩토리로 모킹한다 — 자동모킹은 실제 gateway.ts를 로드해 dotenv 부작용으로 로컬 .env의
// MOCK_MODE=true가 새어 들어간다(no-evidence-streaming.test.ts와 같은 이유).
jest.mock('../../llm-gateway/gateway', () => ({ stream: jest.fn() }));

describe('아모 자기소개 — 고정 멘트', () => {
  const BOOK_ID = 'takryu-vol1';
  const DEVICE_ID = 'device-123';
  const K = 80;

  beforeEach(() => {
    process.env.MOCK_MODE = 'false';
    jest.resetAllMocks();
    jest.spyOn(console, 'log').mockImplementation();
    (repo.findChapterSummaries as jest.Mock).mockResolvedValue([]);
    (repo.getCurrentChapterText as jest.Mock).mockResolvedValue('');
    (repo.findCharacters as jest.Mock).mockResolvedValue([]);
    (repo.findRelationships as jest.Mock).mockResolvedValue([]);
    (repo.findCharacterNotes as jest.Mock).mockResolvedValue([]);
    (repo.findTerms as jest.Mock).mockResolvedValue([]);
    (repo.findEvents as jest.Mock).mockResolvedValue([]);
    (repo.getBackgroundKnowledge as jest.Mock).mockResolvedValue([]);
    (repo.getBookMeta as jest.Mock).mockResolvedValue({ title: '탁류', author: '채만식' });
    (vectorSearch as jest.Mock).mockResolvedValue([]);
    (getConversationContext as jest.Mock).mockResolvedValue([]);
    (llmStream as jest.Mock).mockImplementation(async function* () {
      yield '정주사는 고무신 장사를 했어요 (p.10).';
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test.each([
    '아모가 뭐야?',
    '아모에 대해 알려줘',
    '아모야',
    '너 이름이 아모야?',
    '너 누구야',
    '너는 누구야?',
    '넌 누구야?',
    '당신은 누구세요?',
    '너 이름 뭐야?',
    '네 이름이 뭐야?',
    '너의 이름은 뭐야?',
    '이름은 뭐야 아모야?',
    '아모야, 이름이 뭐야?',
    '  너 누구야？！  ',
  ])('"%s" → 고정 멘트를 즉시 반환하고 근거 조립·검색·LLM 호출을 생략한다', async (query) => {
    const chunks: string[] = [];
    for await (const chunk of handleQuery(BOOK_ID, query, K, DEVICE_ID)) {
      chunks.push(chunk);
    }

    expect(chunks.join('')).toBe(AMO_INTRO_MESSAGE);
    expect(chunks.join('')).toContain('아모');
    expect(chunks.join('')).not.toMatch(/ChatGPT|지피티/iu);

    // 근거 조립·검색·LLM 전부 건드리지 않았어야 한다 (비용·지연 절약 + 결정론적 답변)
    expect(repo.findChapterSummaries).not.toHaveBeenCalled();
    expect(repo.getBookMeta).not.toHaveBeenCalled();
    expect(vectorSearch).not.toHaveBeenCalled();
    expect(llmStream).not.toHaveBeenCalled();
  });

  test.each([
    '정주사가 누구야?',
    '정주사의 이름은 뭐야?',
    '그 사람 이름은 뭐야?',
    '이름은 뭐야?',
    '아모야, 정주사는 누구야?',
    '너 누구야? 그리고 정주사는 누구야?',
    '이름은 뭐야 아모야? 그리고 정주사는 누구야?',
    '너 이름이 나오는 페이지는 어디야?',
  ])('"%s" — 작품 질문·복합 질문·대상 생략은 정상 답변 경로를 유지한다', async (query) => {
    const chunks: string[] = [];
    for await (const chunk of handleQuery(BOOK_ID, query, K, DEVICE_ID)) {
      chunks.push(chunk);
    }

    expect(chunks.join('')).toBe('정주사는 고무신 장사를 했어요 (p.10).');
    expect(chunks.join('')).not.toBe(AMO_INTRO_MESSAGE);
    expect(llmStream).toHaveBeenCalledTimes(1);
    expect(vectorSearch).toHaveBeenCalled();
  });

  test('화면의 연속 자기소개 질문은 같은 대화에 아모로 저장한다', async () => {
    (getConversationContext as jest.Mock).mockResolvedValue([
      { role: 'assistant', text: '저는 ChatGPT예요.' },
    ]);
    for (const query of ['너 누구야', '이름은 뭐야 아모야?']) {
      let answer = '';
      for await (const chunk of handleQuery(BOOK_ID, query, K, DEVICE_ID, 7)) answer += chunk;
      expect(answer).toBe(AMO_INTRO_MESSAGE);
      expect(recordTurns).toHaveBeenCalledWith(7, query, AMO_INTRO_MESSAGE, K);
    }
    expect(recordTurns).toHaveBeenCalledTimes(2);
    expect(llmStream).not.toHaveBeenCalled();
  });
});
