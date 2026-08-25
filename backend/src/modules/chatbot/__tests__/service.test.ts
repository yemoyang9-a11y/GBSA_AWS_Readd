/**
 * 챗봇 서비스 테스트
 *
 * FR-QNA-004 🚦: 근거 부재 시 항상 같은 문구
 * FR-QNA-006 🚦: 전체 플로우에서 K 필터 유지
 */

import { handleQuery, NO_EVIDENCE_MESSAGE } from '../service';
import * as repo from '../repository';
import { vectorSearch } from '../vector-search';
import { stream as llmStream } from '../../llm-gateway/gateway';

jest.mock('../repository');
jest.mock('../vector-search');
// 팩토리로 모킹한다 — 자동모킹은 실제 gateway.ts를 로드해 dotenv 부작용으로 로컬 .env의
// MOCK_MODE=true가 새어 들어간다(no-evidence-streaming.test.ts와 같은 이유).
jest.mock('../../llm-gateway/gateway', () => ({ stream: jest.fn() }));

describe('챗봇 서비스 - FR-QNA-004 🚦', () => {
  describe('근거 부재 처리', () => {
    test('FR-QNA-004: NO_EVIDENCE_MESSAGE는 고정된 문구', () => {
      // 메시지가 정확히 명세된 문구인지 확인
      expect(NO_EVIDENCE_MESSAGE).toBe(
        '🔒 그건 아직 안 읽은 뒷부분 얘기라 말 못 해줘요 🤔 스포 없이 여기까지만 도와줄게요.'
      );
    });

    describe('FR-QNA-004: 근거 부재 판정 이유는 구별하지 않음', () => {
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

      test('근거 데이터가 두툼해도(엔티티·요약·검색결과 존재) 모델이 근거 부재 토큰을 반환하면 고정 문구만 나간다 (스포일러 질문 시나리오)', async () => {
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
        (vectorSearch as jest.Mock).mockResolvedValue([
          { page_no: 12, content: '정주사 관련 서술', distance: 0.1 },
        ]);
        (llmStream as jest.Mock).mockImplementation(async function* () {
          yield '[NO_EVIDENCE]';
        });

        const chunks: string[] = [];
        for await (const chunk of handleQuery(BOOK_ID, '결말이 어떻게 되나', K, DEVICE_ID)) {
          chunks.push(chunk);
        }

        expect(chunks.join('')).toBe(NO_EVIDENCE_MESSAGE);
      });

      test('근거 데이터가 전무해도(빈 컨텍스트·빈 검색결과) 고정 문구만 나간다 (오프토픽 질문 시나리오) — 위 시나리오와 바이트 단위로 동일한 출력', async () => {
        (repo.findChapterSummaries as jest.Mock).mockResolvedValue([]);
        (repo.getCurrentChapterText as jest.Mock).mockResolvedValue('');
        (repo.findCharacters as jest.Mock).mockResolvedValue([]);
        (repo.findRelationships as jest.Mock).mockResolvedValue([]);
        (repo.findCharacterNotes as jest.Mock).mockResolvedValue([]);
        (repo.findTerms as jest.Mock).mockResolvedValue([]);
        (repo.findEvents as jest.Mock).mockResolvedValue([]);
        (repo.getBackgroundKnowledge as jest.Mock).mockResolvedValue([]);
        (vectorSearch as jest.Mock).mockResolvedValue([]);
        (llmStream as jest.Mock).mockImplementation(async function* () {
          yield '[NO_EVIDENCE]';
        });

        const chunks: string[] = [];
        for await (const chunk of handleQuery(BOOK_ID, '오늘 날씨 어때', K, DEVICE_ID)) {
          chunks.push(chunk);
        }

        expect(chunks.join('')).toBe(NO_EVIDENCE_MESSAGE);
      });

      test('positive 짝 — 근거가 있으면 고정 문구가 아니라 실제 답변이 그대로 나간다', async () => {
        (repo.findChapterSummaries as jest.Mock).mockResolvedValue([]);
        (repo.getCurrentChapterText as jest.Mock).mockResolvedValue('');
        (repo.findCharacters as jest.Mock).mockResolvedValue([{ id: 'char-1', name: '정주사' }]);
        (repo.findRelationships as jest.Mock).mockResolvedValue([]);
        (repo.findCharacterNotes as jest.Mock).mockResolvedValue([]);
        (repo.findTerms as jest.Mock).mockResolvedValue([]);
        (repo.findEvents as jest.Mock).mockResolvedValue([]);
        (repo.getBackgroundKnowledge as jest.Mock).mockResolvedValue([]);
        (vectorSearch as jest.Mock).mockResolvedValue([]);
        (llmStream as jest.Mock).mockImplementation(async function* () {
          yield '정주사는 고무신 장사로 돈을 모았어요 (p.10).';
        });

        const chunks: string[] = [];
        for await (const chunk of handleQuery(BOOK_ID, '정주사는 뭐 하는 사람이야', K, DEVICE_ID)) {
          chunks.push(chunk);
        }

        const output = chunks.join('');
        expect(output).not.toBe(NO_EVIDENCE_MESSAGE);
        expect(output).toBe('정주사는 고무신 장사로 돈을 모았어요 (p.10).');
      });
    });
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
