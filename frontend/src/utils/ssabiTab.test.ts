import { resolveSsabiTab } from './ssabiTab';

/**
 * 싸비 탭 상태 (FR-SVB-002·004)
 *   - 최초 열기 기본 탭은 인물 관계도
 *   - 세션 내에서는 마지막 탭 유지, 새 세션이면 기본 탭으로 초기화
 *   - 세션 경계는 서버가 준 session_epoch 의 "변화"로만 판정한다.
 *     클라이언트가 30분 규칙 같은 걸 직접 계산하지 않는다 (절대 규칙 8번, 자가 검증 17번).
 */
describe('싸비 탭 상태 결정', () => {
  it('FR-SVB-002: 최초 진입에서는 인물 관계도가 기본 탭이다', () => {
    expect(resolveSsabiTab({ previousEpoch: null, currentEpoch: 7, lastTab: null })).toBe(
      'relationship'
    );
  });

  it('FR-SVB-004: 같은 세션이면(epoch 동일) 마지막으로 보던 탭을 유지한다', () => {
    expect(resolveSsabiTab({ previousEpoch: 7, currentEpoch: 7, lastTab: 'chatbot' })).toBe(
      'chatbot'
    );
  });

  it('FR-SVB-004: epoch 이 바뀌면 새 세션이므로 기본 탭으로 초기화한다', () => {
    expect(resolveSsabiTab({ previousEpoch: 7, currentEpoch: 8, lastTab: 'chatbot' })).toBe(
      'relationship'
    );
  });

  it('같은 세션이어도 아직 고른 탭이 없으면 기본 탭이다', () => {
    expect(resolveSsabiTab({ previousEpoch: 7, currentEpoch: 7, lastTab: null })).toBe(
      'relationship'
    );
  });

  it('epoch 이 뒤로 가더라도 "달라졌다"는 사실만으로 초기화한다 — 크기를 비교해 판정하지 않는다', () => {
    expect(resolveSsabiTab({ previousEpoch: 9, currentEpoch: 3, lastTab: 'recap' })).toBe(
      'relationship'
    );
  });
});
