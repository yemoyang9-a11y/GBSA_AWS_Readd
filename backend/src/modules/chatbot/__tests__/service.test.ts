/**
 * 챗봇 서비스 테스트
 *
 * 근거 부재에도 질문에 맞는 답변을 사용하고 내부 토큰은 노출하지 않는다.
 * FR-QNA-006 🚦: 전체 플로우에서 K 필터 유지
 */

import { handleQuery } from '../service';
import * as repo from '../repository';
import { vectorSearch } from '../vector-search';
import { stream as llmStream } from '../../llm-gateway/gateway';

jest.mock('../repository');
jest.mock('../vector-search');
// 팩토리로 모킹한다 — 자동모킹은 실제 gateway.ts를 로드해 dotenv 부작용으로 로컬 .env의
// MOCK_MODE=true가 새어 들어간다(no-evidence-streaming.test.ts와 같은 이유).
jest.mock('../../llm-gateway/gateway', () => ({ stream: jest.fn() }));

describe('챗봇 서비스 - 내부 근거 부재 토큰 처리', () => {
  describe('근거 부재 처리', () => {
    describe('컨텍스트 양에 관계없이 내부 토큰은 답변으로 사용하지 않음', () => {
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

      test('근거 데이터가 두툼해도 내부 토큰은 오류로 처리하고 재생성하지 않는다', async () => {
        (repo.findChapterSummaries as jest.Mock).mockResolvedValue([
          { title: '1장', end_page: 40 },
        ]);
        (repo.getCurrentChapterText as jest.Mock).mockResolvedValue('정주사는 고무신 장사를...');
        (repo.findCharacters as jest.Mock).mockResolvedValue([{ id: 'char-1', name: '정주사' }]);
        (repo.findRelationships as jest.Mock).mockResolvedValue([]);
        (repo.findCharacterNotes as jest.Mock).mockResolvedValue([]);
        (repo.findTerms as jest.Mock).mockResolvedValue([]);
        (repo.findEvents as jest.Mock).mockResolvedValue([]);
        (repo.getBackgroundKnowledge as jest.Mock).mockResolvedValue([]);
        (repo.getBookMeta as jest.Mock).mockResolvedValue({ title: '탁류', author: '채만식' });
        (vectorSearch as jest.Mock).mockResolvedValue([
          { page_no: 12, content: '정주사 관련 서술', distance: 0.1 },
        ]);
        (llmStream as jest.Mock).mockImplementation(async function* () {
          yield '[NO_EVIDENCE]';
        });

        const chunks: string[] = [];
        const consume = async (): Promise<void> => {
          for await (const chunk of handleQuery(BOOK_ID, '결말이 어떻게 되나', K, DEVICE_ID)) {
            chunks.push(chunk);
          }
        };

        await expect(consume()).rejects.toThrow('CHATBOT_INTERNAL_TOKEN');
        expect(chunks).toEqual([]);
        expect(llmStream).toHaveBeenCalledTimes(1);
      });

      test('근거 데이터가 전무해도 내부 토큰을 고정 거절문으로 대체하거나 재생성하지 않는다', async () => {
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
          yield '[NO_EVIDENCE]';
        });

        const chunks: string[] = [];
        const consume = async (): Promise<void> => {
          for await (const chunk of handleQuery(BOOK_ID, '오늘 날씨 어때', K, DEVICE_ID)) {
            chunks.push(chunk);
          }
        };

        await expect(consume()).rejects.toThrow('CHATBOT_INTERNAL_TOKEN');
        expect(chunks).toEqual([]);
        expect(llmStream).toHaveBeenCalledTimes(1);
      });

      test('positive 짝 — 근거가 있으면 생성한 실제 답변이 그대로 나간다', async () => {
        (repo.findChapterSummaries as jest.Mock).mockResolvedValue([]);
        (repo.getCurrentChapterText as jest.Mock).mockResolvedValue('');
        (repo.findCharacters as jest.Mock).mockResolvedValue([{ id: 'char-1', name: '정주사' }]);
        (repo.findRelationships as jest.Mock).mockResolvedValue([]);
        (repo.findCharacterNotes as jest.Mock).mockResolvedValue([]);
        (repo.findTerms as jest.Mock).mockResolvedValue([]);
        (repo.findEvents as jest.Mock).mockResolvedValue([]);
        (repo.getBackgroundKnowledge as jest.Mock).mockResolvedValue([]);
        (repo.getBookMeta as jest.Mock).mockResolvedValue({ title: '탁류', author: '채만식' });
        (vectorSearch as jest.Mock).mockResolvedValue([]);
        (llmStream as jest.Mock).mockImplementation(async function* () {
          yield '정주사는 고무신 장사로 돈을 모았어요 (p.10).';
        });

        const chunks: string[] = [];
        for await (const chunk of handleQuery(BOOK_ID, '정주사는 뭐 하는 사람이야', K, DEVICE_ID)) {
          chunks.push(chunk);
        }

        const output = chunks.join('');
        expect(output).toBe('정주사는 고무신 장사로 돈을 모았어요 (p.10).');
      });
    });
  });
});

