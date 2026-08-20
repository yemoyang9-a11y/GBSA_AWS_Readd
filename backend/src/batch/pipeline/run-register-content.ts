/**
 * S4/S5 산출물(all-resolved.json) 등록 실행 스크립트 — DATABASE_URL이 실제 RDS를 가리켜야 동작한다.
 * 사용법: npx ts-node --transpile-only src/batch/pipeline/run-register-content.ts
 *
 * 선행: run-register.ts로 도서·장·페이지가 이미 등록돼 있어야 한다(chapter_summaries FK).
 */
import * as fs from 'fs';
import * as path from 'path';
import { pool } from '../../config/database';
import { checkIntegrity, ResolvedBookData } from './check-integrity';
import { registerGeneratedContent } from './register';

const BOOK_ID = 'takryu';

async function main(): Promise<void> {
  const filePath = path.join(__dirname, '../../../data/generated/full/all-resolved.json');
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as ResolvedBookData;

  const bookResult = (await pool.query('SELECT total_pages FROM books WHERE book_id = $1', [BOOK_ID])) as {
    rows: { total_pages: number }[];
  };
  if (bookResult.rows.length === 0) {
    console.error(`[FAIL] "${BOOK_ID}" 도서가 아직 등록되지 않음 — run-register.ts를 먼저 실행할 것`);
    process.exit(1);
  }
  const totalPages = bookResult.rows[0].total_pages;

  const report = checkIntegrity(data, totalPages);
  if (!report.ok) {
    console.error('[FAIL] hard 위반이 있어 등록을 진행하지 않는다 — 데이터를 고치지 말고 생성 프롬프트를 고쳐 재실행할 것', report.issues);
    process.exit(1);
  }
  if (report.issues.length > 0) {
    console.warn(`[WARN] review 대상 ${report.issues.length}건 — 등록은 진행하되 S7 검수에서 반드시 확인할 것`, report.issues);
  }

  await registerGeneratedContent(pool, data);

  console.log(
    `[OK] ${BOOK_ID} 생성물 등록 완료 — 장 요약 ${data.chapter_summaries.length}개, ` +
      `인물 ${data.characters.length}명, 관계 ${data.relationships.length}건, ` +
      `용어 ${data.terms.length}개, 사건 ${data.events.length}건`
  );
  await pool.end();
}

main().catch((err) => {
  console.error('[FAIL] 생성물 등록 실패', err);
  process.exit(1);
});
