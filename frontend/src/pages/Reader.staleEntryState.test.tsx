import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Reader from './Reader';

/**
 * 2026-08-26 사용자 제보 — "30페이지에서 F5를 누르면 25페이지로 되돌아간다".
 *
 * 원인: 진입 판정 결과(EntryResponse)를 `navigate(..., { state: { entry } })`로 넘기는데,
 * React Router v6는 이 값을 `window.history.state`에 싣고 브라우저는 그것을 새로고침
 * 후에도 복원한다. 그래서 F5를 하면 "읽기 화면에 처음 들어왔을 때의 page"가 되살아나
 * 화면이 그 페이지로 되돌아가고, 곧이어 진도 이벤트가 서버의 올바른 위치까지 덮어썼다.
 *
 * 실제 콘솔 확인값 (25페이지로 되돌아간 상태):
 *   window.history.state.usr.entry
 *   → {route: 'briefing', page: 25, is_new_session: true, session_epoch: 24}
 *
 * 규칙: 어디까지 읽었는지의 원천은 서버가 저장한 진도 하나뿐이다. 화면에 실려 온
 * 진입 판정 결과는 그 원천이 될 수 없다 — 언제 만들어진 값인지 알 수 없기 때문이다.
 */

const STALE_ENTRY = {
  route: 'briefing' as const,
  page: 25,
  is_new_session: true,
  session_epoch: 24,
};

/** mock 서버가 저장하고 있는 실제 위치 (mocks/server.ts 의 currentPage 초기값) */
const SERVER_PAGE = '21';

function renderReaderWithStaleState() {
  return render(
    <MemoryRouter
      initialEntries={[{ pathname: '/books/takryu/read', state: { entry: STALE_ENTRY } }]}
    >
      <Routes>
        <Route path="/books/:bookId/read" element={<Reader />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Reader — 새로고침으로 되살아난 낡은 진입 상태', () => {
  it('낡은 entry.page 가 아니라 서버가 저장한 위치를 보여준다', async () => {
    renderReaderWithStaleState();

    const pageInput = await screen.findByLabelText<HTMLInputElement>('페이지로 이동');

    await waitFor(() => expect(pageInput.value).toBe(SERVER_PAGE));
    expect(pageInput.value).not.toBe(String(STALE_ENTRY.page));
  });

  it('낡은 entry.page 를 진도로 되돌려 보내지 않는다 — 서버 위치가 그대로 유지된다', async () => {
    renderReaderWithStaleState();

    await screen.findByLabelText('페이지로 이동');

    // 진도 이벤트가 25로 나갔다면 mock 서버의 저장 위치가 25로 덮어써진다.
    const { mockEntry } = await import('../../mocks/server');
    await waitFor(() => expect(mockEntry().page).toBe(Number(SERVER_PAGE)));
  });
});
