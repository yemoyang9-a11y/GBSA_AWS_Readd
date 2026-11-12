import { fireEvent, render, screen, within } from '@testing-library/react';
import ChapterList from './ChapterList';
import type { ChapterSummary } from '../../types';

const chapters: ChapterSummary[] = [
  { chapter_no: 1, title: '첫째 장', start_page: 1, end_page: 10 },
  { chapter_no: 2, title: '둘째 장', start_page: 11, end_page: 20 },
  { chapter_no: 3, title: '셋째 장', start_page: 21, end_page: 30 },
];

const position = { applied_cutoff: 15, current_chapter_no: 2, read_chapter_nos: [1], is_complete: false };

function row(title: string) {
  return screen.getByRole('button', { name: new RegExp(title) });
}

test('FR-NAV-001: 모든 장이 시작 쪽과 함께 보이고 현재 장 한 곳에만 aria-current가 있다', () => {
  render(<ChapterList chapters={chapters} position={position} onSelect={() => {}} />);
  const list = screen.getByRole('list', { name: '목차' });
  expect(within(list).getAllByRole('button')).toHaveLength(3);
  expect(row('첫째 장')).toHaveTextContent('1p');
  expect(row('셋째 장')).toHaveTextContent('21p');
  expect(within(list).getAllByRole('button').filter((b) => b.hasAttribute('aria-current'))).toEqual([row('둘째 장')]);
  expect(row('둘째 장')).toHaveAttribute('aria-current', 'true');
});

test('FR-SPL-002: 읽음 표시는 read_chapter_nos 장에만, 읽는 중은 현재 장에만 있다', () => {
  render(<ChapterList chapters={chapters} position={position} onSelect={() => {}} />);
  expect(within(row('첫째 장')).getByText('읽음')).toBeInTheDocument();
  expect(within(row('둘째 장')).queryByText('읽음')).toBeNull();
  expect(within(row('셋째 장')).queryByText('읽음')).toBeNull();
  expect(within(row('둘째 장')).getByText('읽는 중')).toBeInTheDocument();
  expect(screen.getAllByText('읽는 중')).toHaveLength(1);
});

test('FR-NAV-001: 장을 누르면 그 장으로 onSelect가 한 번 불린다', () => {
  const onSelect = vi.fn();
  render(<ChapterList chapters={chapters} position={position} onSelect={onSelect} />);
  fireEvent.click(row('셋째 장'));
  expect(onSelect).toHaveBeenCalledTimes(1);
  expect(onSelect).toHaveBeenCalledWith(chapters[2]);
});

test('FR-ADM-005: disabled면 모든 장이 비활성이고 눌러도 onSelect가 0건이다', () => {
  const onSelect = vi.fn();
  render(<ChapterList chapters={chapters} position={position} disabled onSelect={onSelect} />);
  for (const button of screen.getAllByRole('button')) {
    expect(button).toBeDisabled();
    fireEvent.click(button);
  }
  expect(onSelect).not.toHaveBeenCalled();
});

test('진도가 없으면 aria-current·읽음·읽는 중이 0건이다', () => {
  render(<ChapterList chapters={chapters} position={null} onSelect={() => {}} />);
  expect(screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-current'))).toHaveLength(0);
  expect(screen.queryByText('읽음')).toBeNull();
  expect(screen.queryByText('읽는 중')).toBeNull();
});

test('NFR-USE: hover 때 살짝 이동하는 효과는 움직임 줄이기 설정에서 꺼지고, 비활성 줄에는 hover 효과가 없다', () => {
  render(<ChapterList chapters={chapters} position={position} onSelect={() => {}} />);
  const moving = row('셋째 장').className.split(/\s+/).filter((c) => c.includes('translate'));
  expect(moving.length).toBeGreaterThan(0);
  for (const c of moving) expect(c.startsWith('motion-safe:')).toBe(true);
  for (const c of row('셋째 장').className.split(/\s+/).filter((c) => c.includes('hover:'))) {
    expect(c.includes('enabled:')).toBe(true);
  }
});
