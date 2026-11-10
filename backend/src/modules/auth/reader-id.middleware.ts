import type { Request, RequestHandler } from 'express';
import { verifySessionToken, type SessionClaims } from './session-token';

const sessions = new WeakMap<Request, SessionClaims>();

export function getSession(req: Request): SessionClaims | null {
  return sessions.get(req) ?? null;
}

export function attachReaderIdentity(): RequestHandler {
  return async (req, res, next) => {
    const header = req.headers.authorization;
    if (header === undefined) {
      next();
      return;
    }

    const token = /^Bearer (.+)$/.exec(header)?.[1];
    const claims = token ? await verifySessionToken(token) : null;
    if (!claims) {
      // R11
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid or expired token' });
      return;
    }

    sessions.set(req, claims);
    next();
  };
}

export function resolveReaderId(req: Request): string | undefined {
  return sessions.get(req)?.readerId ?? (req.headers['x-device-id'] as string | undefined);
}
