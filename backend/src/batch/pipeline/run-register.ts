/**
 * 원문 등록 실행 스크립트 — DATABASE_URL이 실제 RDS를 가리켜야 동작한다.
 * 사용법: npx ts-node src/batch/pipeline/run-register.ts
 *
 * 선행: migrations/001_content_store.sql 적용 필요.
 */
import * as dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import { pool } from '../../config/database';
import { splitBook, validateSplit } from './split';
import { registerBook } from './register';

const BOOK_ID = 'takryu';

async function main(): Promise<void> {
  const filePath = path.join(__dirname, '../../../data/raw/takryu.txt');
  const rawText = fs.readFileSync(filePath, 'utf-8');

  const { pages, chapters } = splitBook(rawText, BOOK_ID);
  const report = validateSplit(pages, chapters, rawText);
  if (
    report.coverageViolations > 0 ||
    report.crossChapterViolations > 0 ||
    report.midSentenceViolations > 0
  ) {
    console.error('[FAIL] 게이트 위반이 있어 등록을 진행하지 않는다', report);
    process.exit(1);
  }

  await registerBook(
    pool,
    {
      book_id: BOOK_ID,
      title: '탁류',
      author: '채만식',
      publish_year: 1937, // 조선일보 연재 시작년(1937.10.12~1938.5.17) — R4 회신 반영
      extent: `${pages.length}페이지`,
    },
    chapters,
    pages
  );

  console.log(`[OK] ${BOOK_ID} 등록 완료 — 장 ${chapters.length}개, 페이지 ${pages.length}개`);
  await pool.end();
}

main().catch((err) => {
  console.error('[FAIL] 원문 등록 실패', err);
  process.exit(1);
});
