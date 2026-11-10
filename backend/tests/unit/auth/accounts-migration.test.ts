import { readFileSync } from 'fs';
import { join } from 'path';

const sql = readFileSync(join(__dirname, '../../../migrations/010_accounts.sql'), 'utf8');

describe('010_accounts 마이그레이션의 reading_position 열', () => {
  test('FR-PRG-003: last_writer_device_id는 NULL을 허용하는 UUID 열이고 기존 행은 NULL이다', () => {
    expect(sql).toMatch(
      /ALTER TABLE reading_position\s+ADD COLUMN IF NOT EXISTS last_writer_device_id UUID;/
    );
  });
});

describe('010_accounts 마이그레이션의 RLS', () => {
  test.each(['users', 'user_identities', 'auth_login_codes'])(
    '%s 테이블에 ROW LEVEL SECURITY를 켠다',
    (table) => {
      expect(sql).toMatch(new RegExp(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`));
    }
  );

  test('정책은 만들지 않는다', () => {
    expect(sql).not.toMatch(/CREATE POLICY/i);
  });
});
