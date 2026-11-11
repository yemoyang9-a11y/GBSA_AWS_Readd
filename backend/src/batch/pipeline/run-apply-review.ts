/**
 * S7 2·3단계 — 검수 판정 기록 + 수정 반영 (FR-ADM-005 🚦, NFR-AI-012). DATABASE_URL이
 * 실제 RDS를 가리켜야 동작한다.
 * 사용법: npx ts-node --transpile-only src/batch/pipeline/run-apply-review.ts [--book <bookId>]
 *
 * 선행: run-export-review.ts가 만든 review-sheet-{book}.csv를 사람이 채운 뒤 같은 경로에
 * 저장해 둔다. 적용 항목 중 하나라도 비어 있으면 해당 시트 전체를 반영하지 않는다
 * (부분 판정으로 기록을 남기지 않는다 — parseFilledReviewSheet가 즉시 실패한다).
 */
import * as dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import { pool } from '../../config/database';
import { parseFilledReviewSheet, applyReviewJudgments } from './review';
import { QueryClient } from './register';
import { BookArgs, bookArgsFromCli, reviewSheetPath } from './run-args';

// FR-ADM-005 🚦
export async function applyReviewSheet(
  db: { connect(): Promise<QueryClient & { release(): void }> },
  args: BookArgs
): Promise<{ sheetPath: string; rows: number; corrections: number }> {
  const sheetPath = reviewSheetPath(args);
  const csv = fs.readFileSync(sheetPath, 'utf-8');

  const rows = parseFilledReviewSheet(csv, args.bookId);
  const corrections = rows.filter((r) => r.corrected_content !== null).length;

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await applyReviewJudgments(client, args.bookId, rows);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return { sheetPath, rows: rows.length, corrections };
}

async function main(): Promise<void> {
  const result = await applyReviewSheet(pool, bookArgsFromCli('run-apply-review'));
  console.log(
    `[OK] 검수 판정 ${result.rows}건 기록, 수정 반영 ${result.corrections}건 (NFR-AI-012) — ${result.sheetPath}`
  );
  await pool.end();
}

if (require.main === module)
  main().catch((err) => {
    console.error('[FAIL] 검수 판정 반영 실패 — 시트를 고치고 재실행할 것', err);
    process.exit(1);
  });
