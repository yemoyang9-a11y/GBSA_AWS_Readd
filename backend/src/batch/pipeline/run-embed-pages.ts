/**
 * S6 — 페이지 임베딩 배치 적재. DATABASE_URL이 실제 RDS를 가리켜야 동작한다.
 * 사용법: npx ts-node --transpile-only src/batch/pipeline/run-embed-pages.ts
 *
 * 선행: run-register.ts로 페이지가 이미 등록돼 있어야 한다.
 * 청킹 없음 — 페이지 1장 = 검색 단위 1개(5.3절, 1:1). embedding이 NULL인 페이지만
 * 처리하므로 재시작해도 이미 끝난 페이지는 재호출하지 않는다(S4와 동일한 재개 방식).
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { pool } from '../../config/database';
import { embedText, toVectorLiteral, EMBEDDING_DIM } from './embed';

const BOOK_ID = 'takryu';

async function main(): Promise<void> {
  const pending = (await pool.query(
    'SELECT page_no, content FROM pages WHERE book_id = $1 AND embedding IS NULL ORDER BY page_no',
    [BOOK_ID]
  )) as { rows: { page_no: number; content: string }[] };

  console.log(
    `=== "${BOOK_ID}" 임베딩 대상 ${pending.rows.length}페이지 (이미 완료된 페이지는 건너뜀) ===`
  );

  for (const page of pending.rows) {
    const embedding = await embedText(page.content);
    await pool.query(
      'UPDATE pages SET embedding = $1::vector WHERE book_id = $2 AND page_no = $3',
      [toVectorLiteral(embedding), BOOK_ID, page.page_no]
    );
    console.log(`  [완료] ${page.page_no}페이지`);
  }

  // V5 — 임베딩이 있는 페이지 수 == 전체 페이지 수 (누락 0)
  const remaining = (await pool.query(
    'SELECT count(*)::int AS n FROM pages WHERE book_id = $1 AND embedding IS NULL',
    [BOOK_ID]
  )) as { rows: { n: number }[] };

  if (remaining.rows[0].n > 0) {
    console.error(`[FAIL] V5 위반 — 임베딩 누락 ${remaining.rows[0].n}페이지`);
    process.exit(1);
  }

  console.log(`[OK] "${BOOK_ID}" 전체 페이지 임베딩 완료 (${EMBEDDING_DIM}차원)`);
  await pool.end();
}

main().catch((err) => {
  console.error('[FAIL] 페이지 임베딩 실패', err);
  process.exit(1);
});
