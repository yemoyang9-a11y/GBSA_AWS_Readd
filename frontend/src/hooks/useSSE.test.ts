import { act, renderHook } from '@testing-library/react';
import { useSSE } from './useSSE';
import type { SseFrame } from '../types';

async function* frames(...items: SseFrame[]): AsyncGenerator<SseFrame> {
  for (const item of items) yield item;
}

/**
 * useSSE 의 appliedCutoff (critique P1: 패널에 "몇 페이지까지 확인했는지" 상시 표시).
 *
 * 이 값은 프론트가 계산하지 않고 done 프레임이 실어 온 값을 그대로 기억한다(절대 규칙 2번).
 */
describe('useSSE — appliedCutoff', () => {
  it('done 프레임의 applied_cutoff 를 기억한다', async () => {
    const { result } = renderHook(() => useSSE());

    await act(async () => {
      await result.current.consume(
        frames({ type: 'delta', text: '안녕' }, { type: 'done', applied_cutoff: 79 })
      );
    });

    expect(result.current.appliedCutoff).toBe(79);
  });

  it('다음 요청이 실패해도 이전에 확인된 기준점을 지우지 않는다 — 배지가 사라지지 않는다', async () => {
    const { result } = renderHook(() => useSSE());

    await act(async () => {
      await result.current.consume(frames({ type: 'done', applied_cutoff: 79 }));
    });
    expect(result.current.appliedCutoff).toBe(79);

    await act(async () => {
      await result.current.consume(frames({ type: 'error', message: '실패' }));
    });

    expect(result.current.error).toBe('실패');
    expect(result.current.appliedCutoff).toBe(79);
  });

  it('applied_cutoff 가 없는 done(챗봇 미확정 필드)이면 이전 값을 유지한다', async () => {
    const { result } = renderHook(() => useSSE());

    await act(async () => {
      await result.current.consume(frames({ type: 'done', applied_cutoff: 79 }));
    });

    await act(async () => {
      await result.current.consume(frames({ type: 'delta', text: '답변' }, { type: 'done' }));
    });

    expect(result.current.appliedCutoff).toBe(79);
  });

  it('resetAppliedCutoff는 확인된 기준점만 지운다 — 다음 확인 전까지 배지를 안 보여준다', async () => {
    const { result } = renderHook(() => useSSE());

    await act(async () => {
      await result.current.consume(frames({ type: 'delta', text: '안녕' }, { type: 'done', applied_cutoff: 79 }));
    });
    expect(result.current.appliedCutoff).toBe(79);

    act(() => {
      result.current.resetAppliedCutoff();
    });

    expect(result.current.appliedCutoff).toBeNull();
    // 스트리밍 중이던 답변 텍스트는 페이지 이동과 무관하게 유지된다 (UC-27 A5)
    expect(result.current.text).toBe('안녕');
  });
});

/**
 * 리캡 생성 도중 페이지를 넘기면 Reader가 새 consume()을 호출한다(FR-SVB-003). 이전 호출의
 * for-await가 아직 안 끝난 채로 겹치면, 두 스트림의 delta가 같은 text state에 번갈아
 * 쌓여 서로 다른 기준점의 문장이 뒤섞여 보였다(사용자 스크린샷 재현, 2026-08-24).
 */
describe('useSSE — 겹치는 consume() 호출', () => {
  it('이전 스트림이 끝나기 전에 새 스트림이 시작되면 두 텍스트가 섞이지 않고 최신 스트림만 보인다', async () => {
    const { result } = renderHook(() => useSSE());

    let releaseStale: () => void = () => {};
    const staleGate = new Promise<void>((resolve) => {
      releaseStale = resolve;
    });

    async function* staleFrames(): AsyncGenerator<SseFrame> {
      yield { type: 'delta', text: '가 미두 손실장에' };
      await staleGate; // 새 consume()이 시작될 때까지 여기서 붙잡아 둔다 — 실제로는 네트워크 대기
      yield { type: 'delta', text: '-옛 페이지의 나머지 조각' };
      yield { type: 'done', applied_cutoff: 40 };
    }

    async function* freshFrames(): AsyncGenerator<SseFrame> {
      yield { type: 'delta', text: '개복동 언덕에 위치한 좁은 토담집에서' };
      yield { type: 'done', applied_cutoff: 104 };
    }

    let staleSettled = false;
    let stalePromise!: Promise<void>;
    // stale 호출이 첫 delta를 반영할 때까지 한 틱 양보한다
    await act(async () => {
      stalePromise = result.current.consume(staleFrames()).then(() => {
        staleSettled = true;
      });
      await Promise.resolve();
    });
    expect(result.current.text).toBe('가 미두 손실장에');

    let freshPromise!: Promise<void>;
    await act(async () => {
      freshPromise = result.current.consume(freshFrames());
      await freshPromise;
    });

    // 새 스트림 완료 후에도 낡은 스트림은 여전히 staleGate에 막혀 살아있다 —
    // 백엔드 생성/캐싱을 방해하지 않기 위해 강제 취소하지 않는다는 뜻이다.
    expect(staleSettled).toBe(false);
    expect(result.current.text).toBe('개복동 언덕에 위치한 좁은 토담집에서');
    expect(result.current.appliedCutoff).toBe(104);

    await act(async () => {
      releaseStale();
      await stalePromise;
    });

    // 낡은 스트림이 뒤늦게 마저 도착해도 이미 최신 텍스트로 덮인 화면에는 더 이상 섞이지 않는다
    expect(result.current.text).toBe('개복동 언덕에 위치한 좁은 토담집에서');
    expect(result.current.appliedCutoff).toBe(104);
  });
});
