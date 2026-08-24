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
