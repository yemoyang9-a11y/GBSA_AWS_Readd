/**
 * 근거 부재 토큰이 스트리밍 청크 경계에서 잘리는 경우 — FR-QNA-004 🚦
 *
 * 실사용 중 발견(2026-08-24): "[NO_EVIDENCE"까지가 한 청크, "]"가 다음 청크로 나뉘어
 * 오면, 완성 판정 전에 앞 조각이 그대로 클라이언트로 새어 나가 화면에
 * "[NO_EVIDENCE현재까지 읽은..." 처럼 깨진 토큰이 답변 앞에 붙었다.
 * 내부 토큰은 청크 분할 여부와 무관하게 사용자에게 노출하지 않는다.
 * 토큰이 발생하면 추가 모델 호출이나 고정 거절문 없이 오류를 반환한다.
 */

import { handleQuery } from '../service';
import * as repo from '../repository';
import { vectorSearch } from '../vector-search';
import { stream as llmStream } from '../../llm-gateway/gateway';

jest.mock('../repository');
jest.mock('../vector-search');
// 팩토리로 모킹한다 — 자동모킹은 실제 gateway.ts를 로드해 dotenv 부작용으로 로컬 .env의
// MOCK_MODE=true가 새어 들어간다(quote-context.test.ts와 같은 이유).
jest.mock('../../llm-gateway/gateway', () => ({ stream: jest.fn() }));

describe('근거 부재 토큰의 청크 분할 (FR-QNA-004 🚦)', () => {
  const BOOK_ID = 'takryu-vol1';
  const DEVICE_ID = 'device-123';
  const K = 80;
  const QUERY = '결말이 어떻게 되나';

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

    jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('토큰이 두 청크로 쪼개져도("[NO_EVIDENC" + "E]") 깨진 조각이 새지 않는다', async () => {
    (llmStream as jest.Mock).mockImplementation(async function* () {
      yield '[NO_EVIDENC';
      yield 'E]';
    });

    const chunks: string[] = [];
    const consume = async (): Promise<void> => {
      for await (const chunk of handleQuery(BOOK_ID, QUERY, K, DEVICE_ID)) {
        chunks.push(chunk);
      }
    };

    await expect(consume()).rejects.toThrow('CHATBOT_INTERNAL_TOKEN');
    expect(chunks).toEqual([]);
    expect(llmStream).toHaveBeenCalledTimes(1);
  });

  test('토큰이 한 글자씩 쪼개져도 깨진 조각이 새지 않는다', async () => {
    (llmStream as jest.Mock).mockImplementation(async function* () {
      for (const ch of '[NO_EVIDENCE]') yield ch;
    });

    const chunks: string[] = [];
    const consume = async (): Promise<void> => {
      for await (const chunk of handleQuery(BOOK_ID, QUERY, K, DEVICE_ID)) {
        chunks.push(chunk);
      }
    };

    await expect(consume()).rejects.toThrow('CHATBOT_INTERNAL_TOKEN');
    expect(chunks).toEqual([]);
    expect(llmStream).toHaveBeenCalledTimes(1);
  });

  test('이미 전송한 문장 뒤의 내부 토큰은 숨기고 추가 호출 없이 오류를 반환한다', async () => {
    (llmStream as jest.Mock).mockImplementation(async function* () {
      yield '확인해 볼게요. [NO_EVIDENC';
      yield 'E]';
    });
    const chunks: string[] = [];
    const consume = async () => {
      for await (const chunk of handleQuery(BOOK_ID, QUERY, K, DEVICE_ID)) chunks.push(chunk);
    };
    await expect(consume()).rejects.toThrow('CHATBOT_INTERNAL_TOKEN');
    expect(chunks).toEqual(['확인해 볼게요. ']);
    expect(llmStream).toHaveBeenCalledTimes(1);
  });

  test('정상 답변 중간에 토큰과 비슷하지만 다른 텍스트("[NO_한강]")가 있어도 그대로 통과한다', async () => {
    (llmStream as jest.Mock).mockImplementation(async function* () {
      yield '정주사는 ';
      yield '[NO_한강]';
      yield ' 근처에 삽니다 (p.10).';
    });

    const chunks: string[] = [];
    for await (const chunk of handleQuery(BOOK_ID, QUERY, K, DEVICE_ID)) {
      chunks.push(chunk);
    }

    expect(chunks.join('')).toBe('정주사는 [NO_한강] 근처에 삽니다 (p.10).');
  });

  test('정상 답변 끝에 토큰 접두사와 겹치는 글자로 끝나도 마지막 조각이 누락되지 않는다', async () => {
    (llmStream as jest.Mock).mockImplementation(async function* () {
      yield '요약 끝 [';
    });

    const chunks: string[] = [];
    for await (const chunk of handleQuery(BOOK_ID, QUERY, K, DEVICE_ID)) {
      chunks.push(chunk);
    }

    expect(chunks.join('')).toBe('요약 끝 [');
  });
});
