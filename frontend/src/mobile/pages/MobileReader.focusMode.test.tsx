import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import MobileReader from './MobileReader';
import { clearPendingJump, setPendingJump } from '../../utils/pendingJump';
import { SETTLE_MS } from '../gestures/useSwipePager';

const { enterBookMock, sendProgressMock, fetchPageSpy } = vi.hoisted(() => ({
  enterBookMock: vi.fn(),
  sendProgressMock: vi.fn(),
  fetchPageSpy: vi.fn(),
}));

vi.mock('../../services/progressService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/progressService')>();
  return { ...actual, enterBook: enterBookMock, sendProgress: sendProgressMock };
});

vi.mock('../../services/bookService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/bookService')>();
  fetchPageSpy.mockImplementation(actual.fetchPage);
  return { ...actual, fetchPage: fetchPageSpy };
});

vi.mock('../../hooks/useHeartbeat', () => ({ useHeartbeat: vi.fn() }));

function renderReader() {
  return render(
    <MemoryRouter initialEntries={['/books/takryu/read']}>
      <Routes>
        <Route path="/books/:bookId/read" element={<MobileReader />} />
        <Route path="/books/:bookId" element={<p>작품 페이지 자리</p>} />
      </Routes>
    </MemoryRouter>
  );
}

async function openedAt(page: number) {
  const input = await screen.findByLabelText<HTMLInputElement>('페이지로 이동');
  await waitFor(() => expect(input.value).toBe(String(page)));
  await waitFor(() => expect(screen.getByRole('article')).toHaveTextContent(`[${page}페이지]`));
  return input;
}

function pointer(
  el: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  x: number,
  y: number
) {
  fireEvent(
    el,
    new PointerEvent(type, {
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
    })
  );
}

function surface() {
  return screen.getByTestId('swipe-surface');
}

function tap(x = 200, y = 400) {
  pointer(surface(), 'pointerdown', x, y);
  pointer(surface(), 'pointerup', x, y);
}

async function wait(ms: number) {
  await act(() => new Promise((r) => setTimeout(r, ms)));
}

async function swipeLeft() {
  const el = surface();
  pointer(el, 'pointerdown', 800, 400);
  for (let x = 780; x >= 200; x -= 40) pointer(el, 'pointermove', x, 402);
  pointer(el, 'pointerup', 200, 402);
  await wait(SETTLE_MS + 80);
}

const CONTROLS = ['뒤로 가기', '보기 설정', '목차 열기', '싸비 열기', '이전 페이지', '다음 페이지'];

function expectControlsShown() {
  for (const name of CONTROLS) expect(screen.getByRole('button', { name })).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: '페이지로 이동' })).toBeInTheDocument();
  for (const el of document.querySelectorAll('[data-reader-chrome]')) {
    expect(el).not.toHaveAttribute('aria-hidden');
    expect(el).not.toHaveAttribute('inert');
  }
}

function expectControlsHidden() {
  expect(screen.queryAllByRole('button')).toHaveLength(0);
  expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  expect(screen.queryAllByRole('status')).toHaveLength(0);
  const chrome = document.querySelectorAll('[data-reader-chrome]');
  expect(chrome.length).toBeGreaterThan(0);
  for (const el of chrome) {
    expect(el).toHaveAttribute('aria-hidden', 'true');
    expect(el).toHaveAttribute('inert');
  }
}

