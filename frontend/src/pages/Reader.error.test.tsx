import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Reader from './Reader';

/**
 * 진입 판정 실패 (critique P0) — 이전에는 `enterBook` 에 `.catch` 가 없어
 * 백엔드 장애 시 "불러오는 중"에서 영원히 멈췄다 (실측 확인, 2026-08-21 critique).
 * 첫 호출은 실패시키고, 재시도 버튼을 누르면 정상 진입해 복구되는지 확인한다.
 */
let entryCalls = 0;

vi.mock('../../mocks/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../mocks/server')>();
  return {
    ...actual,
    mockEntry: () => {
      entryCalls += 1;
      if (entryCalls === 1) throw new Error('mock entry failure');
      return actual.mockEntry();
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

describe('Reader — 진입 판정 실패', () => {
  beforeEach(() => {
    entryCalls = 0;
  });

  it('진입 판정이 실패하면 무한 로딩 대신 에러+재시도를 보여주고, 재시도하면 복구된다', async () => {
    renderReader();

    expect(await screen.findByRole('alert')).toHaveTextContent('읽기를 시작하지 못했습니다');

    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));

    expect(await screen.findByRole('article')).toBeInTheDocument();
  });
});
