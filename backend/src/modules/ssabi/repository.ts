/**
 * 싸비 조회 리포지토리 포트 (R3)
 *
 * ⚠️ G1 제약: 모든 메서드가 cutoff 인자를 갖는다
 * 인자가 없는 메서드는 그 자체로 우회 표면이 된다.
 *
 * 조항: FR-SPL-002 🚦, FR-CHR-001, query-endpoints-split.md §5
 */

import type {
  Character,
  Relationship,
  Alias,
  CharacterNote,
  RelationshipGraph,
  CharacterDetail,
} from '../../shared/types';

/**
 * 싸비 조회 리포지토리 포트
 *
 * ⚠️ G1: 모든 메서드가 cutoff 인자를 갖는다
 */
export interface SsabiRepository {
  /**
   * 인물 목록 조회
   *
   * FR-SPL-002 🚦: 최초 등장 페이지 <= cutoff
   */
  findCharacters(bookId: string, cutoff: number): Promise<Character[]>;

  /**
   * 관계 목록 조회 (최신 라벨만)
   *
   * A6: 표시는 최신 라벨 1개 (챗봇은 이력 전체)
   * FR-SPL-002 🚦: 확립 페이지 <= cutoff
   *
   * 같은 (character_a_id, character_b_id) 쌍에서
   * established_page가 가장 큰(최신) 행 1개만 반환
   */
  findLatestRelationships(bookId: string, cutoff: number): Promise<Relationship[]>;

  /**
   * 별칭 목록 조회
   *
   * FR-SPL-002 🚦: 최초 등장 페이지 <= cutoff
   */
  findAliases(bookId: string, cutoff: number): Promise<Alias[]>;

  /**
   * 인물 노트 조회
   *
   * FR-SPL-002 🚦: 근거 페이지 <= cutoff
   */
  findCharacterNotes(bookId: string, cutoff: number): Promise<CharacterNote[]>;

  /**
   * 배경지식 조회
   *
   * R5: 상한 없음 (FR-BGK-002 🚦)
   * 1페이지 시점에도 안전한 고정 콘텐츠
   *
   * ⚠️ cutoff를 인자로 받지만 쿼리에 사용하지 않음 (G1 제약 준수)
   */
  getBackgroundKnowledge(bookId: string, cutoff: number): Promise<string>;

  /**
   * 인물 단건 조회
   *
   * FR-SPL-002 🚦: 최초 등장 페이지 <= cutoff
   *
   * @returns 인물 정보 또는 null (존재하지 않거나 cutoff 초과)
   */
  getCharacter(bookId: string, characterId: string, cutoff: number): Promise<Character | null>;

  /**
   * 관계도 그래프 조회 (조립형)
   *
   * FR-SPL-002 🚦: 모든 구성 요소가 cutoff 적용
   *
   * nodes: 인물 + 별칭 (first_appearance_page <= cutoff)
   * edges: 관계 최신 라벨 (established_page <= cutoff)
   */
  getGraph(bookId: string, cutoff: number): Promise<RelationshipGraph>;

  /**
   * 인물 상세 조회 (조립형)
   *
   * FR-SPL-002 🚦: 모든 구성 요소가 cutoff 적용
   * FR-CHR-001: 인물 노트 최대 8문장
   *
   * @returns 인물 상세 또는 null (존재하지 않거나 cutoff 초과)
   */
  getCharacterDetail(
    bookId: string,
    characterId: string,
    cutoff: number
  ): Promise<CharacterDetail | null>;
}

/**
 * 싸비 리포지토리 Row 타입
 *
 * ⚠️ Character, Relationship, Alias, CharacterNote는 shared/types.ts에 정의됨
 * 추가 Row 타입이 필요하면 여기 정의
 */

/**
 * 관계 그룹 Row (최신 라벨 선택용)
 *
 * DISTINCT ON (character_a_id, character_b_id)로
 * 최신 established_page 선택 시 사용
 */
export interface RelationshipLatestRow {
  id: string;
  book_id: string;
  character_a_id: string;
  character_b_id: string;
  label: string;
  established_page: number;
}
