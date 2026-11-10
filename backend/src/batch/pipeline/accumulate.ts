/**
 * S4 본실행 — 챕터 간 상태 누적
 *
 * LLM은 매 장을 그 장 원문만 보고 독립적으로 생성한다(FR-DAT-003~008, 상한 개념 없음).
 * 여러 장에 걸쳐 같은 인물·별칭·용어가 반복 등장할 때 중복 레코드를 만들지 않도록,
 * 장 순서대로 생성 결과를 이 상태에 누적하고 다음 장 프롬프트에는 대표명 목록만
 * "이미 등장한 인물" 힌트로 넘긴다.
 *
 * 관계는 이력형(A6, FR-CHR-001 🚦) — 같은 사실의 재서술은 최초 행을 보존한다.
 * 이미 알려진 쌍은 실제 상태 변화 또는 새로운 사실 공개 근거가 있을 때만 이력을 추가한다.
 */
import { v5 as uuidv5 } from 'uuid';
import { RelationshipSemantics } from '../../shared/types';
import {
  compareRelationshipOrder,
  currentRelationshipVersions,
  normalizedDirection,
  relationshipGroup,
  relationshipSlots,
} from '../../modules/ssabi/relationship-versions';
import { relationshipKey } from './semantic-guards';
import { ReviewCandidate, SourceEvidence } from './grounding';

export type AliasType = 'name' | 'title' | 'kinship' | 'nickname';

export interface AccumulatedAlias {
  alias: string;
  type: AliasType;
  first_appearance_page: number;
  identity_established_page?: number;
  mention_page?: number;
  evidence?: SourceEvidence;
  rationale?: string;
}

export interface AccumulatedNote {
  id: string;
  note: string;
  source_page: number;
  evidence?: SourceEvidence;
  rationale?: string;
}

export interface AccumulatedCharacter {
  id: string;
  identity_status?: 'same' | 'distinct';
  evidence?: SourceEvidence;
  name: string;
  first_appearance_page: number;
  aliases: AccumulatedAlias[];
  notes: AccumulatedNote[];
}

export interface AccumulatedRelationship {
  id: string;
  semantics?: RelationshipSemantics;
  evidence?: SourceEvidence;
  rationale?: string;
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
  book_id: string;
  review: ReviewCandidate[];
  identity_evidence: { character_id: string; candidate: ChapterCharacterInput }[];
  characters: AccumulatedCharacter[];
  /** 쌍당 여러 행 허용 (이력형, A6) — 최신 라벨 선택은 R4 소비 시점의 몫 */
  relationships: AccumulatedRelationship[];
  terms: AccumulatedTerm[];
}

export function createEmptyState(bookId = 'unscoped'): GenerationState {
  return {
    book_id: bookId,
    review: [],
    identity_evidence: [],
    characters: [],
    relationships: [],
    terms: [],
  };
}

function stableId(state: GenerationState, ...parts: unknown[]): string {
  return uuidv5(JSON.stringify([state.book_id, ...parts]), uuidv5.URL);
}

function normalize(text: string): string {
  return text.trim();
}

/** 대표명 또는 별칭 문자열로 기존 인물을 찾는다 (관계 추출이 별칭으로 인물을 지칭하는 경우 대응) */
function matchingCharacters(
  state: GenerationState,
  nameOrAlias: string,
  atPage = Infinity
): AccumulatedCharacter[] {
  const target = normalize(nameOrAlias);
  return state.characters.filter(
    (c) =>
      c.first_appearance_page <= atPage &&
      (c.name === target ||
        c.aliases.some(
          (a) =>
            a.alias === target &&
            (a.type === 'name' || a.type === 'nickname') &&
            a.first_appearance_page <= atPage
        ))
  );
}

/** 다음 장 프롬프트의 "이미 등장한 인물" 힌트 — 대표명만 (LLM이 그대로 재사용하도록) */
export function knownCharacterNames(state: GenerationState): string[] {
  return state.characters.map((c) => c.name);
}

