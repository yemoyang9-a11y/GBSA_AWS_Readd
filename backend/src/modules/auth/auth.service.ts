import { randomBytes, randomUUID } from 'crypto';
import { signSessionToken } from './session-token';

const LOGIN_CODE_LIFETIME_MS = 60_000;

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

export interface AccountRepository {
  findByIdentity(provider: Provider, providerUserId: string): Promise<Account | null>;
  findByUserId(userId: string): Promise<Account | null>;
  readerIdExists(readerId: string): Promise<boolean>;
  createAccount(input: NewAccount): Promise<Account>;
  listProviders(userId: string): Promise<Provider[]>;
  saveLoginCode(code: string, userId: string, expiresAt: Date): Promise<void>;
  consumeLoginCode(code: string, now: Date): Promise<string | null>;
  deleteAccount(userId: string, readerId: string): Promise<void>;
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
  ): Promise<{ token: string; display_name: string | null } | null> {
    const userId = await this.accounts.consumeLoginCode(code, this.now());
    if (!userId) return null;

    const account = await this.accounts.findByUserId(userId);
    if (!account) return null;

    const token = await signSessionToken({ userId, readerId: account.reader_id });
    return { token, display_name: account.display_name };
  }

  async getMe(
    userId: string
  ): Promise<{ display_name: string | null; providers: Provider[] } | null> {
    const account = await this.accounts.findByUserId(userId);
    if (!account) return null;
    return {
      display_name: account.display_name,
      providers: await this.accounts.listProviders(userId),
    };
  }

  withdraw(userId: string, readerId: string): Promise<void> {
    return this.accounts.deleteAccount(userId, readerId);
  }
}
