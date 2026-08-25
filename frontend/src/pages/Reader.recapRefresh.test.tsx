import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Reader from './Reader';

/**
 * 리캡 자동 생성 제한 + 새로고침 버튼 (2026-08-25, 사용자 요청) — 이전에는 리캡 탭이
 * 열려 있는 동안 페이지를 넘길 때마다 LLM(스트리밍)이 다시 호출됐다. 이제 싸비를 새로
 * 열 때(또는 탭을 리캡으로 전환할 때)만 자동 생성하고, 이미 열려 있는 상태에서 페이지를
 * 옮긴 뒤에는 새로고침 버튼을 눌러야만 다시 생성된다. streamRecap이 mock 모드에서 부르는
 * mockStreamFrames 호출 횟수로 실제 생성 횟수를 센다.
 */
let streamCalls = 0;

vi.mock('../../mocks/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../mocks/server')>();
  return {
    ...actual,
    mockStreamFrames: (text: string) => {
      streamCalls += 1;
      return actual.mockStreamFrames(text);
    },
  };
});

function renderReader() {
  return render(
    <MemoryRouter initialEntries={['/books/takryu/read']}>
      <Routes>
        <Route path="/books/:bookId/read" element={<Reader />} />
      </Routes>
    </MemoryRouter>
  );
}

async function waitForRecapSettled() {
  await waitFor(() => expect(screen.queryByText('불러오는 중')).not.toBeInTheDocument());
}

describe('Reader — 리캡 자동 생성 제한 + 새로고침', () => {
  beforeEach(() => {
    streamCalls = 0;
  });

  it('리캡 탭을 열면 한 번 생성하고, 페이지를 옮겨도 다시 생성하지 않는다', async () => {
    const user = userEvent.setup();
    renderReader();

    await screen.findByRole('article');
    await user.click(screen.getByRole('button', { name: '싸비 열기' }));
    await user.click(screen.getByRole('tab', { name: '리캡' }));
    await waitFor(() => expect(streamCalls).toBe(1));
    await waitForRecapSettled();

    await user.click(screen.getByRole('button', { name: '다음 페이지' }));
    // 페이지 이동만으로는 다시 생성되지 않는다 — 잠깐 기다려도 호출 수가 그대로여야 한다
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(streamCalls).toBe(1);
  });

  it('새로고침 버튼을 누르면 옮긴 페이지 기준으로 다시 생성한다', async () => {
    const user = userEvent.setup();
    renderReader();

    await screen.findByRole('article');
    await user.click(screen.getByRole('button', { name: '싸비 열기' }));
    await user.click(screen.getByRole('tab', { name: '리캡' }));
    await waitFor(() => expect(streamCalls).toBe(1));
    await waitForRecapSettled();

    await user.click(screen.getByRole('button', { name: '다음 페이지' }));
    await user.click(screen.getByRole('button', { name: '리캡 새로고침' }));

    await waitFor(() => expect(streamCalls).toBe(2));
  });

  it('싸비를 닫았다 다시 열면 리캡 탭이 그대로 기억돼 있어도 다시 생성한다', async () => {
    const user = userEvent.setup();
    renderReader();

    await screen.findByRole('article');
    await user.click(screen.getByRole('button', { name: '싸비 열기' }));
    await user.click(screen.getByRole('tab', { name: '리캡' }));
    await waitFor(() => expect(streamCalls).toBe(1));
    await waitForRecapSettled();

    await user.click(screen.getByRole('button', { name: '싸비 닫기' }));
    // 480ms 슬라이드 애니메이션이 끝나야 SsabiPanel이 실제로 언마운트된다
    await new Promise((resolve) => setTimeout(resolve, 550));
    await user.click(screen.getByRole('button', { name: '싸비 열기' }));

    await waitFor(() => expect(streamCalls).toBe(2));
  }, 10000);
});
