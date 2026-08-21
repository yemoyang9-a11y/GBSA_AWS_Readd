/**
 * S7 — 검수 + 공개 전환 (FR-ADM-005 🚦, FR-ADM-006, NFR-AI-011 🚦·012, R12)
 *
 * 내보내기 → 판정 기록 → 수정 반영 → 공개 전환의 4단계를 다룬다. 이 모듈은 값을
 * 스스로 판정하지 않는다 — "검수 6항목 판정"은 dev-spec-05 1장이 사람에게 위임한 항목이라,
 * 여기서는 사람이 CSV 시트에 적은 판정을 그대로 읽어 기록하고, 미판정·판정 불완전 상태에서
 * 공개 전환을 거절하는 것까지만 한다.
 *
 * 검수 기준 7항목 — FR-ADM-005 명세의 6항목(환각·별칭통합·페이지경계·리캡연결성·정보분리·
 * 소개 글 수위)에 R5(FR-BGK-002, 배경지식 1페이지 시점 안전)를 더해 review_records는 7개
 * 불리언 컬럼을 갖는다(migrations/003). 대상 종류(target_type)마다 적용되는 항목이 다르므로
 * APPLICABLE_CRITERIA로 매핑을 고정한다 — 이 매핑은 R1의 해석이며, FR-ADM-005 표의
 * "확인 내용" 문구를 대상별로 나눈 것이다.
 */
import { v4 as uuidv4 } from 'uuid';
import { QueryClient } from './register';
import { ResolvedBookData } from './check-integrity';

export type ReviewTargetType =
  | 'chapter_summary'
  | 'character'
  | 'alias'
  | 'character_note'
  | 'relationship'
  | 'term'
  | 'event'
  | 'background'
  | 'intro';

export type ReviewCriterion =
  | 'hallucination_ok'
  | 'alias_merge_ok'
  | 'page_boundary_ok'
  | 'recap_continuity_ok'
  | 'info_separation_ok'
  | 'intro_tone_ok'
  | 'spoiler_free_ok';

export const ALL_CRITERIA: ReviewCriterion[] = [
  'hallucination_ok',
  'alias_merge_ok',
  'page_boundary_ok',
  'recap_continuity_ok',
  'info_separation_ok',
  'intro_tone_ok',
  'spoiler_free_ok',
];

/** 대상 종류별 적용 판정 항목 (FR-ADM-005 표의 "확인 내용"을 대상별로 분해) */
export const APPLICABLE_CRITERIA: Record<ReviewTargetType, ReviewCriterion[]> = {
  chapter_summary: [
    'hallucination_ok',
    'page_boundary_ok',
    'recap_continuity_ok',
    'info_separation_ok',
  ],
  character: ['hallucination_ok', 'alias_merge_ok', 'page_boundary_ok', 'info_separation_ok'],
  alias: ['hallucination_ok', 'page_boundary_ok'],
  character_note: ['hallucination_ok', 'page_boundary_ok', 'info_separation_ok'],
  relationship: ['hallucination_ok', 'page_boundary_ok', 'info_separation_ok'],
  term: ['hallucination_ok', 'page_boundary_ok', 'info_separation_ok'],
  event: ['hallucination_ok', 'page_boundary_ok', 'info_separation_ok'],
  background: ['hallucination_ok', 'info_separation_ok', 'spoiler_free_ok'],
  intro: ['hallucination_ok', 'info_separation_ok', 'intro_tone_ok'],
};

export interface ReviewSheetRow {
  target_type: ReviewTargetType;
  target_id: string;
  page_ref: number | null;
  content_preview: string;
}

/** review_records 조회 없이도 테스트 가능하도록, 이미 검수된 키 집합을 인자로 받는다(순수 함수) */
export function reviewKey(target_type: ReviewTargetType, target_id: string): string {
  return `${target_type}::${target_id}`;
}

