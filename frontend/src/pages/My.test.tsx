import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import My from './My';
import { useAuth } from '../hooks/useAuth';

vi.mock('../hooks/useAuth', () => ({ useAuth: vi.fn() }));

const KEY = 'readd.readerPrefs';

describe('MY', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(useAuth).mockReturnValue({
      status: 'guest',
      displayName: null,
      login: vi.fn(),
      logout: vi.fn(),
      withdraw: vi.fn(),
    });
  });

  test('제목 MY와 계정 카드가 보인다', () => {
    render(<My />);
    expect(screen.getByRole('heading', { level: 1, name: 'MY' })).toBeInTheDocument();
    expect(screen.getByText('로그인하지 않은 상태예요')).toBeInTheDocument();
  });

  test('글자 크게를 누르면 값 표시가 바뀌고 localStorage에 저장된다', async () => {
    render(<My />);
    expect(screen.getByText('18px')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '글자 크게' }));
    expect(screen.getByText('20px')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(KEY)!).fontSize).toBe(20);
  });

  test('배경을 고르면 저장된다', async () => {
    render(<My />);
    await userEvent.click(screen.getByRole('radio', { name: '세피아' }));
    expect(screen.getByRole('radio', { name: '세피아' })).toHaveAttribute('aria-checked', 'true');
    expect(JSON.parse(localStorage.getItem(KEY)!).theme).toBe('sepia');
  });

  test('의견 남기기가 보인다', () => {
    render(<My />);
    expect(screen.getByRole('button', { name: '의견 남기기' })).toBeInTheDocument();
  });

  test('공지와 이용약관 줄은 없다', () => {
    render(<My />);
    expect(screen.queryByText(/공지|이용약관/)).toBeNull();
  });
});
