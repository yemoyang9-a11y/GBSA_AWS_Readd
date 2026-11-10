import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import type { Provider } from './auth.service';

const ALGORITHM = 'HS256';
const SESSION_AUDIENCE = 'ssabi.session';
const LOGIN_STATE_AUDIENCE = 'ssabi.login-state';
const SESSION_LIFETIME_SECONDS = 30 * 24 * 60 * 60;
const LOGIN_STATE_LIFETIME_SECONDS = 10 * 60;

export interface SessionClaims {
  userId: string;
  readerId: string;
}

export interface LoginState {
  provider: Provider;
  deviceId: string;
  nonce: string;
}

function signingKey(): Uint8Array {
  const secret = process.env.AUTH_TOKEN_SECRET;
  if (!secret) throw new Error('AUTH_TOKEN_SECRET is not set');
  return new TextEncoder().encode(secret);
}

function sign(
  payload: JWTPayload,
  audience: string,
  lifetimeSeconds: number,
  issuedAt: Date
): Promise<string> {
  const issuedAtSeconds = Math.floor(issuedAt.getTime() / 1000);
  return new SignJWT(payload)
    .setProtectedHeader({ alg: ALGORITHM })
    .setAudience(audience)
    .setIssuedAt(issuedAtSeconds)
    .setExpirationTime(issuedAtSeconds + lifetimeSeconds)
    .sign(signingKey());
}

async function verify(token: string, audience: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, signingKey(), {
      audience,
      algorithms: [ALGORITHM],
    });
    return payload;
  } catch {
    return null;
  }
}

export function signSessionToken(claims: SessionClaims, issuedAt = new Date()): Promise<string> {
  return sign(
    { sub: claims.userId, rid: claims.readerId },
    SESSION_AUDIENCE,
    SESSION_LIFETIME_SECONDS,
    issuedAt
  );
}

export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
  const payload = await verify(token, SESSION_AUDIENCE);
  if (typeof payload?.sub !== 'string' || typeof payload.rid !== 'string') return null;
  return { userId: payload.sub, readerId: payload.rid };
}

export function signLoginState(state: LoginState, issuedAt = new Date()): Promise<string> {
  return sign(
    { provider: state.provider, device_id: state.deviceId, nonce: state.nonce },
    LOGIN_STATE_AUDIENCE,
    LOGIN_STATE_LIFETIME_SECONDS,
    issuedAt
  );
}

export async function verifyLoginState(token: string): Promise<LoginState | null> {
  const payload = await verify(token, LOGIN_STATE_AUDIENCE);
  if (
    (payload?.provider !== 'google' && payload?.provider !== 'kakao') ||
    typeof payload.device_id !== 'string' ||
    typeof payload.nonce !== 'string'
  ) {
    return null;
  }
  return { provider: payload.provider, deviceId: payload.device_id, nonce: payload.nonce };
}
