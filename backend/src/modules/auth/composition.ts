import type { Router } from 'express';
import type { Pool } from 'pg';
import { createAuthRouter, type AuthConfig } from './auth-router';
import { AuthService } from './auth.service';
import { oauthProviders } from './oauth-providers';
import { PgAccountRepository } from './pg-account-repository';

function loadAuthConfig(): AuthConfig {
  const frontendOrigin = process.env.FRONTEND_ORIGIN;
  const redirectBase = process.env.AUTH_REDIRECT_BASE;
  if (!frontendOrigin || !redirectBase) {
    throw new Error('FRONTEND_ORIGIN and AUTH_REDIRECT_BASE must be set');
  }
  return { frontendOrigin, redirectBase };
}

export function createAuthRoutes(pool: Pool): Router {
  return createAuthRouter({
    service: new AuthService(new PgAccountRepository(pool)),
    providers: oauthProviders,
    loadConfig: loadAuthConfig,
  });
}
