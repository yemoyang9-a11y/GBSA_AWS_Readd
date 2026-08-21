/**
 * S7 1단계 — 검수 시트 내보내기 (FR-ADM-005 🚦). DATABASE_URL이 실제 RDS를 가리켜야 동작한다.
 * 사용법: npx ts-node --transpile-only src/batch/pipeline/run-export-review.ts
 *
 * 선행: run-register-content.ts로 생성물이 이미 등록돼 있어야 한다.
 * 이미 검수를 통과(적용 항목 전부 TRUE)한 대상은 다시 내보내지 않는다(재실행해도 통과분은 보존).
 * FALSE로 판정된 대상은 통과가 아니므로 다시 내보내 재제출받는다.
 */
import * as dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import { pool } from '../../config/database';
import { ResolvedBookData } from './check-integrity';
import {
  buildReviewSheetRows,
  toReviewSheetCsv,
  passedReviewKeys,
  ALL_CRITERIA,
  ReviewRecordRow,
} from './review';

const BOOK_ID = 'takryu';

async function main(): Promise<void> {
  const filePath = path.join(__dirname, '../../../data/generated/full/all-resolved.json');
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as ResolvedBookData;

  const existing = (await pool.query(
    `SELECT target_type, target_id, ${ALL_CRITERIA.join(', ')} FROM review_records WHERE book_id = $1`,
    [BOOK_ID]
  )) as { rows: ReviewRecordRow[] };
  const alreadyReviewed = passedReviewKeys(existing.rows);

  const rows = buildReviewSheetRows(data, alreadyReviewed);
  const csv = toReviewSheetCsv(rows);

  const outPath = path.join(__dirname, `../../../data/generated/full/review-sheet-${BOOK_ID}.csv`);
  fs.writeFileSync(outPath, csv, 'utf-8');

  console.log(
    `[OK] 검수 시트 ${rows.length}건 내보냄 (검수 통과 ${alreadyReviewed.size}건은 제외) → ${outPath}`
  );
  await pool.end();
}

main().catch((err) => {
  console.error('[FAIL] 검수 시트 내보내기 실패', err);
  process.exit(1);
});
