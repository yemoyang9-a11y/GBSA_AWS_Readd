/**
 * db-size-snapshot.js 의 대상 DB 가드 — 측정 DB(127.0.0.1:5433/readd_cost)가 아니면 거부한다.
 * DB에 접속하지 않는다.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { assertMeasurementDb } = require('../../../scripts/db-size-snapshot.js');

test('측정 DB면 비밀번호를 뺀 host:port/db를 돌려준다', () => {
  expect(assertMeasurementDb('postgresql://postgres:secret@127.0.0.1:5433/readd_cost')).toBe(
    '127.0.0.1:5433/readd_cost'
  );
  expect(assertMeasurementDb('postgresql://postgres:secret@localhost:5433/readd_cost')).toBe(
    'localhost:5433/readd_cost'
  );
});

test.each([
  ['다른 DB명', 'postgresql://postgres:secret@127.0.0.1:5433/readd_recap'],
  ['다른 포트', 'postgresql://postgres:secret@127.0.0.1:5432/readd_cost'],
  ['원격 호스트', 'postgresql://postgres:secret@aws-0.pooler.supabase.com:5433/readd_cost'],
  ['포트 생략', 'postgresql://postgres:secret@127.0.0.1/readd_cost'],
])('측정 DB가 아니면 거부한다 — %s', (_name, url) => {
  expect(() => assertMeasurementDb(url)).toThrow(/거부/);
});

test('DATABASE_URL이 없으면 거부한다', () => {
  expect(() => assertMeasurementDb(undefined)).toThrow(/DATABASE_URL/);
});
