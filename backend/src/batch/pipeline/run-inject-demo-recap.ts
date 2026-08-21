/**
 * S8 — 시연 위치 리캡 주입 실행 스크립트. DATABASE_URL이 실제 RDS를 가리켜야 동작한다.
 * 사용법: npx ts-node --transpile-only src/batch/pipeline/run-inject-demo-recap.ts <cutoff>
 *   예) npx ts-node --transpile-only src/batch/pipeline/run-inject-demo-recap.ts 100
 *
 * 선행: run-register.ts·run-register-content.ts로 장 경계·장 요약·페이지가 이미 등록돼 있어야 한다.
 *
 * device_id는 R1·R2·R4 합의로 고정한 시연용 값이다(2026-08-20 R2 확인) — 실제 시연 기기의
 * localStorage(ssabi.device_id)와 반드시 같은 값이어야 브리핑 화면에 주입된 리캡이 뜬다.
 *
 * 기준점을 여러 개(예: 100·150) 시연할 경우, saved_recap의 PK가 (device_id, book_id) 1행뿐이라
 * 두 번째 기준점을 주입하면 첫 번째 값을 덮어쓴다 — 리허설 중 각 시연 지점 직전에 그 지점의
 * cutoff로 이 스크립트를 다시 실행할 것.
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { pool } from '../../config/database';
import { call } from '../../modules/llm-gateway/gateway';
import { injectDemoRecap } from './recap';
import { parseJsonResponse } from './generate';

const BOOK_ID = 'takryu';
const DEVICE_ID = process.env.DEMO_DEVICE_ID || '11111111-1111-4111-8111-111111111111';

async function main(): Promise<void> {
  const cutoffArg = process.argv[2];
  const cutoff = cutoffArg ? parseInt(cutoffArg, 10) : NaN;
  if (!Number.isInteger(cutoff) || cutoff < 0) {
    console.error('[FAIL] 기준점(cutoff)을 정수로 지정할 것 — 예: run-inject-demo-recap.ts 100');
    process.exit(1);
  }

  const chapterCheck = (await pool.query(
    'SELECT count(*)::int AS n FROM chapters WHERE book_id = $1',
    [BOOK_ID]
  )) as {
    rows: { n: number }[];
  };
  if (chapterCheck.rows[0].n === 0) {
    console.error(
      `[FAIL] "${BOOK_ID}" 장 경계가 아직 등록되지 않음 — run-register.ts를 먼저 실행할 것`
    );
    process.exit(1);
  }

  console.log(
    `=== device_id=${DEVICE_ID}, book_id=${BOOK_ID}, cutoff=${cutoff} 리캡 주입 시작 ===`
  );

  const recap = await injectDemoRecap(
    pool,
    (prompt) => call('recap', prompt),
    (raw) => parseJsonResponse<{ recap: string }>(raw),
    { deviceId: DEVICE_ID, bookId: BOOK_ID, cutoff, title: '탁류', author: '채만식' }
  );

  console.log(`[OK] saved_recap upsert 완료 (cutoff_page=${cutoff})`);
  console.log(recap);
  await pool.end();
}

main().catch((err) => {
  console.error('[FAIL] 시연 리캡 주입 실패', err);
  process.exit(1);
});
