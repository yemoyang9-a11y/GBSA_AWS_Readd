import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Reader from './Reader';

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});

afterAll(() => vi.unstubAllGlobals());

function renderReader() {
  return render(
    <MemoryRouter initialEntries={['/books/takryu/read']}>
      <Routes>
        <Route path="/books/:bookId/read" element={<Reader />} />
      </Routes>
    </MemoryRouter>
  );
}

function selectArticleText() {
  const article = screen.getByRole('article');
  const textNode = Array.from(article.childNodes).find(
    (node) => node.nodeType === Node.TEXT_NODE && node.textContent!.trim().length >= 4
  );
  if (!textNode) throw new Error('본문 선택에 사용할 텍스트를 찾지 못했습니다.');
  const range = document.createRange();
  range.setStart(textNode, 0);
  range.setEnd(textNode, 4);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  fireEvent(document, new Event('selectionchange'));
  fireEvent.mouseUp(document);
}

describe('Reader 선택 문장 페이지 전환', () => {
  it('다음 페이지로 이동하면 이전 페이지에서 선택한 문장 카드와 본문 강조를 지운다', async () => {
    const user = userEvent.setup();
    renderReader();

    await screen.findByRole('article');
    selectArticleText();
    await user.click(await screen.findByRole('button', { name: '아모에게 물어보기' }));

    expect(await screen.findByText('선택한 문장')).toBeInTheDocument();
    expect(document.querySelector('mark')).not.toBeNull();

    await user.click(screen.getByRole('button', { name: '다음 페이지' }));

    await waitFor(() => expect(screen.queryByText('선택한 문장')).not.toBeInTheDocument());
    expect(document.querySelector('mark')).toBeNull();
  });
});
