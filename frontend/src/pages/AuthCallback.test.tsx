import { StrictMode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AuthCallback from './AuthCallback';
import { exchangeLoginCode, submitConsent } from '../services/authService';
import { enterBook } from '../services/progressService';
import { saveLoginReturn } from '../utils/loginReturn';
import { getAuthToken } from '../utils/storage';
import { createAppRouter } from '../App';

vi.mock('../services/authService', () => ({ exchangeLoginCode: vi.fn(), submitConsent: vi.fn() }));
vi.mock('../services/progressService', () => ({ enterBook: vi.fn() }));

function renderCallback(strict = false) {
  const tree = (
    <MemoryRouter initialEntries={['/auth/callback']}>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/my" element={<div>MY 화면</div>} />
        <Route path="/books/:bookId" element={<div>작품 화면</div>} />
        <Route path="/books/:bookId/briefing" element={<div>브리핑 화면</div>} />
        <Route path="/books/:bookId/read" element={<div>읽기 화면</div>} />
      </Routes>
    </MemoryRouter>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

describe('AuthCallback', () => {
  beforeEach(() => {
    vi.mocked(exchangeLoginCode).mockReset();
    vi.mocked(submitConsent).mockReset();
    vi.mocked(enterBook).mockReset();
    localStorage.clear();
    sessionStorage.clear();
    window.location.hash = '';
  });

  it('1회용 코드를 교환해 토큰을 저장하고 MY로 보낸다', async () => {
    window.location.hash = '#code=one-time';
    vi.mocked(exchangeLoginCode).mockResolvedValue({ token: 'jwt', display_name: '독자' });

    renderCallback();

    expect(await screen.findByText('MY 화면')).toBeInTheDocument();
    expect(exchangeLoginCode).toHaveBeenCalledWith('one-time');
    expect(getAuthToken()).toBe('jwt');
  });

  it('StrictMode에서도 1회용 코드를 한 번만 교환한다', async () => {
    window.location.hash = '#code=one-time';
    vi.mocked(exchangeLoginCode).mockResolvedValue({ token: 'jwt', display_name: '독자' });

    renderCallback(true);

    expect(await screen.findByText('MY 화면')).toBeInTheDocument();
    expect(exchangeLoginCode).toHaveBeenCalledTimes(1);
  });

  it('제공자 화면에서 취소하고 돌아오면 오류 화면이 아니라 MY로 돌아와 로그인 전 상태를 유지한다', async () => {
    window.location.hash = '#error=cancelled';

    renderCallback();

    expect(await screen.findByText('MY 화면')).toBeInTheDocument();
    expect(exchangeLoginCode).not.toHaveBeenCalled();
    expect(getAuthToken()).toBeNull();
  });

  it('코드 교환이 실패해도 MY로 돌아와 로그인 전 상태를 유지한다', async () => {
    window.location.hash = '#code=expired';
    vi.mocked(exchangeLoginCode).mockRejectedValue(new Error('invalid code'));

    renderCallback();

    expect(await screen.findByText('MY 화면')).toBeInTheDocument();
    await waitFor(() => expect(getAuthToken()).toBeNull());
  });

  it('/auth/callback 경로가 앱 라우터에 등록돼 있다', () => {
    expect(createAppRouter(false).routes.some((r) => r.path === '/auth/callback')).toBe(true);
    expect(createAppRouter(true).routes.some((r) => r.path === '/auth/callback')).toBe(true);
  });

  describe('로그인 후 열려던 책으로 돌아오기', () => {
    it('동의가 필요 없으면 열려던 책에 진입해 서버가 정한 화면으로 간다', async () => {
      window.location.hash = '#code=one-time';
      saveLoginReturn('takryu');
      vi.mocked(exchangeLoginCode).mockResolvedValue({
        token: 'jwt',
        display_name: '독자',
        consent_required: false,
      });
      vi.mocked(enterBook).mockResolvedValue({
        route: 'briefing',
        page: 21,
        is_new_session: true,
        session_epoch: 2,
      });

      renderCallback();

      expect(await screen.findByText('브리핑 화면')).toBeInTheDocument();
      expect(enterBook).toHaveBeenCalledWith('takryu');
    });

    it('진입 요청이 실패하면 열려던 책의 작품 화면으로 간다', async () => {
      window.location.hash = '#code=one-time';
      saveLoginReturn('takryu');
      vi.mocked(exchangeLoginCode).mockResolvedValue({
        token: 'jwt',
        display_name: null,
        consent_required: false,
      });
      vi.mocked(enterBook).mockRejectedValue(new Error('down'));

      renderCallback();

      expect(await screen.findByText('작품 화면')).toBeInTheDocument();
    });

    it('제공자 화면에서 취소하면 열려던 책의 작품 화면으로 돌아간다', async () => {
      window.location.hash = '#error=cancelled';
      saveLoginReturn('takryu');

      renderCallback();

      expect(await screen.findByText('작품 화면')).toBeInTheDocument();
      expect(enterBook).not.toHaveBeenCalled();
    });
  });

  describe('첫 가입 동의', () => {
    async function openConsent() {
      window.location.hash = '#code=one-time';
      saveLoginReturn('takryu');
      vi.mocked(exchangeLoginCode).mockResolvedValue({
        token: 'jwt',
        display_name: '독자',
        consent_required: true,
      });
      vi.mocked(enterBook).mockResolvedValue({
        route: 'reader',
        page: 21,
        is_new_session: false,
        session_epoch: 2,
      });
      renderCallback();
      return screen.findByRole('form', { name: '가입 동의' });
    }

    function required(name: RegExp) {
      return screen.getByRole('checkbox', { name });
    }

    it('처음 가입한 계정에는 동의 화면을 보여 주고 아직 진입하지 않는다', async () => {
      await openConsent();

      expect(required(/\[필수\] 이용약관/)).not.toBeChecked();
      expect(required(/\[필수\] 개인정보 수집·이용/)).not.toBeChecked();
      expect(required(/\[필수\] 만 14세 이상입니다/)).not.toBeChecked();
      expect(screen.getByText('초안 — 검토 전')).toBeInTheDocument();
      expect(enterBook).not.toHaveBeenCalled();
    });

    it('필수 항목이 하나라도 빠지면 진행할 수 없다', async () => {
      await openConsent();
      const proceed = screen.getByRole('button', { name: '동의하고 시작하기' });

      await userEvent.click(required(/\[필수\] 이용약관/));
      await userEvent.click(required(/\[필수\] 개인정보 수집·이용/));
      expect(proceed).toBeDisabled();

      await userEvent.click(proceed);
      expect(submitConsent).not.toHaveBeenCalled();
    });

    it('전체 동의는 필수 셋을 한 번에 체크하고, 하나를 풀면 전체 동의도 풀린다', async () => {
      await openConsent();
      const all = screen.getByRole('checkbox', { name: '전체 동의' });

      await userEvent.click(all);
      expect(required(/\[필수\] 이용약관/)).toBeChecked();
      expect(required(/\[필수\] 개인정보 수집·이용/)).toBeChecked();
      expect(required(/\[필수\] 만 14세 이상입니다/)).toBeChecked();

      await userEvent.click(required(/\[필수\] 만 14세 이상입니다/));
      expect(all).not.toBeChecked();
      expect(screen.getByRole('button', { name: '동의하고 시작하기' })).toBeDisabled();
    });

    it('필수 셋에 모두 동의하면 저장하고 열려던 책으로 간다', async () => {
      vi.mocked(submitConsent).mockResolvedValue();
      await openConsent();

      await userEvent.click(screen.getByRole('checkbox', { name: '전체 동의' }));
      await userEvent.click(screen.getByRole('button', { name: '동의하고 시작하기' }));

      expect(await screen.findByText('읽기 화면')).toBeInTheDocument();
      expect(submitConsent).toHaveBeenCalledTimes(1);
      expect(enterBook).toHaveBeenCalledWith('takryu');
    });

    it('동의 저장이 실패하면 동의 화면에 남아 다시 시도할 수 있다', async () => {
      vi.mocked(submitConsent).mockRejectedValue(new Error('down'));
      await openConsent();

      await userEvent.click(screen.getByRole('checkbox', { name: '전체 동의' }));
      await userEvent.click(screen.getByRole('button', { name: '동의하고 시작하기' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('저장하지 못했습니다');
      expect(enterBook).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: '동의하고 시작하기' })).toBeEnabled();
    });

    it('각 항목의 본문 보기는 초안 표시가 달린 본문을 연다', async () => {
      await openConsent();

      await userEvent.click(screen.getByRole('button', { name: '이용약관 본문 보기' }));
      const dialog = await screen.findByRole('dialog', { name: '이용약관' });
      expect(within(dialog).getByText(/초안 — 검토 전/)).toBeInTheDocument();
      expect(within(dialog).getByText('제1조 목적')).toBeInTheDocument();

      await userEvent.click(within(dialog).getByRole('button', { name: '닫기' }));
      await userEvent.click(screen.getByRole('button', { name: '개인정보 수집·이용 본문 보기' }));
      expect(await screen.findByRole('dialog', { name: '개인정보 수집·이용' })).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: '닫기' }));
      await userEvent.click(screen.getByRole('button', { name: '만 14세 이상 확인 본문 보기' }));
      expect(await screen.findByRole('dialog', { name: '만 14세 이상 확인' })).toBeInTheDocument();
    });

    it('동의하지 않고 취소하면 로그아웃하고 열려던 책의 작품 화면으로 간다', async () => {
      await openConsent();

      await userEvent.click(screen.getByRole('button', { name: '취소' }));

      expect(await screen.findByText('작품 화면')).toBeInTheDocument();
      expect(getAuthToken()).toBeNull();
      expect(submitConsent).not.toHaveBeenCalled();
    });
  });
});
