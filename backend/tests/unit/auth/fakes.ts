import type {
  Account,
  AccountRepository,
  ConsentRecord,
  NewAccount,
  Provider,
} from '../../../src/modules/auth/auth.service';

export class FakeAccountRepository implements AccountRepository {
  accounts: Account[] = [];
  identities: { provider: Provider; providerUserId: string; userId: string }[] = [];
  codes = new Map<string, { userId: string; expiresAt: Date }>();
  deletedReaders: string[] = [];
  consents: ConsentRecord[] = [];

  async findByIdentity(provider: Provider, providerUserId: string): Promise<Account | null> {
    const identity = this.identities.find(
      (i) => i.provider === provider && i.providerUserId === providerUserId
    );
    return identity ? this.requireAccount(identity.userId) : null;
  }

  async findByUserId(userId: string): Promise<Account | null> {
    return this.accounts.find((a) => a.user_id === userId) ?? null;
  }

  async readerIdExists(readerId: string): Promise<boolean> {
    return this.accounts.some((a) => a.reader_id === readerId);
  }

  async createAccount(input: NewAccount): Promise<Account> {
    if (await this.readerIdExists(input.readerId)) throw new Error('unique violation: reader_id');
    const account: Account = {
      user_id: input.userId,
      reader_id: input.readerId,
      display_name: input.displayName,
    };
    this.accounts.push(account);
    this.identities.push({
      provider: input.provider,
      providerUserId: input.providerUserId,
      userId: input.userId,
    });
    return account;
  }

  async listProviders(userId: string): Promise<Provider[]> {
    return this.identities.filter((i) => i.userId === userId).map((i) => i.provider);
  }

  async saveLoginCode(code: string, userId: string, expiresAt: Date): Promise<void> {
    this.codes.set(code, { userId, expiresAt });
  }

  async consumeLoginCode(code: string, now: Date): Promise<string | null> {
    const entry = this.codes.get(code);
    this.codes.delete(code);
    return entry && entry.expiresAt > now ? entry.userId : null;
  }

  async deleteAccount(userId: string, readerId: string): Promise<void> {
    this.accounts = this.accounts.filter((a) => a.user_id !== userId);
    this.identities = this.identities.filter((i) => i.userId !== userId);
    this.deletedReaders.push(readerId);
  }

  async hasConsent(userId: string, termsVersion: string, privacyVersion: string): Promise<boolean> {
    return this.consents.some(
      (c) =>
        c.userId === userId &&
        c.termsVersion === termsVersion &&
        c.privacyVersion === privacyVersion
    );
  }

  async saveConsent(record: ConsentRecord): Promise<void> {
    if (await this.hasConsent(record.userId, record.termsVersion, record.privacyVersion)) return;
    this.consents.push(record);
  }

  private requireAccount(userId: string): Account {
    return this.accounts.find((a) => a.user_id === userId) as Account;
  }
}
