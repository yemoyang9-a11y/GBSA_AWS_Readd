/**
 * 시연 위치 상태 주입 실행 스크립트 — R1의 run-inject-demo-recap.ts와 짝을 이룬다.
 * DATABASE_URL이 실제 RDS를 가리켜야 동작한다.
 *
 * 사용법: npx ts-node src/batch/demo-seed/run-seed-demo-state.ts <cutoff>
 *   예) npx ts-node src/batch/demo-seed/run-seed-demo-state.ts 100
 *
 * R1의 스크립트는 saved_recap(저장 리캡)만 채운다 — 그건 스펙에 명시된 R1의 유일한
 * 예외 쓰기(architecture-r1.md 흐름 A "[데모] 시연 위치 저장 리캡 주입", UC-19 3번)다.
 * reading_position·reading_session은 R2 소유 테이블이라 R1이 쓰지 않는다 — 이 스크립트가
 * 그 절반을 채운다. 두 스크립트를 각 시연 지점 직전에 같은 cutoff로 실행할 것
 * (순서 무관 — 서로 다른 테이블).
 *
 * 이 스크립트가 하는 일:
 *   1. reading_position을 cutoff에 맞는 current_page로 직접 덮어쓴다
 *      (progressService.acceptProgressEvent가 아니라 리포지토리를 직접 써서 seq 단조
 *      증가 검사를 건너뛴다 — 리허설을 반복하면 이전 seq가 남아 있을 수 있다)
 *   2. reading_session 행을 지운다 — 다음 POST /entry가 "세션 레코드 없음"으로 판정해
 *      반드시 새 세션(route: 'briefing')으로 진입하게 만든다(R6). 지우지 않으면 방금
 *      그 기기로 리허설한 기록이 남아 30분 안에는 route: 'reader'로 브리핑을 건너뛴다.
 *
 * cutoff와 K는 같은 뜻이다 — R1 스크립트의 인자명과 맞춘다.
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { pool } from '../../config/database';
import { createPgReadingPositionRepository } from '../../modules/reading-state/pg-repository';

const BOOK_ID = 'takryu';
const DEVICE_ID = process.env.DEMO_DEVICE_ID || '11111111-1111-4111-8111-111111111111';

async function main(): Promise<void> {
  const cutoffArg = process.argv[2];
  const cutoff = cutoffArg ? parseInt(cutoffArg, 10) : NaN;
  if (!Number.isInteger(cutoff) || cutoff < 0) {
    console.error('[FAIL] 기준점(cutoff)을 0 이상 정수로 지정할 것 — 예: run-seed-demo-state.ts 100');
    process.exit(1);
  }

  const positions = createPgReadingPositionRepository({
    query: (sql, params) => pool.query(sql, params),
  });

  // cutoff = 레코드 없음 ? 0 : current_page 이므로 역산도 두 갈래다.
  // cutoff=0은 "책을 한 번도 열지 않음"이라 레코드를 지워야 재현된다 —
  // current_page=1을 써 넣으면 1페이지를 읽는 중(cutoff=1)이 되어 버린다.
  if (cutoff === 0) {
    await pool.query(`DELETE FROM reading_position WHERE device_id = $1 AND book_id = $2`, [
      DEVICE_ID,
      BOOK_ID,
    ]);
    console.log('[OK] reading_position 삭제 완료 — 책을 한 번도 열지 않은 상태 (cutoff=0)');
  } else {
    await positions.savePosition(DEVICE_ID, BOOK_ID, { current_page: cutoff, event_seq: 1 });
    console.log(`[OK] reading_position 주입 완료 — current_page=${cutoff} (cutoff=${cutoff})`);
  }

  // 세션 레코드 삭제 — 다음 POST /entry가 반드시 새 세션으로 판정하게 만든다 (R6)
  await pool.query(`DELETE FROM reading_session WHERE device_id = $1 AND book_id = $2`, [
    DEVICE_ID,
    BOOK_ID,
  ]);
  console.log('[OK] reading_session 리셋 완료 — 다음 진입은 반드시 브리핑을 경유한다');

  await pool.end();
}

main().catch((err) => {
  console.error('[FAIL] 시연 상태 주입 실패', err);
  process.exit(1);
});
