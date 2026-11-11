import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AccountCard from './AccountCard';
import { useAuth } from '../../hooks/useAuth';

vi.mock('../../hooks/useAuth', () => ({ useAuth: vi.fn() }));

const login = vi.fn();
const logout = vi.fn();
const withdraw = vi.fn();

function auth(status: 'guest' | 'member' | 'loading', displayName: string | null = null) {
  vi.mocked(useAuth).mockReturnValue({ status, displayName, login, logout, withdraw });
}

describe('AccountCard', () => {
  beforeEach(() => {
    login.mockReset();
    logout.mockReset();
    withdraw.mockReset().mockResolvedValue(undefined);
  });

  test('로그인 전에는 안내와 구글·카카오 버튼 두 개를 보여 준다', () => {
    auth('guest');
    render(<AccountCard />);
    expect(screen.getByText('로그인하지 않은 상태예요')).toBeInTheDocument();
    expect(
      screen.getByText('지금 읽은 기록은 이 기기에만 남아요. 로그인하면 다른 기기에서도 이어 읽을 수 있어요.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '구글로 로그인' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '카카오로 로그인' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '로그아웃' })).toBeNull();
  });

  test("구글로 로그인을 누르면 login('google')을 한 번 부른다", async () => {
    auth('guest');
    render(<AccountCard />);
    await userEvent.click(screen.getByRole('button', { name: '구글로 로그인' }));
    expect(login).toHaveBeenCalledTimes(1);
    expect(login).toHaveBeenCalledWith('google');
  });

  test("카카오로 로그인을 누르면 login('kakao')를 한 번 부른다", async () => {
    auth('guest');
    render(<AccountCard />);
    await userEvent.click(screen.getByRole('button', { name: '카카오로 로그인' }));
    expect(login).toHaveBeenCalledTimes(1);
    expect(login).toHaveBeenCalledWith('kakao');
  });

  test('이메일·비밀번호 입력 칸이 없다', () => {
    auth('guest');
    const { container } = render(<AccountCard />);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(container.querySelector('input')).toBeNull();
  });

  test('확인 중(loading)에는 로그인 버튼을 보여 주지 않는다', () => {
    auth('loading');
    const { container } = render(<AccountCard />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  test('로그인 뒤에는 표시 이름과 로그아웃·탈퇴를 보여 준다', () => {
    auth('member', '시험 독자');
    render(<AccountCard />);
    expect(screen.getByText('시험 독자님')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '탈퇴' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '구글로 로그인' })).toBeNull();
  });

  test('표시 이름이 없으면 로그인한 상태예요를 보여 준다', () => {
    auth('member', null);
    render(<AccountCard />);
    expect(screen.getByText('로그인한 상태예요')).toBeInTheDocument();
  });

  test('로그아웃을 누르면 logout을 부른다', async () => {
    auth('member', '시험 독자');
    render(<AccountCard />);
    await userEvent.click(screen.getByRole('button', { name: '로그아웃' }));
    expect(logout).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  test('탈퇴를 누르면 확인 창이 뜨고, 그때까지 withdraw는 0회다', async () => {
    auth('member', '시험 독자');
    render(<AccountCard />);
    await userEvent.click(screen.getByRole('button', { name: '탈퇴' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('탈퇴하면 계정과 독서 기록이 함께 삭제되고 되돌릴 수 없습니다.');
    expect(withdraw).not.toHaveBeenCalled();
  });

  test('확인 창에서 취소하면 withdraw를 부르지 않는다', async () => {
    auth('member', '시험 독자');
    render(<AccountCard />);
    await userEvent.click(screen.getByRole('button', { name: '탈퇴' }));
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '취소' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(withdraw).not.toHaveBeenCalled();
  });

  test('확인 창에서 탈퇴를 누르면 withdraw를 한 번 부른다', async () => {
    auth('member', '시험 독자');
    render(<AccountCard />);
    await userEvent.click(screen.getByRole('button', { name: '탈퇴' }));
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '탈퇴' }));
    expect(withdraw).toHaveBeenCalledTimes(1);
  });

  test('탈퇴가 진행 중이면 확인 창의 두 버튼이 비활성이다', async () => {
    auth('member', '시험 독자');
    withdraw.mockReturnValue(new Promise(() => {}));
    render(<AccountCard />);
    await userEvent.click(screen.getByRole('button', { name: '탈퇴' }));
    const dialog = screen.getByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: '탈퇴' }));
    expect(within(dialog).getByRole('button', { name: /탈퇴/ })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: '취소' })).toBeDisabled();
  });

  test('FR-SPL-005: 탈퇴가 실패하면 안내를 보여 주고 로그인 상태를 유지한다', async () => {
    auth('member', '시험 독자');
    withdraw.mockRejectedValue(new Error('down'));
    render(<AccountCard />);
    await userEvent.click(screen.getByRole('button', { name: '탈퇴' }));
    const dialog = screen.getByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: '탈퇴' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('탈퇴하지 못했습니다. 다시 시도해 주세요.');
    expect(within(dialog).getByRole('button', { name: '탈퇴' })).toBeEnabled();
    expect(screen.getByText('시험 독자님')).toBeInTheDocument();
    expect(logout).not.toHaveBeenCalled();
  });
});