export type ReviewRecordRow = {
  target_type: ReviewTargetType;
  target_id: string;
} & Partial<Record<ReviewCriterion, boolean | null>>;

/**
 * review_records 중 "적용 항목 전부 TRUE"인 대상만 재내보내기 제외 키로 삼는다.
 * FALSE로 판정된 대상은 행이 존재해도 통과가 아니므로 제외하지 않는다 —
 * 그래야 검수자가 다음 시트에서 그 대상을 다시 받아 수정 후 재제출할 수 있다.
 * (이전엔 행 존재 여부만 봐서, 한번 FALSE를 받은 대상은 재수출 경로가 영구히 막혔었다)
 */
export function passedReviewKeys(records: ReviewRecordRow[]): Set<string> {
  const keys = new Set<string>();
  for (const r of records) {
    const applicable = APPLICABLE_CRITERIA[r.target_type];
    const passed = applicable.every((c) => r[c] === true);
    if (passed) keys.add(reviewKey(r.target_type, r.target_id));
  }
  return keys;
}

/** 생성물 전량을 검수 대상 행으로 펼친다. alreadyReviewed에 있는 대상은 다시 내보내지 않는다(재실행 시 통과 판정 보존 — FALSE 대상은 이 집합에 넣지 말 것, passedReviewKeys 참고) */
export function buildReviewSheetRows(
  data: ResolvedBookData,
  alreadyReviewed: Set<string> = new Set()
): ReviewSheetRow[] {
  const rows: ReviewSheetRow[] = [];
  const push = (
    target_type: ReviewTargetType,
    target_id: string,
    page_ref: number | null,
    content_preview: string
  ): void => {
    if (alreadyReviewed.has(reviewKey(target_type, target_id))) return;
    rows.push({ target_type, target_id, page_ref, content_preview });
  };

  for (const cs of data.chapter_summaries) {
    push('chapter_summary', String(cs.chapter_no), null, `[${cs.chapter_no}장] ${cs.summary}`);
  }

  for (const c of data.characters) {
    push('character', c.id, c.first_appearance_page, c.name);
    for (const a of c.aliases) {
      push(
        'alias',
        `${c.id}::${a.alias}`,
        a.first_appearance_page,
        `${c.name} ← ${a.alias} (${a.type})`
      );
    }
    for (const n of c.notes) {
      push('character_note', n.id, n.source_page, `${c.name}: ${n.note}`);
    }
  }

  const nameById = new Map(data.characters.map((c) => [c.id, c.name] as const));
  for (const r of data.relationships) {
    const a = nameById.get(r.character_a_id) ?? r.character_a_id;
    const b = nameById.get(r.character_b_id) ?? r.character_b_id;
    push('relationship', r.id, r.established_page, `${a} - ${b}: ${r.label}`);
  }

  for (const t of data.terms) {
    push('term', t.id, t.first_appearance_page, `${t.term}: ${t.definition}`);
  }

  for (const e of data.events) {
    push('event', e.id, e.occurrence_page, `${e.event}: ${e.description}`);
  }

  push('background', 'background', null, data.background_and_intro.background);
  push('intro', 'intro', null, data.background_and_intro.intro);

  return rows;
}

const FIXED_COLUMNS = ['target_type', 'target_id', 'page_ref', 'content_preview'] as const;
const TAIL_COLUMNS = ['corrected_content', 'correction_note', 'reviewer'] as const;
export const REVIEW_SHEET_COLUMNS = [...FIXED_COLUMNS, ...ALL_CRITERIA, ...TAIL_COLUMNS];

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** 검수 시트를 CSV로 직렬화한다 — 대상에 적용되지 않는 판정 컬럼은 "N/A"로 미리 채워 오기입을 막는다 */
export function toReviewSheetCsv(rows: ReviewSheetRow[]): string {
  const lines = [REVIEW_SHEET_COLUMNS.join(',')];
  for (const row of rows) {
    const applicable = new Set(APPLICABLE_CRITERIA[row.target_type]);
    const fields = [
      row.target_type,
      row.target_id,
      row.page_ref === null ? '' : String(row.page_ref),
      row.content_preview,
      ...ALL_CRITERIA.map((c) => (applicable.has(c) ? '' : 'N/A')),
      '',
      '',
      '',
    ];
    lines.push(fields.map(csvEscape).join(','));
  }
  return lines.join('\n') + '\n';
}