describe('완독 상태에서도 근거 범위와 검색 불확실성 유지', () => {
  const BOOK_ID = 'takryu-vol1';
  const DEVICE_ID = 'device-123';
  const K = 130; // 마지막 페이지까지 읽음 (완독)

  function seedThinContext(): void {
    // 근거에 없는 대상을 묻는 시나리오 — 엔티티/요약/검색결과 모두 비어 있음
    (repo.findChapterSummaries as jest.Mock).mockResolvedValue([{ title: '1장', end_page: 40 }]);
    (repo.getCurrentChapterText as jest.Mock).mockResolvedValue('본문...');
    (repo.findCharacters as jest.Mock).mockResolvedValue([]);
    (repo.findRelationships as jest.Mock).mockResolvedValue([]);
    (repo.findCharacterNotes as jest.Mock).mockResolvedValue([]);
    (repo.findTerms as jest.Mock).mockResolvedValue([]);
    (repo.findEvents as jest.Mock).mockResolvedValue([]);
    (repo.getBackgroundKnowledge as jest.Mock).mockResolvedValue([]);
    (repo.getBookMeta as jest.Mock).mockResolvedValue({ title: '탁류', author: '채만식' });
    (vectorSearch as jest.Mock).mockResolvedValue([]);
  }

  beforeEach(() => {
    process.env.MOCK_MODE = 'false';
    jest.spyOn(console, 'log').mockImplementation();
    seedThinContext();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('FR-QNA-004 🚦: 완독(isComplete=true)이면 프롬프트에 완독 태도 지시가 실린다', async () => {
    (llmStream as jest.Mock).mockImplementation(async function* () {
      yield '제공된 자료에서는 그 일을 확인하지 못했어요.';
    });

    const chunks: string[] = [];
    for await (const chunk of handleQuery(
      BOOK_ID,
      '승재랑 계봉이 결혼해?',
      K,
      DEVICE_ID,
      undefined,
      undefined,
      undefined,
      true
    )) {
      chunks.push(chunk);
    }

    const prompt = (llmStream as jest.Mock).mock.calls[0][1] as string;
    expect(prompt).toContain('독자 상태: 완독');
  });

  test('완독 상태에서 검색 누락을 작품 전체 부재로 단정하지 않도록 지시한다 (mock 정책 검증)', async () => {
    (llmStream as jest.Mock).mockImplementation(async function* () {
      yield '제공된 자료에서는 그 일을 확인하지 못했어요.';
    });

    const chunks: string[] = [];
    for await (const chunk of handleQuery(
      BOOK_ID,
      '승재랑 계봉이 결혼해?',
      K,
      DEVICE_ID,
      undefined,
      undefined,
      undefined,
      true
    )) {
      chunks.push(chunk);
    }

    const output = chunks.join('');
    expect(output).toBe('제공된 자료에서는 그 일을 확인하지 못했어요.');
    const prompt = (llmStream as jest.Mock).mock.calls[0][1] as string;
    expect(prompt).toContain('검색 결과가 없다는 사실은 작품 전체에 없다는 증거가 아닙니다');
    expect(prompt).not.toContain('그건 이 책에 나오지 않아요');
  });

  test('FR-QNA-004 🚦: 완독이 아니면(isComplete=false) 같은 질문·같은 빈 근거에 완독 태도 지시가 실리지 않는다', async () => {
    // 완독 태도 지시는 is_complete=true에서만 들어간다.
    (llmStream as jest.Mock).mockImplementation(async function* () {
      yield '제공된 자료에서는 그 일을 확인하지 못했어요.';
    });

    const chunks: string[] = [];
    for await (const chunk of handleQuery(BOOK_ID, '승재랑 계봉이 결혼해?', 40, DEVICE_ID)) {
      chunks.push(chunk);
    }

    const prompt = (llmStream as jest.Mock).mock.calls[0][1] as string;
    expect(prompt).not.toContain('독자 상태: 완독');
    expect(chunks.join('')).toBe('제공된 자료에서는 그 일을 확인하지 못했어요.');
  });

  test('완독이어도 내부 토큰은 고정 거절문이나 재생성 없이 오류를 반환한다', async () => {
    (llmStream as jest.Mock).mockImplementation(async function* () {
      yield '[NO_EVIDENCE]';
    });

    const chunks: string[] = [];
    const consume = async (): Promise<void> => {
      for await (const chunk of handleQuery(
        BOOK_ID,
        '오늘 날씨 어때',
        K,
        DEVICE_ID,
        undefined,
        undefined,
        undefined,
        true
      )) {
        chunks.push(chunk);
      }
    };

    await expect(consume()).rejects.toThrow('CHATBOT_INTERNAL_TOKEN');
    expect(chunks).toEqual([]);
    expect(llmStream).toHaveBeenCalledTimes(1);
  });
});

describe('챗봇 전체 플로우 - FR-QNA-006 🚦', () => {
  test('FR-QNA-006: handleQuery는 K를 모든 단계에 전파', async () => {
    // TODO: Mock repository 추가 후 구현
    // const K = 80;
    // // 1. 근거 조립 시 K 사용
    // // 2. 벡터 검색 시 K 사용
    // // 3. 프롬프트 구성 (K 초과 데이터 없음)
    //
    // // Mock으로 각 단계가 올바른 K를 받았는지 검증
  });

  test('FR-QNA-006: 스트리밍 중 K 고정 (변경 없음)', async () => {
    // UC-27 A5: 질의 시점 고정
    // TODO: Mock으로 스트리밍 중 K가 변하지 않는지 검증
  });
});

describe('Rate Limiting - NFR-AI-017', () => {
  test('NFR-AI-017: 디바이스·도서당 분당 3회 제한', () => {
    // TODO: rate-limiter mock으로 테스트
    // 같은 deviceId + bookId로 4번째 요청 시 차단
  });
});

describe('모델 선택 로깅', () => {
  test('선택된 모델은 로그에 기록됨', async () => {
    // TODO: 로그 mock으로 검증
    // console.log에 선택된 모델 (sonnet/haiku)이 찍히는지
  });
});

describe('진도 이벤트 동봉', () => {
  test('page와 seq가 제공되면 updateProgress 호출', async () => {
    // TODO: R2 연동 후 테스트
    // updateProgress가 올바른 인자로 호출되는지
  });
});
