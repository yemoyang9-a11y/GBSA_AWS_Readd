/**
 * S7 1단계 — 검수 시트 내보내기 (FR-ADM-005 🚦). DATABASE_URL이 실제 RDS를 가리켜야 동작한다.
 * 사용법: npx ts-node --transpile-only src/batch/pipeline/run-export-review.ts
 *
 * 선행: run-register-content.ts로 생성물이 이미 등록돼 있어야 한다.
 * 이미 판정 기록이 있는 대상은 다시 내보내지 않는다(재실행해도 기존 판정을 덮어 쓰지 않음).
 */
import * as dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import { pool } from '../../config/database';
import { ResolvedBookData } from './check-integrity';
import { buildReviewSheetRows, toReviewSheetCsv, reviewKey, ReviewTargetType } from './review';

const BOOK_ID = 'takryu';

async function main(): Promise<void> {
  const filePath = path.join(__dirname, '../../../data/generated/full/all-resolved.json');
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as ResolvedBookData;

  const existing = (await pool.query('SELECT target_type, target_id FROM review_records WHERE book_id = $1', [BOOK_ID])) as {
    rows: { target_type: ReviewTargetType; target_id: string }[];
  };
  const alreadyReviewed = new Set(existing.rows.map((r) => reviewKey(r.target_type, r.target_id)));

  const rows = buildReviewSheetRows(data, alreadyReviewed);
  const csv = toReviewSheetCsv(rows);

  const outPath = path.join(__dirname, `../../../data/generated/full/review-sheet-${BOOK_ID}.csv`);
  fs.writeFileSync(outPath, csv, 'utf-8');

  console.log(`[OK] 검수 시트 ${rows.length}건 내보냄 (이미 검수된 ${alreadyReviewed.size}건은 제외) → ${outPath}`);
  await pool.end();
}

main().catch((err) => {
  console.error('[FAIL] 검수 시트 내보내기 실패', err);
  process.exit(1);
});