export interface ChapterCharacterInput {
  name: string;
  evidence?: SourceEvidence;
  identity_status?: 'same' | 'distinct';
  first_appearance_page: number;
  aliases: (Omit<AccumulatedAlias, 'type'> & { type: string })[];
  notes: Omit<AccumulatedNote, 'id'>[];
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
  const chronological = [...chapterCharacters].sort(
    (a, b) =>
      a.first_appearance_page - b.first_appearance_page ||
      (a.evidence?.start_char ?? 0) - (b.evidence?.start_char ?? 0) ||
      a.aliases.length - b.aliases.length ||
      a.name.localeCompare(b.name)
  );
  for (const c of chronological) {
    const name = normalize(c.name);
    const heldNames = state.review
      .filter((r) => r.kind === 'identity')
      .map((r) => {
        const record = r.candidate as Record<string, unknown>;
        return (record.character ?? record) as Record<string, unknown>;
      });
    const isHeld = (label: string, page: number): boolean =>
      heldNames.some(
        (candidate) =>
          candidate.name === normalize(label) &&
          (typeof candidate.first_appearance_page !== 'number' ||
            candidate.first_appearance_page <= page)
      );
    if (
      isHeld(name, c.first_appearance_page) ||
      c.aliases.some(
        (a) =>
          (a.type === 'name' || a.type === 'nickname') &&
          isHeld(a.alias, a.identity_established_page ?? a.first_appearance_page)
      )
    ) {
      if (
        !state.review.some(
          (r) => r.kind === 'identity' && JSON.stringify(r.candidate) === JSON.stringify(c)
        )
      ) {
        state.review.push({
          kind: 'identity',
          candidate: c,
          reason: 'Identity name already held as ambiguous; no attribute or alias attachment',
        });
      }
      continue;
    }
    const identityKey = [
      'character',
      name,
      c.first_appearance_page,
      c.evidence?.start_char ?? null,
      c.evidence?.end_char ?? null,
    ];
    const candidates = new Set(
      c.identity_status === 'distinct'
        ? []
        : matchingCharacters(state, name, c.first_appearance_page)
    );
    const deferredAliases = new Set<ChapterCharacterInput['aliases'][number]>();
    // Reverse matching requires its own dated identity evidence, never just a mention.
    for (const a of c.aliases) {
      if (
        c.identity_status !== 'distinct' &&
        (a.type === 'name' || a.type === 'nickname') &&
        a.evidence &&
        a.identity_established_page
      ) {
        const matches = matchingCharacters(state, a.alias, a.identity_established_page);
        // FR-SPL-002: a later reveal cannot move earlier facts onto another identity.
        // Keep the independently introduced name; review its later link separately.
        if (
          a.identity_established_page > c.first_appearance_page &&
          matches.some((match) => !candidates.has(match))
        ) {
          deferredAliases.add(a);
          const candidate = { name, first_appearance_page: c.first_appearance_page, alias: a };
          if (
            !state.review.some(
              (r) => r.kind === 'alias' && JSON.stringify(r.candidate) === JSON.stringify(candidate)
            )
          ) {
            state.review.push({
              kind: 'alias',
              candidate,
              reason:
                'Identity link follows an independent introduction; preserve both identities for review',
            });
          }
          continue;
        }
        for (const match of matches) candidates.add(match);
      }
    }
    let existing =
      candidates.size === 1
        ? [...candidates][0]
        : state.characters.find((x) => x.id === stableId(state, ...identityKey));
    if (candidates.size > 1) {
      const candidate = { character: c, ids: [...candidates].map((x) => x.id).sort() };
      if (
        !state.review.some(
          (r) => r.kind === 'identity' && JSON.stringify(r.candidate) === JSON.stringify(candidate)
        )
      ) {
        state.review.push({
          kind: 'identity',
          reason: 'Multiple identity candidates; no automatic merge',
          candidate,
        });
      }
      continue;
    }
    if (!existing) {
      existing = {
        ...c,
        id: stableId(state, ...identityKey),
        name,
        first_appearance_page: c.first_appearance_page,
        aliases: [],
        notes: [],
      };
      state.characters.push(existing);
    }

    const previous = state.identity_evidence.find(
      (entry) =>
        entry.character_id === existing!.id &&
        entry.candidate.name === name &&
        entry.candidate.first_appearance_page === c.first_appearance_page &&
        entry.candidate.evidence?.start_char === c.evidence?.start_char &&
        entry.candidate.evidence?.end_char === c.evidence?.end_char
    );
    if (
      c.identity_status === 'distinct' &&
      previous &&
      JSON.stringify(previous.candidate) !== JSON.stringify(c)
    ) {
      state.review.push({
        kind: 'identity',
        candidate: c,
        reason: 'Conflicting distinct identities share one source anchor; disambiguation required',
      });
      continue;
    }
    if (
      !state.identity_evidence.some(
        (entry) =>
          entry.character_id === existing!.id &&
          JSON.stringify(entry.candidate) === JSON.stringify(c)
      )
    ) {
      state.identity_evidence.push({ character_id: existing.id, candidate: c });
    }

    if (existing.name !== name) {
      const identity = c.aliases.find(
        (a) =>
          !deferredAliases.has(a) &&
          a.evidence &&
          a.identity_established_page &&
          matchingCharacters(state, a.alias, a.identity_established_page).includes(existing!)
      );
      if (identity && !existing.aliases.some((a) => a.alias === name)) {
        existing.aliases.push({
          ...identity,
          alias: name,
          type: 'name',
          first_appearance_page: Math.max(
            c.first_appearance_page,
            identity.identity_established_page!
          ),
        });
      }
    }

    for (const a of c.aliases) {
      if (deferredAliases.has(a)) continue;
      const aliasText = normalize(a.alias);
      const already =
        existing.aliases.some((ex) => ex.alias === aliasText) || existing.name === aliasText;
      if (!already) {
        existing.aliases.push({
          ...a,
          alias: aliasText,
          type: a.type as AliasType,
          first_appearance_page: a.first_appearance_page,
        });
      }
    }

    for (const n of c.notes) {
      if (!existing.notes.some((x) => x.note === n.note && x.source_page === n.source_page)) {
        existing.notes.push({
          ...n,
          id: stableId(state, 'note', existing.id, n.source_page, n.note),
        });
      }
    }
  }
}

