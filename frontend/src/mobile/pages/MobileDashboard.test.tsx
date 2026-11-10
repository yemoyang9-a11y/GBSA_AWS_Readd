import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import MobileDashboard from './MobileDashboard';
import type { BookSummary } from '../../types';

const reading: BookSummary = {
  book_id: 'takryu', title: '탁류', author: '채만식', cover_url: '',
  intro_summary: null, ssabi_ready: true, progress: { current_page: 72, percent: 25.3 },
};

vi.mock('../../services/bookService', () => ({
  fetchCatalog: async () => ({ books: [reading] }),
  fetchBookInfo: async () => ({
    basic_info: { title: '탁류', author: '채만식', published_year: 1937, length_note: '' },
    introduction: '',
    background: '',
    chapters: [{ chapter_no: 1, title: '1장', start_page: 1, end_page: 285 }],
  }),
}));
vi.mock('../../services/progressService', () => ({
  enterBook: async () => ({ route: 'briefing', page: 1, is_new_session: true, session_epoch: 1 }),
}));

describe('MobileDashboard 의견 남기기', () => {
  it('버튼은 서재 내용의 맨 끝에 있고 누르면 시트가 열린다', async () => {
    render(<MemoryRouter><MobileDashboard /></MemoryRouter>);
    await screen.findByRole('heading', { level: 2, name: '탁류' });

    const button = screen.getByRole('button', { name: '의견 남기기' });
    expect(screen.getByRole('main').lastElementChild).toContainElement(button);

    await userEvent.click(button);

    expect(screen.getByRole('dialog', { name: '의견 남기기' })).toBeInTheDocument();
  });
});
