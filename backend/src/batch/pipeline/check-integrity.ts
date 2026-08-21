/**
 * S5 — 정합성 제약 검증
 *
 * S4(본실행) 산출물을 공개 콘텐츠 스토어에 적재하기 전, DDL 제약(migrations/001_content_store.sql)을
 * 위반하는지 확인한다. hard 위반은 적재 자체가 실패하므로 등록 전 반드시 잡아야 하고,
 * review 항목은 DB 제약은 통과하지만 데이터 품질이 애매해 사람 검토(S7/V4)로 넘긴다.
 *
 * 이 모듈은 값을 고치지 않는다 — 애매한 경우를 자동으로 병합·삭제하면 잘못된 결정이
 * 조용히 굳는다(CLAUDE.md 6장). 발견만 하고 사람에게 넘긴다.
 */
import { AccumulatedCharacter, AccumulatedRelationship, AccumulatedTerm } from './accumulate';

export interface ResolvedBookData {
  book_id: string;
  chapter_summaries: { chapter_no: number; title: string; summary: string }[];
  characters: AccumulatedCharacter[];
  relationships: AccumulatedRelationship[];
  terms: AccumulatedTerm[];
  events: { id: string; event: string; description: string; occurrence_page: number }[];
  background_and_intro: { background: string; intro: string };
}

export interface IntegrityIssue {
  /** hard = DDL 제약 위반(적재 실패). review = 등록 가능하나 사람 검토 필요 */
  severity: 'hard' | 'review';
  rule: string;
  message: string;
}

export interface IntegrityReport {
  issues: IntegrityIssue[];
  /** hard 위반이 0건인지 — false면 register 단계로 넘기면 안 됨 */
  ok: boolean;
}

function isValidPage(page: unknown, totalPages: number): boolean {
  return typeof page === 'number' && Number.isInteger(page) && page >= 1 && page <= totalPages;
}

/** H1 — 페이지 참조 값이 정수이며 1..totalPages 범위 안인지 (book_id별 도메인 제약) */
function checkPageRanges(data: ResolvedBookData, totalPages: number, issues: IntegrityIssue[]): void {
  const push = (rule: string, label: string, page: unknown): void => {
    if (!isValidPage(page, totalPages)) {
      issues.push({ severity: 'hard', rule, message: `${label}의 페이지 값이 유효 범위(1~${totalPages}) 밖: ${JSON.stringify(page)}` });
    }
  };

  for (const c of data.characters) {
    push('H1-page-range', `인물 "${c.name}" 최초 등장`, c.first_appearance_page);
    for (const a of c.aliases) push('H1-page-range', `인물 "${c.name}" 별칭 "${a.alias}"`, a.first_appearance_page);
    for (const n of c.notes) push('H1-page-range', `인물 "${c.name}" 노트`, n.source_page);
  }
  for (const r of data.relationships) push('H1-page-range', `관계 "${r.label}"`, r.established_page);
  for (const t of data.terms) push('H1-page-range', `용어 "${t.term}"`, t.first_appearance_page);
  for (const e of data.events) push('H1-page-range', `사건 "${e.event}"`, e.occurrence_page);
}

/** H2 — terms.term 중복 없음 (DDL UNIQUE(book_id, term)) */
function checkTermUniqueness(data: ResolvedBookData, issues: IntegrityIssue[]): void {
  const seen = new Set<string>();
  for (const t of data.terms) {
    if (seen.has(t.term)) {
      issues.push({ severity: 'hard', rule: 'H2-term-unique', message: `용어 "${t.term}" 중복 (DDL UNIQUE(book_id, term) 위반)` });
    }
    seen.add(t.term);
  }
}

/** H3 — 인물 대표명 중복 없음(파이프라인 불변식 — accumulate가 보장해야 하는 값을 재확인) */
function checkCharacterNameUniqueness(data: ResolvedBookData, issues: IntegrityIssue[]): void {
  const seen = new Set<string>();
  for (const c of data.characters) {
    if (seen.has(c.name)) {
      issues.push({ severity: 'hard', rule: 'H3-character-name-unique', message: `인물 대표명 "${c.name}" 중복 생성됨` });
    }
    seen.add(c.name);
  }
}

/** H4 — 관계의 인물 id가 실제 인물 목록에 존재하는지(FK 무결성) */
function checkRelationshipCharacterRefs(data: ResolvedBookData, issues: IntegrityIssue[]): void {
  const ids = new Set(data.characters.map((c) => c.id));
  for (const r of data.relationships) {
    if (!ids.has(r.character_a_id) || !ids.has(r.character_b_id)) {
      issues.push({ severity: 'hard', rule: 'H4-relationship-fk', message: `관계 "${r.label}"의 인물 id가 인물 목록에 없음 (a=${r.character_a_id}, b=${r.character_b_id})` });
    }
  }
}

/** REVIEW — 같은 인물 쌍·같은 확립 페이지에 라벨이 다른 행이 여럿이면 사람이 판단(같은 사실의 다른 서술인지, 진짜 다른 사실인지) */
function checkRelationshipLabelConflicts(data: ResolvedBookData, issues: IntegrityIssue[]): void {
  const byPairPage = new Map<string, AccumulatedRelationship[]>();
  for (const r of data.relationships) {
    const key = `${[r.character_a_id, r.character_b_id].sort().join('|')}@${r.established_page}`;
    const list = byPairPage.get(key) ?? [];
    list.push(r);
    byPairPage.set(key, list);
  }

  const nameById = new Map(data.characters.map((c) => [c.id, c.name] as const));
  for (const rows of byPairPage.values()) {
    const labels = new Set(rows.map((r) => r.label));
    if (labels.size > 1) {
      const a = nameById.get(rows[0].character_a_id) ?? rows[0].character_a_id;
      const b = nameById.get(rows[0].character_b_id) ?? rows[0].character_b_id;
      issues.push({
        severity: 'review',
        rule: 'REVIEW-relationship-label-conflict',
        message: `"${a}"-"${b}" 관계가 같은 페이지(${rows[0].established_page})에 라벨이 다르게 ${rows.length}건 기록됨: ${[...labels].join(' / ')}`,
      });
    }
  }
}

/** REVIEW — name형 별칭이 서로 다른 인물에게 쓰이면 식별 모호성(같은 표기를 다른 사람으로 착각할 위험) */
function checkAmbiguousNameAliases(data: ResolvedBookData, issues: IntegrityIssue[]): void {
  const ownersByAlias = new Map<string, Set<string>>();
  for (const c of data.characters) {
    for (const a of c.aliases) {
      if (a.type !== 'name') continue;
      const owners = ownersByAlias.get(a.alias) ?? new Set<string>();
      owners.add(c.name);
      ownersByAlias.set(a.alias, owners);
    }
  }
  for (const [alias, owners] of ownersByAlias) {
    if (owners.size > 1) {
      issues.push({
        severity: 'review',
        rule: 'REVIEW-ambiguous-name-alias',
        message: `이름형 별칭 "${alias}"가 서로 다른 인물 ${owners.size}명에게 쓰임: ${[...owners].join(', ')}`,
      });
    }
  }
}

export function checkIntegrity(data: ResolvedBookData, totalPages: number): IntegrityReport {
  const issues: IntegrityIssue[] = [];

  checkPageRanges(data, totalPages, issues);
  checkTermUniqueness(data, issues);
  checkCharacterNameUniqueness(data, issues);
  checkRelationshipCharacterRefs(data, issues);
  checkRelationshipLabelConflicts(data, issues);
  checkAmbiguousNameAliases(data, issues);

  return { issues, ok: issues.every((i) => i.severity !== 'hard') };
}
