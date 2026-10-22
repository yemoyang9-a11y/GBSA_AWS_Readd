import { act, renderHook } from '@testing-library/react';
import { useSSE } from './useSSE';
import type { SseFrame } from '../types';

it('clears K90 recap immediately on K40 and ignores remaining old frames', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  async function* stream(): AsyncGenerator<SseFrame> {
    yield { type: 'delta', text: 'future recap' };
    await gate;
    yield { type: 'delta', text: ' late leak' };
    yield { type: 'done', applied_cutoff: 90 };
  }
  const { result, rerender } = renderHook((page) => useSSE(page), { initialProps: 90 });
  let pending!: Promise<void>;
  await act(async () => {
    pending = result.current.consume(stream());
  });
  expect(result.current.text).toBe('future recap');
  rerender(40);
  expect(result.current.text).toBe('');
  expect(result.current.streaming).toBe(false);
  await act(async () => {
    release();
    await pending;
  });
  expect(result.current.text).toBe('');
  expect(result.current.appliedCutoff).toBeNull();
});

it('reset invalidates an active stream and consumes network rejection as an error', async () => {
  const { result } = renderHook(() => useSSE());
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  async function* old(): AsyncGenerator<SseFrame> {
    yield { type: 'delta', text: 'old' };
    await gate;
    throw new Error('stale network failure');
  }
  let pending!: Promise<void>;
  await act(async () => {
    pending = result.current.consume(old());
  });
  act(() => result.current.reset());
  await act(async () => {
    release();
    await pending;
  });
  expect(result.current.text).toBe('');
  expect(result.current.error).toBeNull();
  expect(result.current.streaming).toBe(false);
  async function* broken(): AsyncGenerator<SseFrame> {
    throw new Error('network failure');
  }
  await act(async () => {
    await expect(result.current.consume(broken())).resolves.toBeUndefined();
  });
  expect(result.current.error).toBeTruthy();
});
