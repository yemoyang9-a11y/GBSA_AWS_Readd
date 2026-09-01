/**
 * S6 — 페이지 임베딩 배치 적재. DATABASE_URL이 대상 DB를 가리켜야 동작한다.
 * 사용법: npx ts-node --transpile-only src/batch/pipeline/run-embed-pages.ts
 *
 * 선행: run-register.ts로 페이지가 이미 등록돼 있어야 한다.
 * 청킹 없음 — 페이지 1장 = 검색 단위 1개(5.3절, 1:1). embedding이 NULL인 페이지만
 * 처리하므로 재시작해도 이미 끝난 페이지는 재호출하지 않는다(S4와 동일한 재개 방식).
 *
 * 2026-08-30 (Cohere 이관) — **페이지마다 1회씩 부르던 것을 배치로 묶었다.**
 * Titan 시절엔 호출 수가 문제되지 않았지만, Cohere 체험 티어는 **월 1,000회**가
 * 한도라 411페이지를 낱개로 부르면 한 번 돌리는 데 한도의 41%를 쓴다. 재실행하면
 * 바로 한도에 걸린다. 96건씩 묶으면 「탁류」 전권이 5회로 끝난다.
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { pool } from '../../config/database';
import { embedDocuments, toVectorLiteral, EMBEDDING_DIM, EMBED_BATCH_SIZE } from './embed';

const BOOK_ID = 'takryu';

async function main(): Promise<void> {
  const pending = (await pool.query(
    'SELECT page_no, content FROM pages WHERE book_id = $1 AND embedding IS NULL ORDER BY page_no',
    [BOOK_ID]
  )) as { rows: { page_no: number; content: string }[] };

  const batchCount = Math.ceil(pending.rows.length / EMBED_BATCH_SIZE);
  console.log(
    `=== "${BOOK_ID}" 임베딩 대상 ${pending.rows.length}페이지 ` +
      `(${EMBED_BATCH_SIZE}건씩 ${batchCount}회 호출, 이미 완료된 페이지는 건너뜀) ===`
  );

  for (let offset = 0; offset < pending.rows.length; offset += EMBED_BATCH_SIZE) {
    const batch = pending.rows.slice(offset, offset + EMBED_BATCH_SIZE);
    const embeddings = await embedDocuments(batch.map((p) => p.content));

    // 응답 순서가 요청 순서와 같다는 보장에 기대지 않도록, 개수만 먼저 확인하고
    // 인덱스로 짝지어 넣는다. embedding.ts가 개수 불일치를 이미 예외로 막지만
    // 여기서 한 번 더 확인해야 잘못된 벡터가 엉뚱한 페이지에 들어가는 걸 막는다.
    if (embeddings.length !== batch.length) {
      throw new Error(
        `임베딩 개수 불일치: 요청 ${batch.length}건, 응답 ${embeddings.length}건`
      );
    }

    // 한 배치를 한 트랜잭션으로 넣는다 — 중간에 끊기면 그 배치는 통째로 롤백되고,
    // 다음 실행에서 embedding IS NULL 로 다시 잡힌다(재개 방식 유지).
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < batch.length; i++) {
        await client.query(
          'UPDATE pages SET embedding = $1::vector WHERE book_id = $2 AND page_no = $3',
          [toVectorLiteral(embeddings[i]), BOOK_ID, batch[i].page_no]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    console.log(
      `  [완료] ${batch[0].page_no}~${batch[batch.length - 1].page_no}페이지 ` +
        `(${offset + batch.length}/${pending.rows.length})`
    );
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
