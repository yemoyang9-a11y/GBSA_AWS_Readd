/**
 * S5 실행기 — S4 산출물(all-resolved.json)에 정합성 제약 검증을 돌린다.
 *
 * hard 위반이 있으면 실패 종료(register 단계로 넘기면 안 됨).
 * review 항목은 data/generated/full/integrity-report.json에 남겨 S7 검수에서 쓴다.
 *
 * 사용법: npx ts-node --transpile-only src/batch/pipeline/run-check-integrity.ts [--book <bookId> --file <원문 경로>]
 */
import * as fs from 'fs';
import * as path from 'path';
import { checkIntegrity, ResolvedBookData } from './check-integrity';
import { splitBook } from './split';
import { bookArgsFromCli } from './run-args';

function main(): void {
  const args = bookArgsFromCli('run-check-integrity');
  const OUT_DIR = args.fullDir;
  const combinedPath = path.join(OUT_DIR, 'all-resolved.json');
  const data = JSON.parse(fs.readFileSync(combinedPath, 'utf-8')) as ResolvedBookData;
  if (data.book_id !== args.bookId) throw new Error('Artifact book_id mismatch');

  const rawText = fs.readFileSync(args.filePath, 'utf-8');
  const { pages } = splitBook(rawText, data.book_id);
  const totalPages = pages.length;

  const report = checkIntegrity(data, totalPages);

  const hard = report.issues.filter((i) => i.severity === 'hard');
  const review = report.issues.filter((i) => i.severity === 'review');

  console.log(`=== S5 정합성 검증 — 총 페이지 ${totalPages} ===`);
  console.log(`hard 위반: ${hard.length}건, review 항목: ${review.length}건\n`);

  if (hard.length > 0) {
    console.error('[HARD 위반 — register 단계로 넘기면 안 됨]');
    for (const i of hard) console.error(`  - [${i.rule}] ${i.message}`);
  }
  if (review.length > 0) {
    console.warn('\n[REVIEW 항목 — S7 검수 대상]');
    for (const i of review) console.warn(`  - [${i.rule}] ${i.message}`);
  }

  const reportPath = path.join(OUT_DIR, 'integrity-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\n=== 저장됨: ${reportPath} ===`);

  if (!report.ok) {
    process.exit(1);
  }
}

main();