/** RFC4180 최소 구현 — 인용 필드 내 쉼표·개행·이중인용부호를 처리한다 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        field += ch;
        i += 1;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
    } else if (ch === ',') {
      row.push(field);
      field = '';
      i += 1;
    } else if (ch === '\r') {
      i += 1;
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
    } else {
      field += ch;
      i += 1;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

export interface FilledReviewRow {
  target_type: ReviewTargetType;
  target_id: string;
  criteria: Partial<Record<ReviewCriterion, boolean>>;
  corrected_content: string | null;
  correction_note: string | null;
  reviewer: string;
}

function parseBooleanCell(value: string, context: string): boolean {
  const v = value.trim().toUpperCase();
  if (v === 'TRUE') return true;
  if (v === 'FALSE') return false;
  throw new Error(
    `검수 시트 판정값이 비었거나 유효하지 않음 (TRUE/FALSE만 허용) — ${context}: "${value}"`
  );
}

/**
 * 채워진 검수 시트를 읽는다. 대상에 적용되는 판정 항목이 하나라도 비어 있으면 즉시 실패한다
 * (FR-ADM-005 🚦 "6항목 전부에 대해 판정 기록 존재" — 부분 판정으로 반영을 진행하지 않는다).
 */
export function parseFilledReviewSheet(csvText: string): FilledReviewRow[] {
  const table = parseCsv(csvText);
  const [header, ...dataRows] = table;
  if (!header || REVIEW_SHEET_COLUMNS.some((col, i) => header[i] !== col)) {
    throw new Error(
      '검수 시트 헤더가 예상 컬럼과 다름 — toReviewSheetCsv로 생성된 파일인지 확인할 것'
    );
  }

  return dataRows.map((cells) => {
    const record: Record<string, string> = {};
    REVIEW_SHEET_COLUMNS.forEach((col, i) => (record[col] = cells[i] ?? ''));

    const target_type = record.target_type as ReviewTargetType;
    const target_id = record.target_id;
    const applicable = new Set(APPLICABLE_CRITERIA[target_type]);
    const context = `${target_type}:${target_id}`;

    const criteria: Partial<Record<ReviewCriterion, boolean>> = {};
    for (const c of ALL_CRITERIA) {
      if (!applicable.has(c)) continue;
      criteria[c] = parseBooleanCell(record[c], `${context} / ${c}`);
    }

    const reviewer = record.reviewer.trim();
    if (!reviewer) {
      throw new Error(`검수자(reviewer)가 비어 있음 — ${context}`);
    }

    return {
      target_type,
      target_id,
      criteria,
      corrected_content: record.corrected_content.trim() || null,
      correction_note: record.correction_note.trim() || null,
      reviewer,
    };
  });
}

/** target_id에서 alias 대상의 (character_id, alias) 쌍을 복원한다 */
function splitAliasTargetId(target_id: string): { character_id: string; alias: string } {
  const idx = target_id.indexOf('::');
  if (idx < 0)
    throw new Error(`alias 대상 id 형식이 아님(character_id::alias 필요): "${target_id}"`);
  return { character_id: target_id.slice(0, idx), alias: target_id.slice(idx + 2) };
}

