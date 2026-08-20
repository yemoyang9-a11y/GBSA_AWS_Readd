import { renderHook, waitFor } from '@testing-library/react';
import { useSsabiData } from './useSsabiData';
import type { GraphResponse } from '../types';

function graph(nodeNames: string[]): GraphResponse {
  return {
    nodes: nodeNames.map((name, i) => ({
      id: `c${i}`,
      name,
      first_appearance_page: 1,
      aliases: [],
    })),
    edges: [],
  };
}

/**
 * 싸비 탭 데이터 (FR-SVB-003)
 *
 * 서버 조회는 주입받는다 — 네트워크를 흉내 내는 대신 호출 자체를 관찰한다.
 * 응답은 이미 K 이하로 걸러져 오므로 훅은 초과 여부를 판별하지 않는다 (절대 규칙 7번).
 */
describe('싸비 탭 데이터', () => {
  it('관계도 탭이 열리면 관계도를 조회한다', async () => {
    const fetchGraph = vi.fn().mockResolvedValue(graph(['정주사']));

    const { result } = renderHook(() =>
      useSsabiData({ bookId: 'takryu', tab: 'relationship', currentPage: 21, fetchGraph })
    );

    await waitFor(() => expect(result.current.graph).toEqual(graph(['정주사'])));
    // (page, seq) 를 반드시 동봉한다 — 페이지를 넘긴 직후 재조회가 최신 K 를 보게 한다 (§4.3)
    expect(fetchGraph).toHaveBeenCalledWith('takryu', 21, expect.any(Number));
  });

  it('FR-SVB-003: 페이지가 바뀌면 열려 있는 탭을 다시 조회한다', async () => {
    const fetchGraph = vi.fn().mockResolvedValue(graph(['정주사']));
    const { rerender } = renderHook((page: number) =>
      useSsabiData({ bookId: 'takryu', tab: 'relationship', currentPage: page, fetchGraph })
    , { initialProps: 21 });

    await waitFor(() => expect(fetchGraph).toHaveBeenCalledTimes(1));

    rerender(22);

    await waitFor(() => expect(fetchGraph).toHaveBeenCalledTimes(2));
  });

  it('같은 페이지로 다시 그려지면 재조회하지 않는다', async () => {
    const fetchGraph = vi.fn().mockResolvedValue(graph(['정주사']));
    const { rerender } = renderHook((page: number) =>
      useSsabiData({ bookId: 'takryu', tab: 'relationship', currentPage: page, fetchGraph })
    , { initialProps: 21 });

    await waitFor(() => expect(fetchGraph).toHaveBeenCalledTimes(1));

    rerender(21);

    expect(fetchGraph).toHaveBeenCalledTimes(1);
  });

  it('관계도 탭이 아니면 관계도를 조회하지 않는다 — 열린 탭만 재조회한다', async () => {
    const fetchGraph = vi.fn().mockResolvedValue(graph([]));

    renderHook(() =>
      useSsabiData({ bookId: 'takryu', tab: 'chatbot', currentPage: 21, fetchGraph })
    );

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(fetchGraph).not.toHaveBeenCalled();
  });

  it('조회가 실패하면 데이터를 비우고 실패를 알린다 — 옛 데이터를 남기지 않는다', async () => {
    const fetchGraph = vi
      .fn()
      .mockResolvedValueOnce(graph(['정주사']))
      .mockRejectedValueOnce(new Error('boom'));

    const { rerender, result } = renderHook((page: number) =>
      useSsabiData({ bookId: 'takryu', tab: 'relationship', currentPage: page, fetchGraph })
    , { initialProps: 21 });

    await waitFor(() => expect(result.current.graph).not.toBeNull());

    rerender(22);

    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.graph).toBeNull();
  });
});
