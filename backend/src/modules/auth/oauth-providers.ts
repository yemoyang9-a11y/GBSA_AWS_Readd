import type { OAuthProfile, Provider } from './auth.service';

export interface OAuthProviders {
  authorizationUrl(provider: Provider, state: string, redirectUri: string): string;
  exchangeCode(provider: Provider, code: string, redirectUri: string): Promise<OAuthProfile>;
}

interface ProviderSpec {
  authorizeUrl: string;
  tokenUrl: string;
  profileUrl: string;
  scope: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  readId(profile: Record<string, any>): unknown;
  readName(profile: Record<string, any>): unknown;
}

const SPECS: Record<Provider, ProviderSpec> = {
  google: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    profileUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
    scope: 'openid profile',
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_CLIENT_SECRET',
    readId: (profile) => profile.sub,
    readName: (profile) => profile.name,
  },
  kakao: {
    authorizeUrl: 'https://kauth.kakao.com/oauth/authorize',
    tokenUrl: 'https://kauth.kakao.com/oauth/token',
    profileUrl: 'https://kapi.kakao.com/v2/user/me',
    scope: 'profile_nickname',
    clientIdEnv: 'KAKAO_CLIENT_ID',
    clientSecretEnv: 'KAKAO_CLIENT_SECRET',
    readId: (profile) => profile.id,
    readName: (profile) => profile.kakao_account?.profile?.nickname,
  },
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

async function readJson(response: Response, step: string): Promise<Record<string, any>> {
  if (!response.ok) throw new Error(`OAuth ${step} failed with status ${response.status}`);
  return (await response.json()) as Record<string, any>;
}

export const oauthProviders: OAuthProviders = {
  authorizationUrl(provider, state, redirectUri) {
    const spec = SPECS[provider];
    const params = new URLSearchParams({
      client_id: requireEnv(spec.clientIdEnv),
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: spec.scope,
      state,
    });
    return `${spec.authorizeUrl}?${params.toString()}`;
  },

  async exchangeCode(provider, code, redirectUri) {
    const spec = SPECS[provider];
    const tokens = await readJson(
      await fetch(spec.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: requireEnv(spec.clientIdEnv),
          client_secret: requireEnv(spec.clientSecretEnv),
          redirect_uri: redirectUri,
          code,
        }).toString(),
      }),
      'token exchange'
    );

    const profile = await readJson(
      await fetch(spec.profileUrl, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      }),
      'profile lookup'
    );

    const id = spec.readId(profile);
    if (typeof id !== 'string' && typeof id !== 'number') {
      throw new Error('OAuth profile has no user id');
    }
    const name = spec.readName(profile);
    return { providerUserId: String(id), displayName: typeof name === 'string' ? name : null };
  },
};
