/**
 * 원문 등록 실행 스크립트 — DATABASE_URL이 실제 RDS를 가리켜야 동작한다.
 * 사용법: npx ts-node src/batch/pipeline/run-register.ts
 *        [--book <bookId> --file <원문 경로> --title <제목> --author <저자> --year <연도>]
 *        인자가 없으면 takryu(「탁류」) — run-args.ts 참조
 *
 * 선행: migrations/001_content_store.sql 적용 필요.
 */
import * as dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import { pool } from '../../config/database';
import { splitBook, validateSplit } from './split';
import { registerBook } from './register';
import { bookArgsFromCli, requireBookMeta } from './run-args';

async function main(): Promise<void> {
  const args = bookArgsFromCli('run-register');
  const BOOK_ID = args.bookId;
  const { title, author } = requireBookMeta(args);
  const rawText = fs.readFileSync(args.filePath, 'utf-8');

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
      title,
      author,
      publish_year: args.publishYear, // takryu 기본값은 run-args.ts 참조
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
