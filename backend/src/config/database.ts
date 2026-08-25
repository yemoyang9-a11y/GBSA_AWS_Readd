/**
 * PostgreSQL 데이터베이스 연결 설정
 *
 * PostgreSQL 15 + pgvector
 */

import { Pool, types } from 'pg';

/**
 * DATE 컬럼(oid 1082)을 pg 기본값인 Date 객체 대신 원본 문자열('YYYY-MM-DD')로 받는다.
 *
 * 이 프로젝트는 conversation_date 등 DATE 컬럼을 어디서나 string으로 취급한다
 * (conversation-repository.ts 타입 주석 "DATE -> 'YYYY-MM-DD'" 참조) — 근데 pg
 * 드라이버 기본 파서는 DATE를 Date 객체로 바꿔서 그 가정이 실제로는 깨져 있었다.
 * 두 군데서 실제 버그로 나타난다(2026-08-25, 실사용 중 발견):
 *   1) JSON 응답에 Date 객체가 그대로 실리면 Date.toJSON()이 불려 "2026-08-25T00:00:00.000Z"
 *      처럼 타임스탬프로 새어 나간다 — 대화 이력 목록의 날짜 표시가 이래서 깨져 있었다.
 *   2) resolveConversation의 "오늘과 같은 날짜면 이어서 쓴다" 비교
 *      (`existing.conversation_date === today`, today는 문자열)가 Date 객체 vs 문자열
 *      비교라 항상 false — 즉 같은 날 이어지는 대화가 매번 새 대화로 갈라지고 있었다.
 * setTypeParser로 DATE를 원본 문자열 그대로 받으면 두 버그 다 근본에서 해결된다.
 */
types.setTypeParser(1082, (value) => value);

/**
 * PostgreSQL 연결 풀
 */
// 로컬 Docker Postgres는 SSL을 지원하지 않는다 — RDS(배포)만 SSL을 켠다.
const useSSL = process.env.NODE_ENV === 'production';

export const pool = new Pool({
  // .env는 DATABASE_URL 하나만 정의한다 (DB_HOST 등 개별 변수는 없음) —
  // connectionString을 우선하고, 배포 환경이 개별 변수를 쓴다면 그쪽으로 폴백한다.
  connectionString: process.env.DATABASE_URL,
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

/**
 * 연결 테스트
 */
export async function testConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();

    console.log('[Database] Connected successfully', {
      timestamp: result.rows[0].now,
    });

    return true;
  } catch (error) {
    console.error('[Database] Connection failed', error);
    return false;
  }
}

/**
 * pgvector 확장 확인
 */
export async function checkPgVector(): Promise<boolean> {
  try {
    const result = await pool.query(`
      SELECT * FROM pg_extension WHERE extname = 'vector'
    `);

    if (result.rows.length === 0) {
      console.warn('[Database] pgvector extension not installed');
      return false;
    }

    console.log('[Database] pgvector extension found');
    return true;
  } catch (error) {
    console.error('[Database] pgvector check failed', error);
    return false;
  }
}

/**
 * 종료 시 연결 풀 정리
 */
process.on('SIGINT', async () => {
  console.log('[Database] Closing connection pool...');
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('[Database] Closing connection pool...');
  await pool.end();
  process.exit(0);
});
