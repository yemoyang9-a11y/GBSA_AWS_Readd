import type { Pool } from 'pg';
import { PgAccountRepository } from './pg-account-repository';

const READING_TABLES = [
  'reading_position',
  'reading_session',
  'saved_recap',
  'session_recap_cache',
  'conversation_history',
  'chatbot_conversation',
];

function fakePool(failOn?: string) {
  const statements: { text: string; values?: unknown[] }[] = [];
  const release = jest.fn();
  const query = jest.fn(async (text: string, values?: unknown[]) => {
    statements.push({ text, values });
    if (failOn && text.includes(failOn)) throw new Error('db failure');
    return { rows: [], rowCount: 0 };
  });
  const pool = { query, connect: jest.fn(async () => ({ query, release })) };
  return { pool: pool as unknown as Pool, statements, release };
}

describe('PgAccountRepository', () => {
  test.each(READING_TABLES)('탈퇴는 %s를 reader_id로 지운다', async (table) => {
    const { pool, statements } = fakePool();
    await new PgAccountRepository(pool).deleteAccount('user-1', 'reader-1');
    const statement = statements.find((s) => s.text.includes(`DELETE FROM ${table} `));
    expect(statement?.values).toEqual(['reader-1']);
    expect(statement?.text).toContain('device_id = $1');
  });

  test('탈퇴는 계정을 user_id로 지우고 커밋한다', async () => {
    const { pool, statements, release } = fakePool();
    await new PgAccountRepository(pool).deleteAccount('user-1', 'reader-1');
    expect(statements.find((s) => s.text.includes('DELETE FROM users'))?.values).toEqual([
      'user-1',
    ]);
    expect(statements[0].text).toBe('BEGIN');
    expect(statements[statements.length - 1].text).toBe('COMMIT');
    expect(release).toHaveBeenCalledTimes(1);
  });

  test('NFR-OBS-002: 탈퇴는 게이트 판정 로그 recap_call_log를 지우지 않는다', async () => {
    const { pool, statements } = fakePool();
    await new PgAccountRepository(pool).deleteAccount('user-1', 'reader-1');
    expect(statements.some((s) => s.text.includes('recap_call_log'))).toBe(false);
  });

  test('탈퇴 도중 실패하면 롤백하고 연결을 돌려준다', async () => {
    const { pool, statements, release } = fakePool('DELETE FROM saved_recap');
    await expect(
      new PgAccountRepository(pool).deleteAccount('user-1', 'reader-1')
    ).rejects.toThrow();
    expect(statements[statements.length - 1].text).toBe('ROLLBACK');
    expect(statements.some((s) => s.text === 'COMMIT')).toBe(false);
    expect(release).toHaveBeenCalledTimes(1);
  });

  test('계정 생성은 users와 user_identities를 한 트랜잭션으로 넣는다', async () => {
    const { pool, statements } = fakePool();
    const account = await new PgAccountRepository(pool).createAccount({
      userId: 'user-1',
      readerId: 'reader-1',
      displayName: '독자',
      provider: 'kakao',
      providerUserId: '123',
    });
    expect(account).toEqual({ user_id: 'user-1', reader_id: 'reader-1', display_name: '독자' });
    expect(statements[0].text).toBe('BEGIN');
    expect(statements[1].text).toContain('INSERT INTO users');
    expect(statements[2].text).toContain('INSERT INTO user_identities');
    expect(statements[3].text).toBe('COMMIT');
  });

  test('1회용 코드 사용은 삭제와 만료 조건을 한 문장으로 처리한다', async () => {
    const { pool, statements } = fakePool();
    const now = new Date('2026-11-10T00:00:00.000Z');
    await expect(new PgAccountRepository(pool).consumeLoginCode('code-1', now)).resolves.toBeNull();
    expect(statements).toHaveLength(1);
    expect(statements[0].text).toContain('DELETE FROM auth_login_codes');
    expect(statements[0].text).toContain('expires_at > $2');
    expect(statements[0].text).toContain('RETURNING user_id');
    expect(statements[0].values).toEqual(['code-1', now]);
  });
});
