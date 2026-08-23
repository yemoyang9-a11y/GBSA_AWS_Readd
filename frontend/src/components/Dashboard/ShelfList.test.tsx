import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ShelfList from './ShelfList';
import type { BookSummary } from '../../types';

const takryu: BookSummary = {
  book_id: 'takryu', title: '탁류', author: '채만식', cover_url: '',
  intro_summary: null, ssabi_ready: true, progress: { current_page: 72, percent: 25.3 },
};
const demian: BookSummary = {
  book_id: 'demian', title: '데미안', author: '헤르만 헤세', cover_url: '',
  intro_summary: null, ssabi_ready: true, progress: { current_page: 184, percent: 61.8 },
};

describe('ShelfList', () => {
  it('책이 1권이면 아무것도 렌더하지 않는다', () => {
    const { container } = render(
      <ShelfList
        books={[takryu]}
        visibleBooks={[takryu]}
        selectedId="takryu"
        onPreview={() => {}}
        filter="all"
        onFilterChange={() => {}}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('책이 2권 이상이면 개수·필터·행을 렌더한다', async () => {
    const onPreview = vi.fn();
    render(
      <ShelfList
        books={[takryu, demian]}
        visibleBooks={[takryu, demian]}
        selectedId="takryu"
        onPreview={onPreview}
        filter="all"
        onFilterChange={() => {}}
      />
    );

    expect(screen.getByText('내 서재')).toBeInTheDocument();
    expect(screen.getByText('(2)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '전체' })).toBeInTheDocument();

    const row = screen.getByRole('button', { name: /데미안 선택/ });
    await userEvent.click(row);
    expect(onPreview).toHaveBeenCalledWith(demian);
  });

  it('선택된 행에 selected 클래스가 붙는다', () => {
    render(
      <ShelfList
        books={[takryu, demian]}
        visibleBooks={[takryu, demian]}
        selectedId="demian"
        onPreview={() => {}}
        filter="all"
        onFilterChange={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: /데미안 선택/ }).className).toContain('selected');
    expect(screen.getByRole('button', { name: /탁류 선택/ }).className).not.toContain('selected');
  });

  it('빈 목록 문구를 전달받으면 보여준다', () => {
    render(
      <ShelfList
        books={[takryu, demian]}
        visibleBooks={[]}
        selectedId="takryu"
        onPreview={() => {}}
        filter="done"
        onFilterChange={() => {}}
        emptyMessage="완독 여부를 판정할 데이터가 아직 없습니다"
      />
    );
    expect(screen.getByText('완독 여부를 판정할 데이터가 아직 없습니다')).toBeInTheDocument();
  });
});
