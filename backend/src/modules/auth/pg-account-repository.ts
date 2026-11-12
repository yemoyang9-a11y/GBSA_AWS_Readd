import type { Pool, PoolClient } from 'pg';
import type {
  Account,
  AccountRepository,
  ConsentRecord,
  NewAccount,
  Provider,
} from './auth.service';

const READING_TABLES = [
  'reading_position',
  'reading_session',
  'saved_recap',
  'session_recap_cache',
  'conversation_history',
  'chatbot_conversation',
];

export class PgAccountRepository implements AccountRepository {
  constructor(private readonly pool: Pool) {}

  async findByIdentity(provider: Provider, providerUserId: string): Promise<Account | null> {
    const { rows } = await this.pool.query<Account>(
      `SELECT u.user_id, u.reader_id, u.display_name
         FROM user_identities i
         JOIN users u ON u.user_id = i.user_id
        WHERE i.provider = $1 AND i.provider_user_id = $2`,
      [provider, providerUserId]
    );
    return rows[0] ?? null;
  }

  async findByUserId(userId: string): Promise<Account | null> {
    const { rows } = await this.pool.query<Account>(
      `SELECT user_id, reader_id, display_name FROM users WHERE user_id = $1`,
      [userId]
    );
    return rows[0] ?? null;
  }

  async readerIdExists(readerId: string): Promise<boolean> {
    const { rows } = await this.pool.query(`SELECT 1 FROM users WHERE reader_id = $1`, [readerId]);
    return rows.length > 0;
  }

  createAccount(input: NewAccount): Promise<Account> {
    return this.inTransaction(async (client) => {
      await client.query(
        `INSERT INTO users (user_id, reader_id, display_name) VALUES ($1, $2, $3)`,
        [input.userId, input.readerId, input.displayName]
      );
      await client.query(
        `INSERT INTO user_identities (provider, provider_user_id, user_id) VALUES ($1, $2, $3)`,
        [input.provider, input.providerUserId, input.userId]
      );
      return {
        user_id: input.userId,
        reader_id: input.readerId,
        display_name: input.displayName,
      };
    });
  }

  async listProviders(userId: string): Promise<Provider[]> {
    const { rows } = await this.pool.query<{ provider: Provider }>(
      `SELECT provider FROM user_identities WHERE user_id = $1 ORDER BY provider`,
      [userId]
    );
    return rows.map((row) => row.provider);
  }

  async saveLoginCode(code: string, userId: string, expiresAt: Date): Promise<void> {
    await this.pool.query(
      `WITH purged AS (DELETE FROM auth_login_codes WHERE expires_at <= now())
       INSERT INTO auth_login_codes (code, user_id, expires_at) VALUES ($1, $2, $3)`,
      [code, userId, expiresAt]
    );
  }

  async consumeLoginCode(code: string, now: Date): Promise<string | null> {
    const { rows } = await this.pool.query<{ user_id: string }>(
      `DELETE FROM auth_login_codes WHERE code = $1 AND expires_at > $2 RETURNING user_id`,
      [code, now]
    );
    return rows[0]?.user_id ?? null;
  }

  deleteAccount(userId: string, readerId: string): Promise<void> {
    return this.inTransaction(async (client) => {
      for (const table of READING_TABLES) {
        await client.query(`DELETE FROM ${table} WHERE device_id = $1`, [readerId]);
      }
      await client.query(`DELETE FROM users WHERE user_id = $1`, [userId]);
    });
  }

  async hasConsent(userId: string, termsVersion: string, privacyVersion: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      `SELECT 1 FROM user_consents
        WHERE user_id = $1 AND terms_version = $2 AND privacy_version = $3`,
      [userId, termsVersion, privacyVersion]
    );
    return rows.length > 0;
  }

  async saveConsent(record: ConsentRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO user_consents (user_id, terms_version, privacy_version, age_14_confirmed, agreed_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, terms_version, privacy_version) DO NOTHING`,
      [
        record.userId,
        record.termsVersion,
        record.privacyVersion,
        record.age14Confirmed,
        record.agreedAt,
      ]
    );
  }

  private async inTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