/** 검수에서 지적된 수정을 원본 테이블에 반영한다(NFR-AI-012, "수정 반영") */
export async function applyCorrection(
  client: QueryClient,
  bookId: string,
  target_type: ReviewTargetType,
  target_id: string,
  correctedContent: string
): Promise<void> {
  switch (target_type) {
    case 'chapter_summary':
      await client.query(
        'UPDATE chapter_summaries SET summary = $1 WHERE book_id = $2 AND chapter_no = $3',
        [correctedContent, bookId, Number(target_id)]
      );
      return;
    case 'character':
      await client.query('UPDATE characters SET name = $1 WHERE book_id = $2 AND id = $3', [
        correctedContent,
        bookId,
        target_id,
      ]);
      return;
    case 'alias': {
      const { character_id, alias } = splitAliasTargetId(target_id);
      await client.query(
        'UPDATE aliases SET alias = $1 WHERE book_id = $2 AND character_id = $3 AND alias = $4',
        [correctedContent, bookId, character_id, alias]
      );
      return;
    }
    case 'character_note':
      await client.query('UPDATE character_notes SET note = $1 WHERE book_id = $2 AND id = $3', [
        correctedContent,
        bookId,
        target_id,
      ]);
      return;
    case 'relationship':
      await client.query('UPDATE relationships SET label = $1 WHERE book_id = $2 AND id = $3', [
        correctedContent,
        bookId,
        target_id,
      ]);
      return;
    case 'term':
      await client.query('UPDATE terms SET definition = $1 WHERE book_id = $2 AND id = $3', [
        correctedContent,
        bookId,
        target_id,
      ]);
      return;
    case 'event':
      await client.query('UPDATE events SET description = $1 WHERE book_id = $2 AND id = $3', [
        correctedContent,
        bookId,
        target_id,
      ]);
      return;
    case 'background':
      await client.query(
        "UPDATE background_and_intro SET content = $1 WHERE book_id = $2 AND kind = 'background'",
        [correctedContent, bookId]
      );
      return;
    case 'intro':
      await client.query(
        "UPDATE background_and_intro SET content = $1 WHERE book_id = $2 AND kind = 'intro'",
        [correctedContent, bookId]
      );
      return;
  }
}

/** 판정 기록을 적재하고(수정 내용이 있으면 먼저 원본에 반영한다) — 대상당 1행으로 upsert(재실행 시 중복 방지, migrations/003) */
export async function applyReviewJudgments(
  client: QueryClient,
  bookId: string,
  rows: FilledReviewRow[]
): Promise<void> {
  for (const row of rows) {
    if (row.corrected_content) {
      await applyCorrection(client, bookId, row.target_type, row.target_id, row.corrected_content);
    }

    await client.query(
      `INSERT INTO review_records
         (id, book_id, target_type, target_id, hallucination_ok, alias_merge_ok, page_boundary_ok,
          recap_continuity_ok, info_separation_ok, intro_tone_ok, spoiler_free_ok, correction_note, reviewer)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (book_id, target_type, target_id) DO UPDATE SET
         hallucination_ok = $5, alias_merge_ok = $6, page_boundary_ok = $7, recap_continuity_ok = $8,
         info_separation_ok = $9, intro_tone_ok = $10, spoiler_free_ok = $11, correction_note = $12,
         reviewer = $13, reviewed_at = now()`,
      [
        uuidv4(),
        bookId,
        row.target_type,
        row.target_id,
        row.criteria.hallucination_ok ?? null,
        row.criteria.alias_merge_ok ?? null,
        row.criteria.page_boundary_ok ?? null,
        row.criteria.recap_continuity_ok ?? null,
        row.criteria.info_separation_ok ?? null,
        row.criteria.intro_tone_ok ?? null,
        row.criteria.spoiler_free_ok ?? null,
        row.correction_note,
        row.reviewer,
      ]
    );
  }
}

export interface MissingReviewItem {
  target_type: ReviewTargetType;
  target_id: string;
  missing_criteria: ReviewCriterion[];
}

export interface ReviewCompletionReport {
  complete: boolean;
  missing: MissingReviewItem[];
}

interface TargetListRow {
  target_id: string;
}

type ReviewJoinRow = TargetListRow & Partial<Record<ReviewCriterion, boolean | null>>;

