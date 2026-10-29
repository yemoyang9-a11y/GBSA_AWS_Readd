/**
 * DB 저장 용량 스냅샷 (비용 실측 P1·P3·P4) — VACUUM ANALYZE 후 DB 전체 크기와
 * public 테이블별 크기(TOAST·인덱스 포함)를 measurements/db-size/<label>.json 에 남긴다.
 *
 * 사용: node scripts/db-size-snapshot.js --label <이름>
 *
 * 로컬 측정 DB(127.0.0.1:5433/readd_cost)가 아니면 실행을 거부한다 — VACUUM은 쓰기 작업이고,
 * 운영 DB에 붙은 사고가 있었다(lessons.md 1항). 같은 label 파일이 이미 있으면 덮어쓰지 않는다.
 */
require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '../../measurements/db-size');
const ALLOWED = { hosts: ['127.0.0.1', 'localhost'], port: '5433', database: 'readd_cost' };

/** DATABASE_URL이 측정 DB인지 확인하고, 비밀번호를 가린 표시용 문자열을 돌려준다 */
function assertMeasurementDb(databaseUrl) {
  if (!databaseUrl) throw new Error('DATABASE_URL 이 없다');
  const url = new URL(databaseUrl);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  const target = `${url.hostname}:${url.port}/${database}`;
  if (
    !ALLOWED.hosts.includes(url.hostname) ||
    url.port !== ALLOWED.port ||
    database !== ALLOWED.database
  ) {
    throw new Error(`측정 DB(127.0.0.1:5433/readd_cost)가 아니라 거부한다: ${target}`);
  }
  return target;
}

async function snapshot(label) {
  if (!label || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(label)) {
    throw new Error('사용: node scripts/db-size-snapshot.js --label <이름> (영문·숫자·._-)');
  }
  const target = assertMeasurementDb(process.env.DATABASE_URL);
  console.log(`DATABASE_URL → ${target}`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, `${label}.json`);
  if (fs.existsSync(outPath)) throw new Error(`이미 있는 스냅샷이다 — 다른 label을 쓸 것: ${outPath}`);

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const vacuumStart = Date.now();
    await client.query('VACUUM ANALYZE');
    const vacuumMs = Date.now() - vacuumStart;

    const db = await client.query(
      'SELECT current_database() AS name, pg_database_size(current_database())::bigint AS bytes'
    );
    // total = 힙 + TOAST + 인덱스(HNSW 포함)
    const tables = await client.query(`
      SELECT c.relname AS table,
             pg_total_relation_size(c.oid)::bigint AS total_bytes,
             pg_relation_size(c.oid)::bigint AS heap_bytes,
             pg_indexes_size(c.oid)::bigint AS index_bytes,
             c.reltuples::bigint AS estimated_rows
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
       ORDER BY pg_total_relation_size(c.oid) DESC, c.relname`);

    const result = {
      label,
      takenAt: new Date().toISOString(),
      database: db.rows[0].name,
      target,
      vacuumAnalyzeMs: vacuumMs,
      databaseBytes: Number(db.rows[0].bytes),
      tables: tables.rows.map((r) => ({
        table: r.table,
        totalBytes: Number(r.total_bytes),
        heapBytes: Number(r.heap_bytes),
        indexBytes: Number(r.index_bytes),
        toastAndOtherBytes: Number(r.total_bytes) - Number(r.heap_bytes) - Number(r.index_bytes),
        estimatedRows: Number(r.estimated_rows),
      })),
    };
    fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    console.log(`[OK] ${outPath} — DB ${result.databaseBytes} bytes, 테이블 ${result.tables.length}개`);
    return result;
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--label');
  snapshot(i === -1 ? undefined : argv[i + 1]).catch((err) => {
    console.error('[FAIL]', err.message);
    process.exit(1);
  });
}

module.exports = { assertMeasurementDb, snapshot };
