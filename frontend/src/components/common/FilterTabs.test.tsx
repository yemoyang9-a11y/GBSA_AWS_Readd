import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FilterTabs from './FilterTabs';

const TABS = [
  { id: 'reading', label: '읽는 중' },
  { id: 'done', label: '완독' },
  { id: 'all', label: '전체' },
] as const;

describe('FilterTabs', () => {
  it('탭을 전부 렌더하고 활성 탭을 aria-pressed 로 표시한다', () => {
    render(<FilterTabs tabs={[...TABS]} active="reading" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: '읽는 중' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '완독' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: '전체' })).toBeInTheDocument();
  });

  it('탭을 누르면 그 id 로 onChange 가 호출된다', async () => {
    const onChange = vi.fn();
    render(<FilterTabs tabs={[...TABS]} active="reading" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: '전체' }));
    expect(onChange).toHaveBeenCalledWith('all');
  });
});
