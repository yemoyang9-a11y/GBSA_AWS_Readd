/**
 * S7 4단계 — 공개 전환 (FR-ADM-006, R12). DATABASE_URL이 실제 RDS를 가리켜야 동작한다.
 * 사용법: npx ts-node --transpile-only src/batch/pipeline/run-publish.ts
 *
 * 검수 미완료 상태에서 실행하면 books.publish_status를 바꾸지 않고 거절한다 —
 * 미완료 목록을 출력하니, 데이터를 손으로 고치지 말고 남은 대상을 검수 시트에서 마친 뒤
 * run-apply-review.ts로 반영하고 재실행할 것.
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { pool } from '../../config/database';
import { publishBook } from './review';

const BOOK_ID = 'takryu';

async function main(): Promise<void> {
  const report = await publishBook(pool, BOOK_ID);

  if (!report.complete) {
    console.error(`[FAIL] 검수 미완료 ${report.missing.length}건 — 공개 전환 거절 (FR-ADM-006)`);
    for (const item of report.missing) {
      console.error(
        `  - ${item.target_type}:${item.target_id} 누락 항목: ${item.missing_criteria.join(', ')}`
      );
    }
    await pool.end();
    process.exit(1);
  }

  console.log(`[OK] "${BOOK_ID}" 검수 전량 완료 — publish_status = published, ssabi_ready = true`);
  await pool.end();
}

main().catch((err) => {
  console.error('[FAIL] 공개 전환 실패', err);
  process.exit(1);
});