/** 대상 종류 하나에 대해 review_records를 LEFT JOIN해 미판정·판정 불완전 행을 찾는다 */
async function findIncomplete(
  client: QueryClient,
  bookId: string,
  targetType: ReviewTargetType,
  listSql: string
): Promise<MissingReviewItem[]> {
  const applicable = APPLICABLE_CRITERIA[targetType];
  const criteriaSelect = applicable.map((c) => `rr.${c}`).join(', ');
  const sql = `
    SELECT sub.target_id AS target_id${applicable.length ? ', ' + criteriaSelect : ''}
    FROM (${listSql}) sub
    LEFT JOIN review_records rr
      ON rr.book_id = $1 AND rr.target_type = '${targetType}' AND rr.target_id = sub.target_id
  `;
  const result = (await client.query(sql, [bookId])) as { rows: ReviewJoinRow[] };

  const missing: MissingReviewItem[] = [];
  for (const row of result.rows) {
    const missingCriteria = applicable.filter((c) => row[c] !== true);
    if (missingCriteria.length > 0) {
      missing.push({
        target_type: targetType,
        target_id: row.target_id,
        missing_criteria: missingCriteria,
      });
    }
  }
  return missing;
}

/** FR-ADM-005 🚦 — 생성물 전량에 대해 적용 판정 항목이 전부 TRUE인 검수 기록이 있는지 확인한다 */
export async function checkReviewComplete(
  client: QueryClient,
  bookId: string
): Promise<ReviewCompletionReport> {
  const missing: MissingReviewItem[] = [];

  missing.push(
    ...(await findIncomplete(
      client,
      bookId,
      'chapter_summary',
      'SELECT chapter_no::text AS target_id FROM chapter_summaries WHERE book_id = $1'
    ))
  );
  missing.push(
    ...(await findIncomplete(
      client,
      bookId,
      'character',
      'SELECT id AS target_id FROM characters WHERE book_id = $1'
    ))
  );
  missing.push(
    ...(await findIncomplete(
      client,
      bookId,
      'alias',
      "SELECT character_id || '::' || alias AS target_id FROM aliases WHERE book_id = $1"
    ))
  );
  missing.push(
    ...(await findIncomplete(
      client,
      bookId,
      'character_note',
      'SELECT id AS target_id FROM character_notes WHERE book_id = $1'
    ))
  );
  missing.push(
    ...(await findIncomplete(
      client,
      bookId,
      'relationship',
      'SELECT id AS target_id FROM relationships WHERE book_id = $1'
    ))
  );
  missing.push(
    ...(await findIncomplete(
      client,
      bookId,
      'term',
      'SELECT id AS target_id FROM terms WHERE book_id = $1'
    ))
  );
  missing.push(
    ...(await findIncomplete(
      client,
      bookId,
      'event',
      'SELECT id AS target_id FROM events WHERE book_id = $1'
    ))
  );
  missing.push(
    ...(await findIncomplete(
      client,
      bookId,
      'background',
      "SELECT kind AS target_id FROM background_and_intro WHERE book_id = $1 AND kind = 'background'"
    ))
  );
  missing.push(
    ...(await findIncomplete(
      client,
      bookId,
      'intro',
      "SELECT kind AS target_id FROM background_and_intro WHERE book_id = $1 AND kind = 'intro'"
    ))
  );

  return { complete: missing.length === 0, missing };
}

/** FR-ADM-006 — 검수 미완료 상태에서 공개 전환 시도는 거절한다(R12, 스크립트 차원의 강제) */
export async function publishBook(
  client: QueryClient,
  bookId: string
): Promise<ReviewCompletionReport> {
  const report = await checkReviewComplete(client, bookId);
  if (!report.complete) {
    return report;
  }
  await client.query(
    "UPDATE books SET publish_status = 'published', ssabi_ready = true WHERE book_id = $1",
    [bookId]
  );
  return report;
}
