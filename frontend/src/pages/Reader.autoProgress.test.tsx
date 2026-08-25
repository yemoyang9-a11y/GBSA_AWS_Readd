import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Reader from './Reader';

const { sendProgressMock } = vi.hoisted(() => ({ sendProgressMock: vi.fn().mockResolvedValue(21) }));

vi.mock('../services/progressService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/progressService')>();
  return { ...actual, sendProgress: sendProgressMock };
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

describe('Reader 자동 현재 페이지 동기화', () => {
  beforeEach(() => sendProgressMock.mockClear());

  it('진입과 다음 페이지 이동마다 현재 페이지를 자동으로 서버에 반영한다', async () => {
    const user = userEvent.setup();
    renderReader();

    await screen.findByRole('article');
    await waitFor(() => expect(sendProgressMock).toHaveBeenCalledWith('takryu', 21));

    await user.click(screen.getByRole('button', { name: '다음 페이지' }));
    await waitFor(() => expect(sendProgressMock).toHaveBeenCalledWith('takryu', 22));
  });
});
