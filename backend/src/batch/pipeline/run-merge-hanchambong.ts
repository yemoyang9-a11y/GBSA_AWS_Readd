/**
 * 인물 관계도에서 "한참봉"과 "탑삭부리 한참봉"이 동일 인물인데 별개 노드로 쪼개져 있던 문제
 * 백필 실행 스크립트. 사용법: npx ts-node --transpile-only src/batch/pipeline/run-merge-hanchambong.ts
 *
 * 2026-08-27 확인 — 두 노드 모두 개복동 싸전가게 주인·고태수의 하숙집 주인·김씨의 남편이라는
 * 동일한 사실을 관계 간선으로 각각 갖고 있었음(1장 12p "한참봉"으로 첫 소개, 5장 79p "탑삭부리
 * 한참봉"이라는 더 긴 호칭으로 재등장했을 때 엔티티 추출이 별개 인물로 새로 만든 것).
 * survivor: 한참봉(428b1fb4, 첫 등장 12p — 더 이른 시점) / merged: 탑삭부리 한참봉(06d0b46a).
 *
 * 처리 내역:
 *  - "탑삭부리 한참봉"(merged의 이름 자체)과 "바깥주인"을 survivor 별칭으로 편입.
 *    merged가 갖고 있던 "한참봉" 별칭은 survivor의 이름 자체와 같은 문자열이라 편입하지 않음.
 *  - merged의 노트 3건(79·195·197p)은 survivor 노트로 전부 이동 — survivor 기존 노트(13·13·24p)
 *    와 내용이 겹치지 않아(별개 사실을 서술) 정리 없이 그대로 유지.
 *  - 중복 간선 4건 삭제: "하숙인과 집주인"@24, "부부"@80, "하숙인과 하숙집 주인"@82, "기숙처"@106
 *    — survivor가 이미 갖고 있던 "하숙 관계(한참봉 집에서 하숙중)"@17, "부부 관계"@16과
 *    같은 사실의 재서술이라 더 이른 시점 것만 남김.
 *  - 오류 간선 1건 삭제: "남편과 첩"@80(merged↔유씨/2ab84636) — 원문(79~80p 근방)을 대조하면
 *    이 첩은 한참봉 본인의 첩이지 정주사의 아내 유씨가 아님. 유씨 노드에 잘못 연결된 것으로
 *    보이는 별개의 엔티티 해석 오류라 이번 병합에서 살리지 않고 삭제만 함(유씨 쪽 노드 자체나
 *    "한참봉에게 이름 없는 첩이 있다"는 사실의 별도 인물화는 이번 스코프 밖 — 조치하지 않음).
 *  - 살릴 간선 2건은 survivor로 재배선: 초봉이-merged "친구의 딸과 부모의 지인"@90,
 *    형보-merged "고자질꾼"@189.
 *
 * DELETE/UPDATE 전부 존재하지 않는 id를 대상으로 해도 no-op이라 재실행해도 안전하다.
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { pool } from '../../config/database';
import { mergeCharacters } from './merge-characters';

const BOOK_ID = 'takryu';

const SURVIVOR_ID = '428b1fb4-e27d-4a6e-89ef-649c9fe2cb12'; // 한참봉
const MERGED_ID = '06d0b46a-3faf-49e6-b65b-96e679b5d795'; // 탑삭부리 한참봉

async function main(): Promise<void> {
  await mergeCharacters(pool, BOOK_ID, {
    survivorId: SURVIVOR_ID,
    mergedId: MERGED_ID,
    aliasesToAdd: [
      { alias: '탑삭부리 한참봉', aliasType: 'nickname', firstAppearancePage: 79 },
      { alias: '바깥주인', aliasType: 'kinship', firstAppearancePage: 79 },
    ],
    relationshipIdsToRepoint: [
      'd83fa228-be26-4f9d-a189-22d66779972e', // 초봉이-한참봉 "친구의 딸과 부모의 지인"@90
      '67c80324-4147-4aa3-8de1-ffb36de39b47', // 형보-한참봉 "고자질꾼"@189
    ],
    relationshipIdsToDelete: [
      '01be9659-036f-4321-bbd3-aa94ada88e2b', // 태수-한참봉 "하숙인과 집주인"@24 (중복)
      '6769fce8-bdf0-4dc6-907a-16572502a48d', // 한참봉-김씨 "부부"@80 (중복)
      '90571bf3-8540-47a3-bd50-64fe3b62fc96', // 태수-한참봉 "하숙인과 하숙집 주인"@82 (중복)
      '9a19dde0-2d09-41c0-b89d-0d6edd879844', // 한참봉-태수 "기숙처"@106 (중복)
      'bdedacbb-cabf-418c-a318-5b198b1e6e09', // 한참봉-유씨 "남편과 첩"@80 (별개 오류, 폐기)
    ],
  });
  console.log(`[OK] ${BOOK_ID} "한참봉"/"탑삭부리 한참봉" 병합 완료 (survivor=${SURVIVOR_ID})`);
  await pool.end();
}

main().catch((err) => {
  console.error('[FAIL] 한참봉 병합 실패', err);
  process.exit(1);
});
