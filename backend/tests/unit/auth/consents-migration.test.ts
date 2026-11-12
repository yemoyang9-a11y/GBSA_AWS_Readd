import { readFileSync } from 'fs';
import { join } from 'path';

const sql = readFileSync(join(__dirname, '../../../migrations/011_user_consents.sql'), 'utf8');

describe('011_user_consents 마이그레이션', () => {
  test('user_consents는 users를 ON DELETE CASCADE로 참조한다', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS user_consents/);
    expect(sql).toMatch(/user_id\s+UUID\s+NOT NULL REFERENCES users \(user_id\) ON DELETE CASCADE/);
  });

  test.each(['terms_version', 'privacy_version', 'age_14_confirmed', 'agreed_at'])(
    '%s 열이 있다',
    (column) => {
      expect(sql).toMatch(new RegExp(`\\b${column}\\b`));
    }
  );

  test('만 14세 이상 확인은 true만 저장된다', () => {
    expect(sql).toMatch(/CHECK \(age_14_confirmed\)/);
  });

  test('user_consents에 ROW LEVEL SECURITY를 켜고 정책은 만들지 않는다', () => {
    expect(sql).toMatch(/ALTER TABLE user_consents ENABLE ROW LEVEL SECURITY;/);
    expect(sql).not.toMatch(/CREATE POLICY/i);
  });

  test('기존 테이블을 바꾸지 않는다', () => {
    expect(sql).not.toMatch(/ALTER TABLE (?!user_consents)/);
    expect(sql).not.toMatch(/^\s*(DROP|UPDATE|DELETE|INSERT)\b/im);
  });
});
