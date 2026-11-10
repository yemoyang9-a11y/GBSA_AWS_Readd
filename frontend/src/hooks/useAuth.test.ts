import { act, renderHook, waitFor } from '@testing-library/react';
import { useAuth } from './useAuth';
import { deleteAccount, fetchMe, startLogin } from '../services/authService';
import { clearAuthToken, getAuthToken, setAuthToken } from '../utils/storage';

vi.mock('../services/authService', () => ({
  deleteAccount: vi.fn(),
  fetchMe: vi.fn(),
  startLogin: vi.fn(),
}));

describe('useAuth', () => {
  beforeEach(() => {
    vi.mocked(deleteAccount).mockReset();
    vi.mocked(fetchMe).mockReset();
    vi.mocked(startLogin).mockReset();
    localStorage.clear();
  });

  it('토큰이 없으면 서버를 부르지 않고 guest다', async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.status).toBe('guest'));
    expect(result.current.displayName).toBeNull();
    expect(fetchMe).not.toHaveBeenCalled();
  });

  it('토큰이 있으면 loading을 거쳐 member가 되고 표시 이름을 준다', async () => {
    setAuthToken('jwt');
    vi.mocked(fetchMe).mockResolvedValue({ display_name: '독자', providers: ['google'] });

    const { result } = renderHook(() => useAuth());

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('member'));
    expect(result.current.displayName).toBe('독자');
  });

  it('서버가 토큰을 거절해 토큰이 지워지면 guest가 된다', async () => {
    setAuthToken('jwt');
    vi.mocked(fetchMe).mockImplementation(async () => {
      clearAuthToken();
      throw new Error('401');
    });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.status).toBe('guest'));
  });

  it('네트워크 오류로 확인에 실패해도 토큰이 남아 있으면 member를 유지한다', async () => {
    setAuthToken('jwt');
    vi.mocked(fetchMe).mockRejectedValue(new Error('network'));

    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.status).toBe('member'));
    expect(result.current.displayName).toBeNull();
    expect(getAuthToken()).toBe('jwt');
  });

  it('다른 요청에서 토큰이 무효로 지워지면 guest로 바뀐다', async () => {
    setAuthToken('jwt');
    vi.mocked(fetchMe).mockResolvedValue({ display_name: '독자', providers: ['google'] });
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.status).toBe('member'));

    act(() => clearAuthToken());

    expect(result.current.status).toBe('guest');
    expect(result.current.displayName).toBeNull();
  });

  it('login은 제공자 로그인을 시작한다', async () => {
    const { result } = renderHook(() => useAuth());
    act(() => result.current.login('kakao'));
    expect(startLogin).toHaveBeenCalledWith('kakao');
  });

  it('logout은 토큰을 지우고 guest가 된다', async () => {
    setAuthToken('jwt');
    vi.mocked(fetchMe).mockResolvedValue({ display_name: '독자', providers: ['google'] });
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.status).toBe('member'));

    act(() => result.current.logout());

    expect(getAuthToken()).toBeNull();
    expect(result.current.status).toBe('guest');
  });

  it('withdraw는 서버 계정을 지우고 토큰을 지운다', async () => {
    setAuthToken('jwt');
    vi.mocked(fetchMe).mockResolvedValue({ display_name: '독자', providers: ['google'] });
    vi.mocked(deleteAccount).mockResolvedValue(undefined);
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.status).toBe('member'));

    await act(() => result.current.withdraw());

    expect(deleteAccount).toHaveBeenCalledTimes(1);
    expect(getAuthToken()).toBeNull();
    expect(result.current.status).toBe('guest');
  });

  it('withdraw가 실패하면 토큰을 지우지 않고 예외를 알린다', async () => {
    setAuthToken('jwt');
    vi.mocked(fetchMe).mockResolvedValue({ display_name: '독자', providers: ['google'] });
    vi.mocked(deleteAccount).mockRejectedValue(new Error('server'));
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.status).toBe('member'));

    await expect(result.current.withdraw()).rejects.toThrow('server');

    expect(getAuthToken()).toBe('jwt');
  });
});
