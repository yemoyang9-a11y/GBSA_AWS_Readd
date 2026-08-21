/**
 * GET /books/{b}/ssabi/characters/{c} — FR-CHR-004·005, A5, D6
 *
 * 본문 인물명 탭과 노드 선택이 **같은 응답**을 쓴다.
 *
 * ⚠️ 이 테스트가 증명하는 것은 조립과 절단이지 상한 강제가 아니다.
 *    상한은 리포지토리의 쿼리 조건이 건다 (FR-SPL-002 🚦) — 여기 들어오는 입력은
 *    이미 기준점 이하다. 서비스가 페이지를 다시 판단하지 않는다는 것만 확인한다.
 */

import { createCharacterService } from '../../../src/modules/ssabi/character.service';
import type { SsabiRepository } from '../../../src/modules/ssabi/repository';
import type { Alias, Character, CharacterNote } from '../../../src/shared/types';

const JEONG: Character = {
  id: 'jeong',
  book_id: 'takryu',
  name: '정주사',
  first_appearance_page: 1,
};

// aliases 에는 대리키가 없다 — PK 가 (book_id, alias, character_id) 복합키다
function alias(characterId: string, text: string, page: number): Alias {
  return { character_id: characterId, alias: text, type: 'name', first_appearance_page: page };
}

function note(id: string, characterId: string, text: string, page: number): CharacterNote {
  return { id, character_id: characterId, note: text, source_page: page };
}

interface FakeOptions {
  character?: Character | null;
  aliases?: Alias[];
  notes?: CharacterNote[];
  /** 리포지토리가 실제로 받은 cutoff 를 기록한다 */
  seen?: number[];
}

function fakeRepo(options: FakeOptions = {}): SsabiRepository {
  const record = (cutoff: number) => options.seen?.push(cutoff);

  return {
    async findCharacters(_bookId, cutoff) {
      record(cutoff);
      return [];
    },
    async findLatestRelationships(_bookId, cutoff) {
      record(cutoff);
      return [];
    },
    async findAliases(_bookId, cutoff) {
      record(cutoff);
      return options.aliases ?? [];
    },
    async findCharacterNotes(_bookId, cutoff) {
      record(cutoff);
      return options.notes ?? [];
    },
    async getBackgroundKnowledge(_bookId, cutoff) {
      record(cutoff);
      return '';
    },
    async getCharacter(_bookId, _characterId, cutoff) {
      record(cutoff);
      return options.character === undefined ? JEONG : options.character;
    },
    async getGraph(_bookId, cutoff) {
      record(cutoff);
      return { nodes: [], edges: [] };
    },
    async getCharacterDetail(_bookId, _characterId, cutoff) {
      record(cutoff);
      return null;
    },
  };
}

describe('CharacterService', () => {
  test('인물·별칭·노트를 모아 상세를 만든다 (FR-CHR-004)', async () => {
    const service = createCharacterService({
      repository: fakeRepo({
        aliases: [alias('jeong', '정 주사', 1), alias('jeong', '주사', 2)],
        notes: [note('n1', 'jeong', '미두장에서 재산을 잃었다.', 3)],
      }),
    });

    const detail = await service.getCharacter('takryu', 'jeong', 20);

    expect(detail?.name).toBe('정주사');
    expect(detail?.first_appearance_page).toBe(1);
    expect(detail?.aliases.map((a) => a.alias)).toEqual(['정 주사', '주사']);
    expect(detail?.notes).toBe('미두장에서 재산을 잃었다.');
  });

  test('다른 인물의 별칭·노트가 섞이지 않는다', async () => {
    const service = createCharacterService({
      repository: fakeRepo({
        aliases: [alias('jeong', '정 주사', 1), alias('chobong', '초봉이', 3)],
        notes: [note('n1', 'jeong', '정주사 서술.', 3), note('n2', 'chobong', '초봉 서술.', 4)],
      }),
    });

    const detail = await service.getCharacter('takryu', 'jeong', 20);

    expect(detail?.aliases.map((a) => a.alias)).toEqual(['정 주사']);
    expect(detail?.notes).toBe('정주사 서술.');
  });

  test('A5 (자가 검증 13): 노트가 8문장을 넘으면 최초 1 + 최근 7 로 줄인다', async () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      note(`n${i + 1}`, 'jeong', `문장${i + 1}`, i + 1)
    );
    const service = createCharacterService({ repository: fakeRepo({ notes: many }) });

    const detail = await service.getCharacter('takryu', 'jeong', 20);

    // 앞에서 8개를 자르면 최근 서술이 통째로 사라진다 — 그게 아니어야 한다
    expect(detail?.notes).toBe('문장1 문장6 문장7 문장8 문장9 문장10 문장11 문장12');
    expect(detail?.notes.split(' ')).toHaveLength(8);
  });

  test('없는 인물은 null — 404 의 재료다', async () => {
    const service = createCharacterService({ repository: fakeRepo({ character: null }) });

    expect(await service.getCharacter('takryu', 'nope', 20)).toBeNull();
  });

  test('절대 규칙 7번: 서비스가 상한을 다시 판단하지 않는다 — 받은 cutoff 를 그대로 넘긴다', async () => {
    const seen: number[] = [];
    const service = createCharacterService({
      repository: fakeRepo({
        seen,
        aliases: [alias('jeong', '정 주사', 1)],
        notes: [note('n1', 'jeong', '서술.', 3)],
      }),
    });

    await service.getCharacter('takryu', 'jeong', 20);

    // 리포지토리를 부를 때마다 같은 K 가 들어간다. 서비스가 값을 만들거나 조정하지 않는다
    expect(seen.length).toBeGreaterThan(0);
    expect(new Set(seen)).toEqual(new Set([20]));
  });

  test('인물이 없으면 별칭·노트를 조회하지 않는다 — 헛일을 하지 않는다', async () => {
    const seen: number[] = [];
    const service = createCharacterService({
      repository: fakeRepo({ seen, character: null }),
    });

    await service.getCharacter('takryu', 'nope', 20);

    // getCharacter 한 번뿐
    expect(seen).toHaveLength(1);
  });
});
