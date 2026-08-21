/**
 * GET /books/:bookId/ssabi/characters/:characterId — 인물 상세 (R4, Task 8)
 *
 * 조항: FR-CHR-004(본문 인물명 탭)·FR-CHR-005 · A5(노트 8문장) · D6(별칭 상한)
 *
 * 본문 인물명 탭과 관계도 노드 선택이 **같은 응답**을 쓴다 — 두 경로가 다른 모양을 받으면
 * 화면이 분기를 만들게 되고, 그 분기가 곧 판별 코드가 된다.
 *
 * ⚠️ 여기서 상한을 걸지 않는다. `cutoff` 를 리포지토리에 그대로 넘기고, 페이지 비교는
 *    쿼리 조건이 한다 (FR-SPL-002 🚦, R4 불변식). 서비스가 페이지를 다시 판단하면
 *    그 자체가 기준점 초과 여부를 "판별"하는 코드다 (절대 규칙 7번).
 *
 * ⚠️ 노트 절단은 `truncateNotes` 순수 함수가 한다. 어댑터에서 `slice(0, 8)` 로 앞 8개를
 *    남기면 A5 가 요구하는 **최초 1 + 최근 7** 이 되지 않고 최근 서술이 통째로 사라진다
 *    (자가 검증 13번). 절단은 상한이 아니라 표시 규칙이므로 SQL 이 아닌 순수 함수에 둔다.
 */

import type { CharacterDetail } from '../../shared/types';
import { truncateNotes } from './notes';
import type { SsabiRepository } from './repository';

export interface CharacterServiceDeps {
  repository: SsabiRepository;
}

export interface CharacterService {
  /**
   * 인물 상세 조회
   *
   * @param cutoff - R2 스냅샷의 기준점. 서비스는 이 값을 만들지도 조정하지도 않는다
   * @returns 기준점 이하에서 아직 등장하지 않은 인물이면 null (404 의 재료)
   */
  getCharacter(
    bookId: string,
    characterId: string,
    cutoff: number
  ): Promise<CharacterDetail | null>;
}

export function createCharacterService(deps: CharacterServiceDeps): CharacterService {
  const { repository } = deps;

  return {
    async getCharacter(
      bookId: string,
      characterId: string,
      cutoff: number
    ): Promise<CharacterDetail | null> {
      // FR-SPL-002 🚦: 최초 등장 <= cutoff 인 인물만 돌아온다. 없으면 여기서 끝낸다
      const character = await repository.getCharacter(bookId, characterId, cutoff);
      if (character === null) return null;

      const [allAliases, allNotes] = await Promise.all([
        repository.findAliases(bookId, cutoff),
        repository.findCharacterNotes(bookId, cutoff),
      ]);

      // 리포지토리는 도서 단위로 준다 — 이 인물의 것만 고른다.
      // 페이지 비교가 아니라 소유자 비교이므로 상한 판별이 아니다
      const aliases = allAliases.filter((a) => a.character_id === characterId);
      const notes = allNotes.filter((n) => n.character_id === characterId);

      return {
        name: character.name,
        first_appearance_page: character.first_appearance_page,
        aliases,
        notes: truncateNotes(notes), // A5 — 최대 8문장, 초과 시 최초 1 + 최근 7
      };
    },
  };
}
