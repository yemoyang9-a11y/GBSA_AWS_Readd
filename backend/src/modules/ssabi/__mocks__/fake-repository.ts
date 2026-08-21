/**
 * Fake 싸비 리포지토리 (테스트용)
 *
 * FR-SPL-002 🚦 게이트 테스트를 위한 fixture 기반 구현
 *
 * ⚠️ G1 제약: 모든 메서드가 cutoff 인자를 갖는다
 */

import type {
  Character,
  Relationship,
  Alias,
  CharacterNote,
  RelationshipGraph,
  CharacterDetail,
} from '../../../shared/types';
import type { SsabiRepository } from '../repository';

/**
 * Fixture 데이터
 */
export interface SsabiFixture {
  characters: Character[];
  relationships: Relationship[];
  aliases: Alias[];
  characterNotes: CharacterNote[];
  backgroundKnowledge: string;
}

/**
 * Fake 싸비 리포지토리
 *
 * Fixture 데이터를 cutoff 기준으로 필터링
 */
export class FakeSsabiRepository implements SsabiRepository {
  constructor(private fixture: SsabiFixture) {}

  async findCharacters(bookId: string, cutoff: number): Promise<Character[]> {
    // FR-SPL-002 🚦: 최초 등장 페이지 <= cutoff
    return this.fixture.characters.filter(
      (c) => c.book_id === bookId && c.first_appearance_page <= cutoff
    );
  }

  async findLatestRelationships(bookId: string, cutoff: number): Promise<Relationship[]> {
    // FR-SPL-002 🚦: 확립 페이지 <= cutoff
    const filtered = this.fixture.relationships.filter(
      (r) => r.book_id === bookId && r.established_page <= cutoff
    );

    // A6: 같은 쌍의 최신 라벨만 (established_page가 가장 큰 것)
    const latestMap = new Map<string, Relationship>();

    for (const rel of filtered) {
      const key = `${rel.character_a_id}:${rel.character_b_id}`;
      const existing = latestMap.get(key);

      if (!existing || rel.established_page > existing.established_page) {
        latestMap.set(key, rel);
      }
    }

    return Array.from(latestMap.values());
  }

  async findAliases(bookId: string, cutoff: number): Promise<Alias[]> {
    // FR-SPL-002 🚦: 최초 등장 페이지 <= cutoff
    // character의 book_id로 필터링
    const validCharacterIds = new Set(
      this.fixture.characters
        .filter((c) => c.book_id === bookId && c.first_appearance_page <= cutoff)
        .map((c) => c.id)
    );

    return this.fixture.aliases.filter(
      (a) => validCharacterIds.has(a.character_id) && a.first_appearance_page <= cutoff
    );
  }

  async findCharacterNotes(bookId: string, cutoff: number): Promise<CharacterNote[]> {
    // FR-SPL-002 🚦: 근거 페이지 <= cutoff
    // character의 book_id로 필터링
    const validCharacterIds = new Set(
      this.fixture.characters
        .filter((c) => c.book_id === bookId && c.first_appearance_page <= cutoff)
        .map((c) => c.id)
    );

    return this.fixture.characterNotes.filter(
      (n) => validCharacterIds.has(n.character_id) && n.source_page <= cutoff
    );
  }

  async getBackgroundKnowledge(_bookId: string, _cutoff: number): Promise<string> {
    // R5: 상한 없음 (FR-BGK-002 🚦)
    // cutoff를 받지만 사용하지 않음 (G1 제약 준수)
    return this.fixture.backgroundKnowledge;
  }

  async getCharacter(
    bookId: string,
    characterId: string,
    cutoff: number
  ): Promise<Character | null> {
    // FR-SPL-002 🚦: 최초 등장 페이지 <= cutoff
    const character = this.fixture.characters.find(
      (c) => c.id === characterId && c.book_id === bookId
    );

    if (!character || character.first_appearance_page > cutoff) {
      return null;
    }

    return character;
  }

  async getGraph(bookId: string, cutoff: number): Promise<RelationshipGraph> {
    // FR-SPL-002 🚦: 모든 구성 요소가 cutoff 적용
    const characters = await this.findCharacters(bookId, cutoff);
    const relationships = await this.findLatestRelationships(bookId, cutoff);
    const aliases = await this.findAliases(bookId, cutoff);

    // 별칭을 인물별로 그룹화
    const aliasMap = new Map<string, string[]>();
    for (const alias of aliases) {
      const existing = aliasMap.get(alias.character_id) || [];
      existing.push(alias.alias);
      aliasMap.set(alias.character_id, existing);
    }

    // GraphNode 생성
    const nodes = characters.map((c) => ({
      id: c.id,
      name: c.name,
      first_appearance_page: c.first_appearance_page,
      aliases: aliasMap.get(c.id) || [],
    }));

    // GraphEdge 생성
    const edges = relationships.map((r) => ({
      source: r.character_a_id,
      target: r.character_b_id,
      label: r.label,
      established_page: r.established_page,
    }));

    return { nodes, edges };
  }

