import { randomBytes } from 'crypto';
import express, { Request, Response, Router } from 'express';
import type { AuthService, Provider } from './auth.service';
import type { OAuthProviders } from './oauth-providers';
import { attachReaderIdentity, getSession, UUID_PATTERN } from './reader-id.middleware';
import { signLoginState, verifyLoginState } from './session-token';

const NONCE_COOKIE = 'ssabi_login_nonce';
const NONCE_COOKIE_PATH = '/auth';
const NONCE_COOKIE_MAX_AGE_MS = 10 * 60 * 1000;

export interface AuthConfig {
  frontendOrigin: string;
  redirectBase: string;
}

function parseProvider(value: string): Provider | null {
  return value === 'google' || value === 'kakao' ? value : null;
}

function callbackUri(redirectBase: string, provider: Provider): string {
  return `${redirectBase}/auth/${provider}/callback`;
}

function readCookie(req: Request, name: string): string | undefined {
  const entry = req.headers.cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return entry?.slice(name.length + 1);
}

function sendInternalError(res: Response) {
  return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
}

function sendUnauthorized(res: Response) {
  return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Login required' });
}

function sendProviderNotFound(res: Response) {
  return res.status(404).json({ error: 'NOT_FOUND', message: 'Unknown login provider' });
}

export function createAuthRouter({
  service,
  providers,
  loadConfig,
}: {
  service: AuthService;
  providers: OAuthProviders;
  loadConfig: () => AuthConfig;
}): Router {
  const router = express.Router();

  router.get('/auth/:provider/start', async (req: Request, res: Response) => {
    const provider = parseProvider(req.params.provider);
    if (!provider) return sendProviderNotFound(res);

    const deviceId = req.query.device_id;
    if (typeof deviceId !== 'string' || !UUID_PATTERN.test(deviceId)) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'invalid device_id' });
    }

    try {
      const { redirectBase } = loadConfig();
      const nonce = randomBytes(16).toString('base64url');
      const state = await signLoginState({ provider, deviceId, nonce });
      res.cookie(NONCE_COOKIE, nonce, {
        httpOnly: true,
        sameSite: 'lax',
        secure: redirectBase.startsWith('https://'),
        path: NONCE_COOKIE_PATH,
        maxAge: NONCE_COOKIE_MAX_AGE_MS,
      });
      return res.redirect(
        302,
        providers.authorizationUrl(provider, state, callbackUri(redirectBase, provider))
      );
    } catch (error) {
      console.error('[API] auth start error', { provider, error });
      return sendInternalError(res);
    }
  });

  router.get('/auth/:provider/callback', async (req: Request, res: Response) => {
    const provider = parseProvider(req.params.provider);
    if (!provider) return sendProviderNotFound(res);

    const state =
      typeof req.query.state === 'string' ? await verifyLoginState(req.query.state) : null;
    const nonce = readCookie(req, NONCE_COOKIE);
    if (!state || state.provider !== provider || !nonce || nonce !== state.nonce) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'invalid state' });
    }

    try {
      const { frontendOrigin, redirectBase } = loadConfig();
      const callbackPage = `${frontendOrigin}/auth/callback`;
      const cancelledPage = `${callbackPage}#error=cancelled`;
      res.clearCookie(NONCE_COOKIE, { path: NONCE_COOKIE_PATH });

      const providerCode = req.query.code;
      if (req.query.error !== undefined || typeof providerCode !== 'string') {
        return res.redirect(302, cancelledPage);
      }

      try {
        const profile = await providers.exchangeCode(
          provider,
          providerCode,
          callbackUri(redirectBase, provider)
        );
        const account = await service.completeLogin(provider, profile, state.deviceId);
        const loginCode = await service.issueLoginCode(account.user_id);
        return res.redirect(302, `${callbackPage}#code=${encodeURIComponent(loginCode)}`);
      } catch (error) {
        console.error('[API] auth callback error', { provider, error });
        return res.redirect(302, cancelledPage);
      }
    } catch (error) {
      console.error('[API] auth callback config error', { provider, error });
      return sendInternalError(res);
    }
  });

  router.post('/auth/exchange', async (req: Request, res: Response) => {
    const code: unknown = req.body?.code;
    if (typeof code !== 'string') {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'code is required' });
    }

    try {
      const session = await service.redeemLoginCode(code);
      if (!session) {
        return res.status(400).json({ error: 'INVALID_CODE', message: 'Invalid login code' });
      }
      return res.json(session);
    } catch (error) {
      console.error('[API] auth exchange error', { error });
      return sendInternalError(res);
    }
  });

  router.get('/auth/me', attachReaderIdentity(), async (req: Request, res: Response) => {
    const session = getSession(req);
    if (!session) return sendUnauthorized(res);

    try {
      const me = await service.getMe(session.userId);
      return me ? res.json(me) : sendUnauthorized(res);
    } catch (error) {
      console.error('[API] auth me error', { error });
      return sendInternalError(res);
    }
  });

  router.post('/auth/consent', attachReaderIdentity(), async (req: Request, res: Response) => {
    const session = getSession(req);
    if (!session) return sendUnauthorized(res);

    try {
      if (!(await service.getMe(session.userId))) return sendUnauthorized(res);
      const saved = await service.recordConsent(session.userId, req.body);
      if (!saved) {
        return res.status(400).json({ error: 'BAD_REQUEST', message: 'invalid consent' });
      }
      return res.status(204).send();
    } catch (error) {
      console.error('[API] auth consent error', { error });
      return sendInternalError(res);
    }
  });

  router.delete('/auth/me', attachReaderIdentity(), async (req: Request, res: Response) => {
    const session = getSession(req);
    if (!session) return sendUnauthorized(res);

    try {
      await service.withdraw(session.userId, session.readerId);
      return res.status(204).send();
    } catch (error) {
      console.error('[API] auth withdraw error', { error });
      return sendInternalError(res);
    }
  });

  return router;
}
