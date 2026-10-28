/**
 * 싸비 조회 PostgreSQL 어댑터 (R3)
 *
 * R1 pg-repository.ts와 같은 패턴 — QueryClient를 받아 SQL 실행
 *
 * ⚠️ G1 제약: 모든 메서드가 cutoff 인자를 갖는다
 * ⚠️ characters·relationships·aliases·character_notes는 R1 소유 테이블
 *    이 파일은 읽기만 한다 (절대 규칙 5번)
 */

import type {
  Character,
  Relationship,
  Alias,
  CharacterNote,
  RelationshipGraph,
  CharacterDetail,
} from '../../shared/types';
import type { SsabiRepository } from './repository';
import { latestRelationshipVersions, relationshipToEdge } from './relationship-versions';

export interface QueryClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>;
}

export function createPgSsabiRepository(db: QueryClient): SsabiRepository {
  return {
    async findCharacters(bookId: string, cutoff: number): Promise<Character[]> {
      // FR-SPL-002 🚦: 최초 등장 페이지 <= cutoff
      const { rows } = await db.query(
        `SELECT id, book_id, name, first_appearance_page
           FROM characters
          WHERE book_id = $1
            AND first_appearance_page <= $2
          ORDER BY first_appearance_page ASC`,
        [bookId, cutoff]
      );
      return rows;
    },

    async findLatestRelationships(bookId: string, cutoff: number): Promise<Relationship[]> {
      return latestRelationshipVersions(await boundedRelationships(db, bookId, cutoff));
    },

    async findAliases(bookId: string, cutoff: number): Promise<Alias[]> {
      // FR-SPL-002 🚦: 최초 등장 페이지 <= cutoff
      // character의 book_id로 필터링
      const { rows } = await db.query(
        // aliases 에는 대리키가 없다 — PK 가 (book_id, alias, character_id) 복합키다.
        // 컬럼명은 alias_type 이고, API 계약의 필드명은 type 이므로 여기서 매핑한다
        // (001_content_store.sql 이 컬럼명 정본, API_CONTRACT.md 가 응답 정본).
        `SELECT a.character_id, a.alias, a.alias_type AS type, a.first_appearance_page
           FROM aliases a
           JOIN characters c ON a.character_id = c.id
          WHERE a.book_id = $1
            AND c.book_id = $1
            AND c.first_appearance_page <= $2
            AND a.first_appearance_page <= $2
          ORDER BY a.first_appearance_page ASC`,
        [bookId, cutoff]
      );
      return rows;
    },

    async findCharacterNotes(bookId: string, cutoff: number): Promise<CharacterNote[]> {
      // FR-SPL-002 🚦: 근거 페이지 <= cutoff
      const { rows } = await db.query(
        `SELECT cn.id, cn.character_id, cn.note, cn.source_page
           FROM character_notes cn
           JOIN characters c ON cn.character_id = c.id
          WHERE c.book_id = $1
            AND cn.book_id = $1
            AND c.first_appearance_page <= $2
            AND cn.source_page <= $2
          ORDER BY c.first_appearance_page, cn.source_page ASC`,
        [bookId, cutoff]
      );
      return rows;
    },

    async getBackgroundKnowledge(bookId: string, _cutoff: number): Promise<string> {
      // R5: 상한 없음 (FR-BGK-002 🚦)
      // cutoff를 받지만 사용하지 않음 (G1 제약 준수)
      // background_and_intro 테이블에서 kind='background' 조회
      const { rows } = await db.query(
        `SELECT content
           FROM background_and_intro
          WHERE book_id = $1
            AND kind = 'background'
          LIMIT 1`,
        [bookId]
      );
      return rows[0]?.content || '';
    },

    async getCharacter(
      bookId: string,
      characterId: string,
      cutoff: number
    ): Promise<Character | null> {
      // FR-SPL-002 🚦: 최초 등장 페이지 <= cutoff
      const { rows } = await db.query(
        `SELECT id, book_id, name, first_appearance_page
           FROM characters
          WHERE id = $1
            AND book_id = $2
            AND first_appearance_page <= $3
          LIMIT 1`,
        [characterId, bookId, cutoff]
      );
      if (rows.length === 0) return null;
      return rows[0];
    },

    async getGraph(bookId: string, cutoff: number): Promise<RelationshipGraph> {
      // FR-SPL-002 🚦: 모든 구성 요소가 cutoff 적용

      // 인물 조회
      const characters = await this.findCharacters(bookId, cutoff);

      // 관계 조회 (최신 라벨만)
      const history = await boundedRelationships(db, bookId, cutoff);
      const relationships = latestRelationshipVersions(history);

      // 별칭 조회
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
        alias_details: aliases
          .filter((a) => a.character_id === c.id)
          .map((a) => ({ alias: a.alias, first_appearance_page: a.first_appearance_page })),
      }));

      // GraphEdge 생성
      const edges = relationships.map(relationshipToEdge);
      return { nodes, edges, history: history.map(relationshipToEdge), applied_cutoff: cutoff };
    },

    async getCharacterDetail(
      bookId: string,
      characterId: string,
      cutoff: number
    ): Promise<CharacterDetail | null> {
      // FR-SPL-002 🚦: 모든 구성 요소가 cutoff 적용

      // 인물 조회
      const character = await this.getCharacter(bookId, characterId, cutoff);
      if (!character) return null;

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
    },
  };
}

/** FR-SPL-002/R4: bound relations, both endpoints AND the source before assembly.
 * Legacy rows retain their label but have no verified semantics; the UI says so.
 * Exact evidence checks are provenance checks, not a substitute for R12 semantic review.
 */
export async function boundedRelationships(
  db: QueryClient,
  bookId: string,
  cutoff: number
): Promise<Relationship[]> {
  const { rows } = await db.query(
    `SELECT r.id, r.book_id, r.character_a_id, r.character_b_id,
            r.label, r.established_page, r.semantics
       FROM relationships r
       JOIN characters ca ON ca.id = r.character_a_id
       JOIN characters cb ON cb.id = r.character_b_id
       LEFT JOIN pages proof ON proof.book_id = r.book_id
         AND proof.page_no = (r.semantics #>> '{evidence,source_page}')::numeric
         AND proof.page_no <= $2
       LEFT JOIN pages change_proof ON change_proof.book_id = r.book_id
         AND change_proof.page_no = (r.semantics #>> '{change_evidence,source_page}')::numeric
         AND change_proof.page_no <= $2
      WHERE r.book_id = $1 AND ca.book_id = $1 AND cb.book_id = $1
        AND ca.first_appearance_page <= $2 AND cb.first_appearance_page <= $2
        AND r.established_page <= $2
        AND (r.semantics IS NULL OR (
          r.semantics->>'version' = '2'
          AND proof.page_no <= r.established_page
          AND length(r.semantics #>> '{evidence,quote}') > 0
          AND strpos(proof.content, r.semantics #>> '{evidence,quote}') > 0
          AND (NOT r.semantics ? 'change_evidence' OR (
            change_proof.page_no <= r.established_page
            AND length(r.semantics #>> '{change_evidence,quote}') > 0
            AND strpos(change_proof.content, r.semantics #>> '{change_evidence,quote}') > 0
          ))
        ))
      ORDER BY r.established_page, r.id`,
    [bookId, cutoff]
  );
  return rows;
}
