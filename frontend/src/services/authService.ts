import { AxiosError, type AxiosResponse } from 'axios';
import { api, ensureDeviceId } from './api';
import { API_BASE_URL, USE_MOCK } from '../utils/constants';

export type AuthProvider = 'google' | 'kakao';

export interface AuthSession {
  token: string;
  display_name: string | null;
}

export interface AuthMe {
  display_name: string | null;
  providers: string[];
}

export function buildLoginUrl(provider: AuthProvider): string {
  return `${API_BASE_URL}/auth/${provider}/start?device_id=${encodeURIComponent(ensureDeviceId())}`;
}

export function startLogin(provider: AuthProvider): void {
  window.location.assign(buildLoginUrl(provider));
}

export async function exchangeLoginCode(code: string): Promise<AuthSession> {
  const { data } = await api.post<AuthSession>('/auth/exchange', { code });
  return data;
}

export async function fetchMe(): Promise<AuthMe> {
  if (USE_MOCK) {
    const { mockMeResponse } = await import('../../mocks/server');
    const result = mockMeResponse();
    if (result.status === 200) return result.body;
    throw new AxiosError('mock', 'ERR_BAD_REQUEST', undefined, null, {
      status: result.status,
    } as AxiosResponse);
  }
  const { data } = await api.get<AuthMe>('/auth/me');
  return data;
}

export async function deleteAccount(): Promise<void> {
  await api.delete('/auth/me');
}
