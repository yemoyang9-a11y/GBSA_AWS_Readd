import { randomBytes, randomUUID } from 'crypto';
import { signSessionToken } from './session-token';

const LOGIN_CODE_LIFETIME_MS = 60_000;

export const CONSENT_VERSION = '2026-11-12-draft';

export type Provider = 'google' | 'kakao';

export interface OAuthProfile {
  providerUserId: string;
  displayName: string | null;
}

export interface Account {
  user_id: string;
  reader_id: string;
  display_name: string | null;
}

export interface NewAccount {
  userId: string;
  readerId: string;
  displayName: string | null;
  provider: Provider;
  providerUserId: string;
}

export interface ConsentRecord {
  userId: string;
  termsVersion: string;
  privacyVersion: string;
  age14Confirmed: true;
  agreedAt: Date;
}

export interface AccountRepository {
  findByIdentity(provider: Provider, providerUserId: string): Promise<Account | null>;
  findByUserId(userId: string): Promise<Account | null>;
  readerIdExists(readerId: string): Promise<boolean>;
  createAccount(input: NewAccount): Promise<Account>;
  listProviders(userId: string): Promise<Provider[]>;
  saveLoginCode(code: string, userId: string, expiresAt: Date): Promise<void>;
  consumeLoginCode(code: string, now: Date): Promise<string | null>;
  deleteAccount(userId: string, readerId: string): Promise<void>;
  hasConsent(userId: string, termsVersion: string, privacyVersion: string): Promise<boolean>;
  saveConsent(record: ConsentRecord): Promise<void>;
}

export class AuthService {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly now: () => Date = () => new Date()
  ) {}

  async completeLogin(
    provider: Provider,
    profile: OAuthProfile,
    deviceId: string
  ): Promise<Account> {
    const existing = await this.accounts.findByIdentity(provider, profile.providerUserId);
    if (existing) return existing;

    const deviceAlreadyAssigned = await this.accounts.readerIdExists(deviceId);
    return this.accounts.createAccount({
      userId: randomUUID(),
      readerId: deviceAlreadyAssigned ? randomUUID() : deviceId,
      displayName: profile.displayName,
      provider,
      providerUserId: profile.providerUserId,
    });
  }

  async issueLoginCode(userId: string): Promise<string> {
    const code = randomBytes(32).toString('base64url');
    const expiresAt = new Date(this.now().getTime() + LOGIN_CODE_LIFETIME_MS);
    await this.accounts.saveLoginCode(code, userId, expiresAt);
    return code;
  }

  async redeemLoginCode(
    code: string
  ): Promise<{ token: string; display_name: string | null; consent_required: boolean } | null> {
    const userId = await this.accounts.consumeLoginCode(code, this.now());
    if (!userId) return null;

    const account = await this.accounts.findByUserId(userId);
    if (!account) return null;

    const token = await signSessionToken({ userId, readerId: account.reader_id });
    return {
      token,
      display_name: account.display_name,
      consent_required: await this.consentRequired(userId),
    };
  }

  async getMe(
    userId: string
  ): Promise<{
    display_name: string | null;
    providers: Provider[];
    consent_required: boolean;
  } | null> {
    const account = await this.accounts.findByUserId(userId);
    if (!account) return null;
    return {
      display_name: account.display_name,
      providers: await this.accounts.listProviders(userId),
      consent_required: await this.consentRequired(userId),
    };
  }

  async recordConsent(userId: string, body: unknown): Promise<boolean> {
    const agreement = body as Record<string, unknown> | null;
    if (
      agreement?.terms_version !== CONSENT_VERSION ||
      agreement?.privacy_version !== CONSENT_VERSION ||
      agreement?.age_14_confirmed !== true
    ) {
      return false;
    }
    await this.accounts.saveConsent({
      userId,
      termsVersion: CONSENT_VERSION,
      privacyVersion: CONSENT_VERSION,
      age14Confirmed: true,
      agreedAt: this.now(),
    });
    return true;
  }

  private async consentRequired(userId: string): Promise<boolean> {
    return !(await this.accounts.hasConsent(userId, CONSENT_VERSION, CONSENT_VERSION));
  }

  withdraw(userId: string, readerId: string): Promise<void> {
    return this.accounts.deleteAccount(userId, readerId);
  }
}