describe('FR-PRG-001: 모바일 읽기 화면 한 번 탭 = 본문만', () => {
  beforeEach(() => {
    clearPendingJump();
    localStorage.clear();
    enterBookMock
      .mockReset()
      .mockResolvedValue({ route: 'reader', page: 25, is_new_session: false, session_epoch: 1 });
    sendProgressMock
      .mockReset()
      .mockImplementation((_bookId: string, page: number) => Promise.resolve(page));
    fetchPageSpy.mockClear();
  });

  test('책을 열면 조작 요소가 보이는 상태로 시작한다', async () => {
    renderReader();
    await openedAt(25);
    expectControlsShown();
  });

  test('본문을 한 번 탭하면 조작 요소가 0개 노출되고, 다시 탭하면 돌아온다', async () => {
    renderReader();
    await openedAt(25);
    tap();
    expectControlsHidden();
    tap();
    expectControlsShown();
  });

  test('목차에서 옮겨 와 돌아가기 줄이 있어도 탭하면 함께 숨는다', async () => {
    setPendingJump('takryu', 11);
    renderReader();
    await openedAt(11);
    expect(screen.getByRole('status')).toHaveTextContent('25쪽에서 옮겨 왔어요');
    tap();
    expectControlsHidden();
    tap();
    expect(screen.getByRole('status')).toHaveTextContent('25쪽에서 옮겨 왔어요');
  });

  test('좌우로 밀면 쪽만 넘어가고 숨김은 바뀌지 않는다', async () => {
    renderReader();
    await openedAt(25);
    await swipeLeft();
    await openedAt(26);
    expectControlsShown();
  });

  test('숨긴 채 밀면 쪽이 넘어가고 숨김이 유지된다', async () => {
    renderReader();
    await openedAt(25);
    tap();
    await swipeLeft();
    await waitFor(() => expect(sendProgressMock.mock.calls.map(([, p]) => p)).toEqual([25, 26]));
    await waitFor(() => expect(screen.getByRole('article')).toHaveTextContent('[26페이지]'));
    expectControlsHidden();
  });

  test('길게 누르면 숨김이 바뀌지 않는다', async () => {
    renderReader();
    await openedAt(25);
    pointer(surface(), 'pointerdown', 200, 400);
    await wait(450);
    pointer(surface(), 'pointerup', 200, 400);
    expectControlsShown();
  });

  test('문장이 선택된 상태에서 탭하면 선택만 풀리고 숨김은 바뀌지 않는다', async () => {
    renderReader();
    await openedAt(25);
    const range = document.createRange();
    range.selectNodeContents(screen.getByRole('article'));
    document.getSelection()!.addRange(range);
    tap();
    expectControlsShown();
    document.getSelection()!.removeAllRanges();
  });

  test('싸비 시트·목차·보기 설정이 열려 있으면 탭해도 숨김이 바뀌지 않는다', async () => {
    renderReader();
    await openedAt(25);
    fireEvent.click(screen.getByRole('button', { name: '목차 열기' }));
    tap();
    expect(screen.getByRole('button', { name: '목차 닫기' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '뒤로 가기' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '목차 닫기' }));

    fireEvent.click(screen.getByRole('button', { name: '보기 설정' }));
    tap();
    expect(screen.getByRole('dialog', { name: '보기 설정' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '보기 설정' })).toBeNull());
    expectControlsShown();

    fireEvent.click(screen.getAllByRole('button', { name: '싸비 열기' })[0]);
    expect(await screen.findByText('아모의 가이드북')).toBeInTheDocument();
    tap();
    expect(screen.getByRole('button', { name: '뒤로 가기' })).toBeInTheDocument();
  });

  test('숨김을 바꿔도 본문 영역의 배치와 안쪽 여백은 그대로다', async () => {
    renderReader();
    await openedAt(25);
    const body = surface();
    const article = screen.getByRole('article');
    const before = {
      surface: body.className,
      parent: body.parentElement!.className,
      padTop: article.style.paddingTop,
      padBottom: article.style.paddingBottom,
    };
    expect(before.padTop).not.toBe('');
    expect(before.padBottom).not.toBe('');
    tap();
    expectControlsHidden();
    const after = {
      surface: surface().className,
      parent: surface().parentElement!.className,
      padTop: screen.getByRole('article').style.paddingTop,
      padBottom: screen.getByRole('article').style.paddingBottom,
    };
    expect(after).toEqual(before);
  });

  test('책을 다시 열면 보이는 상태로 시작한다', async () => {
    const first = renderReader();
    await openedAt(25);
    tap();
    expectControlsHidden();
    first.unmount();
    renderReader();
    await openedAt(25);
    expectControlsShown();
  });
});
