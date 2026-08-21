/**
 * S7 2·3단계 — 검수 판정 기록 + 수정 반영 (FR-ADM-005 🚦, NFR-AI-012). DATABASE_URL이
 * 실제 RDS를 가리켜야 동작한다.
 * 사용법: npx ts-node --transpile-only src/batch/pipeline/run-apply-review.ts
 *
 * 선행: run-export-review.ts가 만든 review-sheet-{book}.csv를 사람이 채운 뒤 같은 경로에
 * 저장해 둔다. 적용 항목 중 하나라도 비어 있으면 해당 시트 전체를 반영하지 않는다
 * (부분 판정으로 기록을 남기지 않는다 — parseFilledReviewSheet가 즉시 실패한다).
 */
import * as dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import { pool } from '../../config/database';
import { parseFilledReviewSheet, applyReviewJudgments } from './review';

const BOOK_ID = 'takryu';

async function main(): Promise<void> {
  const sheetPath = path.join(__dirname, `../../../data/generated/full/review-sheet-${BOOK_ID}.csv`);
  const csv = fs.readFileSync(sheetPath, 'utf-8');

  const rows = parseFilledReviewSheet(csv);
  const corrections = rows.filter((r) => r.corrected_content !== null).length;

  await applyReviewJudgments(pool, BOOK_ID, rows);

  console.log(`[OK] 검수 판정 ${rows.length}건 기록, 수정 반영 ${corrections}건 (NFR-AI-012) — ${sheetPath}`);
  await pool.end();
}

main().catch((err) => {
  console.error('[FAIL] 검수 판정 반영 실패 — 시트를 고치고 재실행할 것', err);
  process.exit(1);
});