/** 이름 또는 별칭으로 인물 id를 찾는다. 못 찾으면 undefined(관계 추출과 인물 추출 간 표기 불일치 — 검수 대상) */
export function resolveCharacterId(
  state: GenerationState,
  nameOrAlias: string,
  atPage = Infinity
): string | undefined {
  const blocked = state.review.some((review) => {
    if (review.kind !== 'identity' || !review.candidate || typeof review.candidate !== 'object')
      return false;
    const record = review.candidate as Record<string, unknown>;
    const c = (record.character ?? record) as Record<string, unknown>;
    const since = typeof c.first_appearance_page === 'number' ? c.first_appearance_page : 0;
    return c.name === normalize(nameOrAlias) && since <= atPage;
  });
  if (blocked) return undefined;
  const matches = matchingCharacters(state, nameOrAlias, atPage);
  return matches.length === 1 ? matches[0].id : undefined;
}

function pairKey(idA: string, idB: string): string {
  return [idA, idB].sort().join('|');
}

export interface ChapterRelationshipInput {
  semantics?: RelationshipSemantics;
  character_a_id: string;
  character_b_id: string;
  label: string;
  established_page: number;
  evidence?: SourceEvidence;
  rationale?: string;
  change_type?: 'establishment' | 'restatement' | 'transition' | 'disclosure';
  change_evidence?: SourceEvidence;
}

/** FR-CHR-001: history is scoped to a semantic track; canonical IDs must preserve direction. */
export function canonicalRelationship<
  T extends {
    character_a_id: string;
    character_b_id: string;
    semantics?: RelationshipSemantics | null;
  },
>(r: T): T {
  if (r.character_a_id <= r.character_b_id) return r;
  const direction = r.semantics?.direction;
  return {
    ...r,
    character_a_id: r.character_b_id,
    character_b_id: r.character_a_id,
    ...(r.semantics
      ? {
          semantics: {
            ...r.semantics,
            direction:
              direction === 'a_to_b' ? 'b_to_a' : direction === 'b_to_a' ? 'a_to_b' : direction,
          },
        }
      : {}),
  };
}

/**
 * 행 식별 키 — stableId와 같은 페이지 라벨 충돌 검사에 쓴다. 무엇이 무엇을 대체하는지는 이 키가 아니라
 * 런타임과 공유하는 currentRelationshipVersions(ssabi/relationship-versions.ts)가 정한다.
 * Legacy rows retain their unverified pair-only track.
 */
export function relationshipTrack(r: {
  character_a_id: string;
  character_b_id: string;
  semantics?: RelationshipSemantics | null;
  established_page: number;
  id?: string;
}): string {
  const c = canonicalRelationship(r);
  const base = pairKey(c.character_a_id, c.character_b_id);
  return c.semantics
    ? JSON.stringify([
        base,
        c.semantics.direction,
        c.semantics.kind,
        c.semantics.relation_key,
        c.semantics.temporal_scope,
        c.semantics.temporal_scope === 'event'
          ? [c.established_page, c.semantics.evidence.start_char, c.semantics.evidence.end_char]
          : null,
      ])
    : base;
}

