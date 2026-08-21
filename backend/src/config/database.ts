/**
 * PostgreSQL 데이터베이스 연결 설정
 *
 * PostgreSQL 15 + pgvector
 */

import { Pool } from 'pg';

/**
 * PostgreSQL 연결 풀
 */
export const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: {
    rejectUnauthorized: false
  },
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