  async getCharacterDetail(
    bookId: string,
    characterId: string,
    cutoff: number
  ): Promise<CharacterDetail | null> {
    // FR-SPL-002 🚦: 모든 구성 요소가 cutoff 적용
    const character = await this.getCharacter(bookId, characterId, cutoff);

    if (!character) {
      return null;
    }

    // 별칭 조회
    const allAliases = await this.findAliases(bookId, cutoff);
    const aliases = allAliases.filter((a) => a.character_id === characterId);

    // 노트 조회
    const allNotes = await this.findCharacterNotes(bookId, cutoff);
    const characterNotes = allNotes.filter((n) => n.character_id === characterId);

    // FR-CHR-001: 인물 노트 최대 8문장
    const notes = characterNotes
      .slice(0, 8)
      .map((n) => n.note)
      .join(' ');

    return {
      name: character.name,
      first_appearance_page: character.first_appearance_page,
      aliases,
      notes,
    };
  }
}

/**
 * 테스트용 fixture 생성 헬퍼
 */
export function createTestFixture(): SsabiFixture {
  // 「탁류」 기반 테스트 데이터
  // K=20: 초반 인물 2명 (정주사, 초봉)
  // K=130: 중반까지 인물 5명

  const characters: Character[] = [
    {
      id: 'char-1',
      book_id: 'takryu',
      name: '정주사',
      first_appearance_page: 5,
    },
    {
      id: 'char-2',
      book_id: 'takryu',
      name: '초봉',
      first_appearance_page: 15,
    },
    {
      id: 'char-3',
      book_id: 'takryu',
      name: '계봉',
      first_appearance_page: 80,
    },
    {
      id: 'char-4',
      book_id: 'takryu',
      name: '고태수',
      first_appearance_page: 100,
    },
    {
      id: 'char-5',
      book_id: 'takryu',
      name: '장형보',
      first_appearance_page: 150, // K=130 초과
    },
  ];

  const relationships: Relationship[] = [
    {
      id: 'rel-1',
      book_id: 'takryu',
      character_a_id: 'char-1',
      character_b_id: 'char-2',
      label: '부녀',
      established_page: 15,
    },
    // 관계 변화 (이력) - A6 테스트
    {
      id: 'rel-2',
      book_id: 'takryu',
      character_a_id: 'char-2',
      character_b_id: 'char-4',
      label: '낯선 사이',
      established_page: 100,
    },
    {
      id: 'rel-3',
      book_id: 'takryu',
      character_a_id: 'char-2',
      character_b_id: 'char-4',
      label: '연인',
      established_page: 120,
    },
    {
      id: 'rel-4',
      book_id: 'takryu',
      character_a_id: 'char-3',
      character_b_id: 'char-4',
      label: '동료',
      established_page: 105,
    },
    {
      id: 'rel-5',
      book_id: 'takryu',
      character_a_id: 'char-2',
      character_b_id: 'char-5',
      label: '친구',
      established_page: 160, // K=130 초과
    },
  ];

  const aliases: Alias[] = [
    {
      id: 'alias-1',
      character_id: 'char-1',
      alias: '주사',
      type: 'title',
      first_appearance_page: 5,
    },
    {
      id: 'alias-2',
      character_id: 'char-2',
      alias: '봉이',
      type: 'nickname',
      first_appearance_page: 20,
    },
    {
      id: 'alias-3',
      character_id: 'char-5',
      alias: '형보',
      type: 'name',
      first_appearance_page: 150, // K=130 초과
    },
  ];

  const characterNotes: CharacterNote[] = [
    {
      id: 'note-1',
      character_id: 'char-1',
      note: '고무신 장사로 돈을 모았다.',
      source_page: 10,
    },
    {
      id: 'note-2',
      character_id: 'char-2',
      note: '정주사의 딸이다.',
      source_page: 15,
    },
    {
      id: 'note-3',
      character_id: 'char-2',
      note: '미인으로 소문났다.',
      source_page: 25, // K=20 초과
    },
  ];

  const backgroundKnowledge = `
일제강점기 군산 배경. 탁류(濁流)는 흐리고 혼탁한 물줄기를 의미한다.
채만식의 대표작으로 1937-1938년 연재되었다.
  `.trim();

  return {
    characters,
    relationships,
    aliases,
    characterNotes,
    backgroundKnowledge,
  };
}
