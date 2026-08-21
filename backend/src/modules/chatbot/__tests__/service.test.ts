/**
 * 챗봇 서비스 테스트
 *
 * FR-QNA-004 🚦: 근거 부재 시 항상 같은 문구
 * FR-QNA-006 🚦: 전체 플로우에서 K 필터 유지
 */

import { NO_EVIDENCE_MESSAGE } from '../service';

describe('챗봇 서비스 - FR-QNA-004 🚦', () => {
  describe('근거 부재 처리', () => {
    test('FR-QNA-004: NO_EVIDENCE_MESSAGE는 고정된 문구', () => {
      // 메시지가 정확히 명세된 문구인지 확인
      expect(NO_EVIDENCE_MESSAGE).toBe(
        '현재까지 읽은 페이지 기준으로 알 수 없는 내용입니다. 다른 질문 해주세요.'
      );
    });

    test('FR-QNA-004: 근거 부재 판정 이유는 구별하지 않음', () => {
      // 근거 부재의 이유 (벡터 검색 0건, 엔티티 없음 등)와 무관하게
      // 항상 같은 토큰 반환
      // TODO: Mock으로 다양한 근거 부재 시나리오 테스트
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