export function mergeRelationships(
  state: GenerationState,
  chapterRelationships: ChapterRelationshipInput[]
): void {
  // FR-CHR-001: 런타임과 같은 순서(페이지, 같은 페이지면 근거 위치)로 병합해야 대체 판단이 일치한다
  for (const candidate of [...chapterRelationships].sort(compareRelationshipOrder)) {
    const r = canonicalRelationship(candidate);
    const { character_a_id, character_b_id } = r;
    const key = relationshipTrack(r);
    const group = state.relationships.filter((x) => relationshipGroup(x) === relationshipGroup(r));
    if (
      group.some(
        (x) =>
          x.established_page === r.established_page &&
          x.label === normalize(r.label) &&
          JSON.stringify(x.semantics) === JSON.stringify(r.semantics)
      )
    )
      continue;
    // FR-CHR-001: 이 후보가 칸을 빼앗아 대체하게 될 현재 관계들 — 런타임과 같은 규칙
    const candidateSlots = relationshipSlots(r);
    const replaced = currentRelationshipVersions(group).filter((x) =>
      relationshipSlots(x).some((slot) => candidateSlots.includes(slot))
    );

    const semanticKey = relationshipKey(r.label);
    if (
      replaced.length > 0 &&
      replaced.every(
        (x) =>
          relationshipKey(x.label) === semanticKey &&
          normalizedDirection(x) === normalizedDirection(r) &&
          x.semantics?.assertion_status === r.semantics?.assertion_status &&
          x.semantics?.state === r.semantics?.state
      )
    ) {
      continue;
    }
    const explicitChange =
      ['transition', 'disclosure'].includes(r.change_type ?? '') && r.change_evidence;
    if (replaced.length > 0 && !explicitChange) {
      state.review.push({
        kind: 'relationship',
        candidate: r,
        reason:
          'Restatement cannot replace the latest relationship without explicit change/disclosure evidence',
      });
      continue;
    }

    // 같은 페이지·라벨에서 확정 여부나 상태만 바뀐 행도 id가 겹치지 않게 한다. 흔한 (fact, active)
    // 행은 예전 id를 그대로 둔다 — 등록은 upsert라 id가 바뀌면 옛 행이 남는다
    const status =
      r.semantics && (r.semantics.assertion_status !== 'fact' || r.semantics.state !== 'active')
        ? [r.semantics.assertion_status, r.semantics.state]
        : [];
    state.relationships.push({
      ...r,
      id: stableId(state, 'relationship', key, r.established_page, normalize(r.label), ...status),
      character_a_id,
      character_b_id,
      label: normalize(r.label),
      established_page: r.established_page,
    });
  }
}

/**
 * FR-CHR-001: 다음 장 프롬프트에 넣는 이전 관계 — 런타임과 같은 규칙으로 대체된 관계는 뺀다.
 * 줄 형식과 순서(트랙이 처음 나온 순서)는 예전과 같다. 이 문자열은 장 캐시 키다 — 대체된 관계가 있거나,
 * 같은 쪽 관계의 병합 순서(이제 근거 위치 순)가 LLM 출력 순서와 다르면 이후 장의 캐시가 맞지 않는다.
 */
export function previousRelationshipHints(state: GenerationState): string[] {
  // 현재 관계는 트랙마다 하나다(같은 트랙은 같은 칸을 차지해 서로 대체한다)
  const currentByTrack = new Map(
    currentRelationshipVersions(state.relationships).map((r) => [relationshipTrack(r), r])
  );
  // 순서는 예전 그대로 — 페이지 순(같은 페이지는 병합 순서)으로 트랙이 처음 나온 순서
  const tracks = new Set(
    [...state.relationships]
      .sort((a, b) => a.established_page - b.established_page)
      .map((r) => relationshipTrack(r))
  );
  const names = new Map(state.characters.map((c) => [c.id, c.name]));
  return [...tracks]
    .flatMap((track) => currentByTrack.get(track) ?? [])
    .map(
      (r) =>
        `${names.get(r.character_a_id)} / ${names.get(r.character_b_id)}: ${r.label} (p.${r.established_page}) ${r.semantics ? JSON.stringify(r.semantics) : 'legacy-unverified'}`
    );
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
        id: stableId(state, 'term', term),
        term,
        definition: t.definition,
        first_appearance_page: t.first_appearance_page,
      });
    }
  }
}
