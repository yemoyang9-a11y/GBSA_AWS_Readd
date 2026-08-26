/**
 * 본문 드래그 인용 → 챗봇 프롬프트 주입 테스트
 *
 * 신규 UX(2026-08-24, 사용자 이슈 제기): 읽기 화면에서 드래그로 고른 문장을 챗봇에
 * 질문하면, 그 문장은 K(기준점)로 자르는 근거 조립(assembleContext)·검색(vectorSearch)과
 * 무관한 별도 경로로 프롬프트에 들어가야 한다 — 이미 화면에 떠 있는(R3: 본문 접근
 * 무제한) 문장이기 때문이다. K 자체(FR-PRG-003 🚦, R1)는 이 기능으로 건드리지 않는다.
 */

import { handleQuery } from '../service';
import * as repo from '../repository';
import { vectorSearch } from '../vector-search';
import { stream as llmStream } from '../../llm-gateway/gateway';
import { getConversationContext } from '../conversation-service';

jest.mock('../repository');
jest.mock('../vector-search');
jest.mock('../conversation-service', () => ({
  getConversationContext: jest.fn(),
  recordTurns: jest.fn(),
}));
// 팩토리로 모킹한다 — 자동모킹은 실제 gateway.ts를 먼저 로드해야 해서, 그 파일의
// dotenv.config() 부작용으로 로컬 backend/.env의 MOCK_MODE=true가 process.env에 새어
// 들어가 service.ts가 실제 경로 대신 mock-data 경로를 타 버린다 (이 테스트가 검증하려는
// 실제 프롬프트 조립 자체를 우회하게 됨). 팩토리는 실제 모듈을 아예 로드하지 않는다.
jest.mock('../../llm-gateway/gateway', () => ({ stream: jest.fn() }));

describe('본문 드래그 인용 → 프롬프트 주입', () => {
  const BOOK_ID = 'takryu-vol1';
  const DEVICE_ID = 'device-123';
  const K = 80;
  const QUERY = '이게 무슨 뜻이야?';
  const QUOTE = '내가 벌써 이십 년 전에 십만 원 하나는 모았을 거야';

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
    (repo.getBookMeta as jest.Mock).mockResolvedValue({ title: '탁류', author: '채만식' });
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

  test('인용문이 있으면 프롬프트에 "본문 인용" 섹션으로 그대로 들어간다', async () => {
    for await (const _ of handleQuery(BOOK_ID, QUERY, K, DEVICE_ID, undefined, QUOTE)) {
      // 소비만 한다
    }

    expect(capturedPrompt).toContain('## ⚠️ 사용자가 지금 보고 있는 본문 인용');
    expect(capturedPrompt).toContain(QUOTE);
  });

  test('인용문이 없으면(일반 타이핑 질문) 인용 섹션 자체가 없다', async () => {
    for await (const _ of handleQuery(BOOK_ID, QUERY, K, DEVICE_ID)) {
      // 소비만 한다
    }

    expect(capturedPrompt).not.toContain('## ⚠️ 사용자가 지금 보고 있는 본문 인용');
  });

  test('인용문은 K로 자르는 근거 조립·검색 경로를 거치지 않는다 — vectorSearch에 인용문이 아닌 사용자 질의만 전달된다', async () => {
    for await (const _ of handleQuery(BOOK_ID, QUERY, K, DEVICE_ID, undefined, QUOTE)) {
      // 소비만 한다
    }

    expect(vectorSearch).toHaveBeenCalledWith(BOOK_ID, QUERY, K);
  });

  // 2026-08-26 사용자 제보: "선택된 문장이 바뀌면 이전에 선택됐던 문장 기준으로
  // 답하는 경우가 있다" — 대화가 이어지는 동안 인용문이 A→B로 바뀌면, "이전 대화"
  // 속 답변엔 옛 인용문 A 관련 내용이 남아 있다. 그게 "본문 인용"(새 인용문 B)보다
  // "사용자 질문"에 더 가까이 있으면 모델이 최신 인용 대신 그쪽으로 쏠린다. 새
  // 인용문이 이전 대화보다 질문에 더 가까운 자리(뒤)에 오는지로 이 순서를 고정한다.
  test('새 인용문 섹션은 "이전 대화"보다 뒤, "사용자 질문" 바로 앞에 온다 (순서 회귀)', async () => {
    (getConversationContext as jest.Mock).mockResolvedValue([
      { role: 'user', text: '이 문장 무슨 뜻이야?' },
      { role: 'assistant', text: '"내가 벌써 이십 년 전에..." 이 문장은 형보가 예전 얘기를 하는 장면이에요 (p.10).' },
    ]);

    const NEW_QUOTE = '이건 완전히 새로 선택한 다른 문장이다';

    for await (const _ of handleQuery(BOOK_ID, QUERY, K, DEVICE_ID, 1, NEW_QUOTE)) {
      // 소비만 한다
    }

    const priorTurnIdx = capturedPrompt.indexOf('## 이전 대화');
    const newQuoteIdx = capturedPrompt.indexOf(NEW_QUOTE);
    const questionIdx = capturedPrompt.indexOf('# 사용자 질문');

    expect(priorTurnIdx).toBeGreaterThan(-1);
    expect(newQuoteIdx).toBeGreaterThan(-1);
    expect(questionIdx).toBeGreaterThan(-1);
    expect(priorTurnIdx).toBeLessThan(newQuoteIdx);
    expect(newQuoteIdx).toBeLessThan(questionIdx);
  });
});
