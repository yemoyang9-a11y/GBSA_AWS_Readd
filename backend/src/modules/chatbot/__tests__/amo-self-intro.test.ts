/**
 * "아모"(챗봇 캐릭터 이름) 자기소개 질문 — 고정 멘트
 *
 * "아모가 뭐야", "아모에 대해 알려줘"처럼 챗봇 자신의 정체를 묻는 질문은 소설 근거와
 * 무관하다. 기존 SYSTEM_RULES 6번(챗봇 동작 방식 질문 → [NO_EVIDENCE])에 걸리면
 * "🔒 그건 아직 안 읽은 뒷부분 얘기라 말 못 해줘요"라는, 스포일러 질문에나 맞는 문구가
 * 나가 사용자가 혼란스럽다 — "네 이름이 뭐야"는 스포일러 질문이 아니다.
 * LLM 판단에 맡기지 않고 코드에서 고정 멘트로 즉시 답한다(근거 조립·검색·LLM 호출
 * 전부 생략 — difficulty-router.ts와 같은 키워드 매칭 스타일).
 */

import { handleQuery, AMO_INTRO_MESSAGE } from '../service';
import * as repo from '../repository';
import { vectorSearch } from '../vector-search';
import { stream as llmStream } from '../../llm-gateway/gateway';

jest.mock('../repository');
jest.mock('../vector-search');
// 팩토리로 모킹한다 — 자동모킹은 실제 gateway.ts를 로드해 dotenv 부작용으로 로컬 .env의
// MOCK_MODE=true가 새어 들어간다(no-evidence-streaming.test.ts와 같은 이유).
jest.mock('../../llm-gateway/gateway', () => ({ stream: jest.fn() }));

describe('아모 자기소개 — 고정 멘트', () => {
  const BOOK_ID = 'takryu-vol1';
  const DEVICE_ID = 'device-123';
  const K = 80;

  beforeEach(() => {
    process.env.MOCK_MODE = 'false';
    jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test.each(['아모가 뭐야?', '아모에 대해 알려줘', '아모야', '너 이름이 아모야?'])(
    '"%s" → 고정 멘트를 즉시 반환하고 근거 조립·검색·LLM 호출을 생략한다',
    async (query) => {
      const chunks: string[] = [];
      for await (const chunk of handleQuery(BOOK_ID, query, K, DEVICE_ID)) {
        chunks.push(chunk);
      }

      expect(chunks.join('')).toBe(AMO_INTRO_MESSAGE);

      // 근거 조립·검색·LLM 전부 건드리지 않았어야 한다 (비용·지연 절약 + 결정론적 답변)
      expect(repo.findChapterSummaries).not.toHaveBeenCalled();
      expect(repo.getBookMeta).not.toHaveBeenCalled();
      expect(vectorSearch).not.toHaveBeenCalled();
      expect(llmStream).not.toHaveBeenCalled();
    }
  );

  test('negative 짝 — "아모"가 없는 일반 질문은 고정 멘트를 타지 않고 정상 LLM 경로로 간다', async () => {
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
    (llmStream as jest.Mock).mockImplementation(async function* () {
      yield '정주사는 고무신 장사를 했어요 (p.10).';
    });

    const chunks: string[] = [];
    for await (const chunk of handleQuery(BOOK_ID, '정주사가 누구야?', K, DEVICE_ID)) {
      chunks.push(chunk);
    }

    expect(chunks.join('')).toBe('정주사는 고무신 장사를 했어요 (p.10).');
    expect(chunks.join('')).not.toBe(AMO_INTRO_MESSAGE);
    expect(llmStream).toHaveBeenCalled();
  });
});
