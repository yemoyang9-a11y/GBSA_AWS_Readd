import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Reader from './Reader';

/**
 * 싸비 패널 탭 기억 (2026-08-24, 사용자 요청) — 챗봇을 보다가 패널을 닫고 다시 열면
 * 항상 인물 관계도로 리셋되던 것을, 마지막으로 보던 탭을 이어서 보여주도록 바꿨다.
 * SsabiPanel.test.tsx가 seed(initialTab/initialTabEpoch)를 받았을 때의 동작을 단위로
 * 검증하고, 이 테스트는 Reader가 실제로 닫기→언마운트→재마운트 전 구간에 걸쳐 그 값을
 * 올바르게 들고 있다가 넘겨주는지를 real close-animation(480ms)까지 통과시켜 확인한다.
 */
function renderReader() {
  return render(
    <MemoryRouter initialEntries={['/books/takryu/read']}>
      <Routes>
        <Route path="/books/:bookId/read" element={<Reader />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Reader — 싸비 패널 탭 기억', () => {
  it('챗봇 탭을 보다가 닫고 다시 열면 챗봇 탭을 이어서 보여준다', async () => {
    const user = userEvent.setup();
    renderReader();

    await screen.findByRole('article');

    await user.click(screen.getByRole('button', { name: '싸비 열기' }));
    await user.click(screen.getByRole('tab', { name: '챗봇' }));
    expect(screen.getByRole('tab', { name: '챗봇' })).toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByRole('button', { name: '싸비 닫기' }));
    // 480ms 슬라이드 애니메이션이 끝나야 SsabiPanel이 실제로 언마운트된다
    // (usePanelOpenTransition) — 재마운트 시 상태가 정말 사라졌다 되살아나는지 보려면
    // 이 구간을 실제로 통과시켜야 한다.
    await new Promise((resolve) => setTimeout(resolve, 550));

    await user.click(screen.getByRole('button', { name: '싸비 열기' }));
    expect(screen.getByRole('tab', { name: '챗봇' })).toHaveAttribute('aria-selected', 'true');
  }, 10000);
});
