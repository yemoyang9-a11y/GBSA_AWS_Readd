/**
 * S4 본실행 — 챕터 간 상태 누적
 *
 * LLM은 매 장을 그 장 원문만 보고 독립적으로 생성한다(FR-DAT-003~008, 상한 개념 없음).
 * 여러 장에 걸쳐 같은 인물·별칭·용어가 반복 등장할 때 중복 레코드를 만들지 않도록,
 * 장 순서대로 생성 결과를 이 상태에 누적하고 다음 장 프롬프트에는 대표명 목록만
 * "이미 등장한 인물" 힌트로 넘긴다.
 *
 * 관계는 이력형(A6, FR-CHR-001 🚦) — 같은 쌍이라도 라벨이 바뀌면 새 행을 추가하고,
 * 라벨이 그대로면(같은 사실의 재서술) 중복 행을 만들지 않는다. 기존 행은 절대 덮어쓰지 않는다.
 */
import { v4 as uuidv4 } from 'uuid';

export type AliasType = 'name' | 'title' | 'kinship' | 'nickname';

export interface AccumulatedAlias {
  alias: string;
  type: AliasType;
  first_appearance_page: number;
}

export interface AccumulatedNote {
  id: string;
  note: string;
  source_page: number;
}

export interface AccumulatedCharacter {
  id: string;
  name: string;
  first_appearance_page: number;
  aliases: AccumulatedAlias[];
  notes: AccumulatedNote[];
}

export interface AccumulatedRelationship {
  id: string;
  character_a_id: string;
  character_b_id: string;
  label: string;
  established_page: number;
}

export interface AccumulatedTerm {
  id: string;
  term: string;
  definition: string;
  first_appearance_page: number;
}

export interface GenerationState {
  characters: AccumulatedCharacter[];
  /** 쌍당 여러 행 허용 (이력형, A6) — 최신 라벨 선택은 R4 소비 시점의 몫 */
  relationships: AccumulatedRelationship[];
  terms: AccumulatedTerm[];
}

export function createEmptyState(): GenerationState {
  return { characters: [], relationships: [], terms: [] };
}

function normalize(text: string): string {
  return text.trim();
}

/** 대표명 또는 별칭 문자열로 기존 인물을 찾는다 (관계 추출이 별칭으로 인물을 지칭하는 경우 대응) */
function findCharacter(
  state: GenerationState,
  nameOrAlias: string
): AccumulatedCharacter | undefined {
  const target = normalize(nameOrAlias);
  return state.characters.find(
    (c) => c.name === target || c.aliases.some((a) => a.alias === target)
  );
}

/** 다음 장 프롬프트의 "이미 등장한 인물" 힌트 — 대표명만 (LLM이 그대로 재사용하도록) */
export function knownCharacterNames(state: GenerationState): string[] {
  return state.characters.map((c) => c.name);
}

interface ChapterCharacterInput {
  name: string;
  first_appearance_page: number;
  aliases: { alias: string; type: string; first_appearance_page: number }[];
  notes: { note: string; source_page: number }[];
}

/**
 * 이 장의 인물 생성 결과를 상태에 병합한다.
 * 기존 인물이면 id를 재사용하고 별칭·노트만 추가한다 — 새 인물로 다시 만들지 않는다.
 * 이미 등록된 별칭은 최초 등장 페이지를 덮어쓰지 않는다(더 이른 장이 항상 먼저 처리되므로).
 */
export function mergeCharacters(
  state: GenerationState,
  chapterCharacters: ChapterCharacterInput[]
): void {
  for (const c of chapterCharacters) {
    const name = normalize(c.name);
    let existing = findCharacter(state, name);
    if (!existing) {
      existing = {
        id: uuidv4(),
        name,
        first_appearance_page: c.first_appearance_page,
        aliases: [],
        notes: [],
      };
      state.characters.push(existing);
    }

    for (const a of c.aliases) {
      const aliasText = normalize(a.alias);
      const already =
        existing.aliases.some((ex) => ex.alias === aliasText) || existing.name === aliasText;
      if (!already) {
        existing.aliases.push({
          alias: aliasText,
          type: a.type as AliasType,
          first_appearance_page: a.first_appearance_page,
        });
      }
    }

    for (const n of c.notes) {
      existing.notes.push({ id: uuidv4(), note: n.note, source_page: n.source_page });
    }
  }
}

/** 이름 또는 별칭으로 인물 id를 찾는다. 못 찾으면 undefined(관계 추출과 인물 추출 간 표기 불일치 — 검수 대상) */
export function resolveCharacterId(
  state: GenerationState,
  nameOrAlias: string
): string | undefined {
  return findCharacter(state, nameOrAlias)?.id;
}

function pairKey(idA: string, idB: string): string {
  return [idA, idB].sort().join('|');
}

interface ChapterRelationshipInput {
  character_a_id: string;
  character_b_id: string;
  label: string;
  established_page: number;
}

/**
 * 이 장의 관계 생성 결과를 상태에 병합한다 (A6 이력형, FR-CHR-001 🚦).
 * 같은 쌍의 가장 최근 행과 라벨이 같으면 재서술로 보고 건너뛴다.
 * 라벨이 다르면 새 행을 추가한다 — 기존 행은 절대 수정·삭제하지 않는다.
 *
 * character_a_id/character_b_id는 항상 pairKey()와 같은 정렬 순서로 저장한다 —
 * 조회 쿼리(findLatestRelationships)의 DISTINCT ON (character_a_id, character_b_id)가
 * 같은 쌍의 모든 행이 동일한 컬럼 순서라고 가정하기 때문. 라벨은 방향성 없이 화면에
 * "A — B : 라벨"로만 표시되므로(RelationshipGraph.tsx) 저장 순서를 바꿔도 의미는 그대로다.
 */
export function mergeRelationships(
  state: GenerationState,
  chapterRelationships: ChapterRelationshipInput[]
): void {
  for (const r of chapterRelationships) {
    const [character_a_id, character_b_id] = [r.character_a_id, r.character_b_id].sort();
    const key = pairKey(character_a_id, character_b_id);
    const history = state.relationships.filter(
      (x) => pairKey(x.character_a_id, x.character_b_id) === key
    );
    const latest = history.sort((a, b) => a.established_page - b.established_page).at(-1);

    if (latest && latest.label === normalize(r.label)) {
      continue;
    }

    state.relationships.push({
      id: uuidv4(),
      character_a_id,
      character_b_id,
      label: normalize(r.label),
      established_page: r.established_page,
    });
  }
}

interface ChapterTermInput {
  term: string;
  definition: string;
  first_appearance_page: number;
}

/** 용어는 최초 등장이 유일 값이다(DDL UNIQUE(book_id, term)) — 이미 있으면 건너뛴다(먼저 처리된 장이 항상 더 이르다) */
export function mergeTerms(state: GenerationState, chapterTerms: ChapterTermInput[]): void {
  for (const t of chapterTerms) {
    const term = normalize(t.term);
    const already = state.terms.some((x) => x.term === term);
    if (!already) {
      state.terms.push({
        id: uuidv4(),
        term,
        definition: t.definition,
        first_appearance_page: t.first_appearance_page,
      });
    }
  }
}
