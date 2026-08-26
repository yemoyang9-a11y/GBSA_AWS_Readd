/**
 * 인물 관계도에 잘못 섞여 들어간 비인물 노드 제거 실행 스크립트.
 * 사용법: npx ts-node --transpile-only src/batch/pipeline/run-remove-non-person-characters.ts
 *
 * 2026-08-26 확인 — all-resolved.json 57개 인물 노트 전수 확인 결과 회사·점포·주소 표현이 인물로
 * 잘못 추출되어 있었음:
 *   - 농산흥업회사: 고태수가 위조 소절수를 만든 대상 "회사"
 *   - 마루나: 형보가 근무하는 "중매점"
 *   - 제중당: 초봉이·박제호가 일하는 "약국"(직장)
 *   - 부주전상백: 초봉이가 유서 겉봉에 쓴 수취인 호칭 — 정주사를 가리키는 표현이라 별도 인물이
 *     아님. 정주사의 별칭(type: title)으로 all-resolved.json에 편입해뒀으므로 이 스크립트는
 *     기존 노드만 지운다.
 *
 * all-resolved.json에서도 위 4건은 이미 제외해뒀다 — 이 스크립트는 과거에 이미 register된
 * DB(로컬 Docker/RDS)에 남아있는 행을 지우는 일회성 백필이다. DELETE는 존재하지 않는 id를
 * 지워도 no-op이라 재실행해도 안전하다.
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { pool } from '../../config/database';
import { removeCharacters } from './remove-characters';

const BOOK_ID = 'takryu';

const TARGET_CHARACTER_IDS = [
  '6ea8be7b-57af-47d9-a73e-ee911a6f18eb', // 농산흥업회사
  '87c52374-c41c-4943-be89-ba7c1d77083d', // 마루나
  '84dd35ae-2e08-4984-80e0-e134c1b9c461', // 제중당
  '6df96131-8385-4603-83d7-e92fac806722', // 부주전상백
];

async function main(): Promise<void> {
  await removeCharacters(pool, BOOK_ID, TARGET_CHARACTER_IDS);
  console.log(
    `[OK] ${BOOK_ID} 비인물 노드 ${TARGET_CHARACTER_IDS.length}건 제거 완료 (및 그 별칭·노트·관계 간선)`
  );
  await pool.end();
}

main().catch((err) => {
  console.error('[FAIL] 비인물 노드 제거 실패', err);
  process.exit(1);
});
