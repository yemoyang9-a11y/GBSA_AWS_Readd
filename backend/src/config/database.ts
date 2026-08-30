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
/**
 * 로컬 Docker Postgres는 SSL을 지원하지 않는다 — 배포(Supabase)만 SSL을 켠다.
 *
 * 2026-08-29 — 인증서 검증을 켰다(`rejectUnauthorized: true`). 예전 `false`는 RDS의
 * CA 번들을 따로 심지 않으려던 편법이었는데, 그 상태로는 중간자 공격을 막지 못한다.
 * Supabase의 pooler 엔드포인트는 공인 CA가 서명한 인증서를 쓰므로 Node 기본 신뢰
 * 저장소로 그대로 검증된다 — 편법을 유지할 이유가 사라졌다.
 */
const useSSL = process.env.NODE_ENV === 'production';

/**
 * 커넥션 풀 크기 (2026-08-29, Supabase 이관)
 *
 * RDS 시절 기준값 20을 그대로 쓰면 안 된다. 이유가 둘이다.
 *   1) Supabase 무료 등급은 동시 연결 상한이 RDS보다 훨씬 낮고, pooler를 거쳐도
 *      프로젝트 단위 상한이 있다. 컨테이너가 20개를 붙들면 마이그레이션 스크립트나
 *      psql 접속이 상한에 막힌다.
 *   2) 실행 단위가 줄었다 — PM2 클러스터 2 프로세스에서 컨테이너 1개로 바뀌었으므로
 *      (Phase 1-3) 프로세스당 풀을 키울 이유 자체가 없어졌다. 예전엔 20 × 2 = 40이
 *      떴다는 뜻이기도 하다.
 * 「탁류」 1권 데모 트래픽에서는 5로 충분하다. 환경변수로 올릴 수 있게 둔다.
 */
const POOL_MAX = parseInt(process.env.DB_POOL_MAX || '5');

export const pool = new Pool({
  // .env는 DATABASE_URL 하나만 정의한다 (DB_HOST 등 개별 변수는 없음) —
  // connectionString을 우선하고, 배포 환경이 개별 변수를 쓴다면 그쪽으로 폴백한다.
  connectionString: process.env.DATABASE_URL,
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: useSSL ? { rejectUnauthorized: true } : false,
  max: POOL_MAX,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  /**
   * ⚠️ Supabase connection pooler의 transaction 모드에서는 prepared statement가 깨진다.
   *    pooler가 매 트랜잭션마다 다른 백엔드 연결을 배정하므로, 앞선 연결에 준비해 둔
   *    statement가 다음 연결에 없어서 "prepared statement \"...\" does not exist"로
   *    실패한다. 이 프로젝트는 pg의 파라미터 쿼리($1, $2 ...)를 쓰는데, pg 드라이버는
   *    기본적으로 이걸 unnamed prepared statement로 보내 매번 새로 파싱되므로 대체로
   *    안전하다 — 다만 pooler 모드가 어긋나면 조용히 깨지는 종류의 실패라 배포 후
   *    Phase 4 검증 8번(동시 요청 시 prepared statement 오류)에서 반드시 확인해야 한다.
   *
   *    안전한 선택은 **session 모드 pooler(5432 포트)** 또는 직접 연결이다.
   *    transaction 모드(6543 포트)를 쓸 거면 위 실패를 먼저 재현 확인할 것.
   */
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
