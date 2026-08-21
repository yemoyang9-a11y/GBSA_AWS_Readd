/**
 * 인물 노트 표시 상한 — A5 (8/19 팀 확정)
 *
 * 조회 표시는 기준점 이하 중 최대 8문장, 초과 시 **최초 1문장 + 최근 7문장**.
 * 서술 1문장 = 근거 페이지 1개이고, 여러 페이지에 걸친 서술은 이른 페이지에 귀속된다.
 *
 * ⚠️ 절단은 서버가 한다. 프론트는 받은 문자열을 그대로 렌더한다 (handoff-r4.md §5 A5).
 * ⚠️ 입력은 이미 `source_page <= K` 로 걸러지고 오름차순 정렬된 행들이다 —
 *    이 함수는 상한을 거는 곳이 아니라 **이미 걸러진 것을 줄이는** 곳이다.
 *    기준점 필터는 리포지토리의 쿼리 조건이 담당한다 (FR-SPL-002 🚦, R4 불변식).
 *
 * 순수 함수로 떼어 둔 이유 — 자가 검증 13·14 는 K 별 경계를 문장 수로 확인해야 하는데,
 * DB 나 서비스에 묶여 있으면 fixture 만으로 그 경계를 짚기 어렵다.
 */

import type { CharacterNote } from '../../shared/types';

/** 표시 상한 문장 수 (A5) */
const MAX_SENTENCES = 8;

export function truncateNotes(notes: CharacterNote[]): string {
  const sentences = notes.map((note) => note.note);

  if (sentences.length <= MAX_SENTENCES) {
    return sentences.join(' ');
  }

  // 최초 1문장 + 최근 7문장 — 인물의 도입부 맥락을 잃지 않으면서 최신 서술을 보여준다
  const first = sentences[0];
  const recent = sentences.slice(-(MAX_SENTENCES - 1));
  return [first, ...recent].join(' ');
}
