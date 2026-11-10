import { createHash } from 'crypto';
import { Chapter, Page, RelationshipSemantics } from '../../shared/types';
import { aliasReviewReason, labelMentions, relationshipReviewReason } from './semantic-guards';
const GROUNDING_SCHEMA_VERSION = 4;

/** Offsets are zero-based UTF-16 code units in the stored split page; end is exclusive. */
export interface SourceEvidence {
  source_page: number;
  quote: string;
  start_char: number;
  end_char: number;
}

export interface GroundedAlias {
  alias: string;
  reference_type: 'person_label';
  type: 'name' | 'nickname' | 'title' | 'kinship';
  first_appearance_page: number;
  mention_page?: number;
  identity_established_page: number;
  rationale: string;
  evidence: SourceEvidence;
}

export interface GroundedNote {
  note: string;
  source_page: number;
  rationale: string;
  evidence: SourceEvidence;
}

export interface GroundedCharacter {
  name: string;
  first_appearance_page: number;
  entity_type: 'person';
  identity_status: 'same' | 'distinct';
  rationale: string;
  evidence: SourceEvidence;
  aliases: GroundedAlias[];
  notes: GroundedNote[];
}

export interface GroundedRelationship {
  character_a: string;
  character_b: string;
  label: string;
  established_page: number;
  rationale: string;
  evidence: SourceEvidence;
  assertion_status: RelationshipSemantics['assertion_status'];
  semantics?: RelationshipSemantics;
  change_type: 'establishment' | 'restatement' | 'transition' | 'disclosure';
  change_evidence?: SourceEvidence;
}

export interface ReviewCandidate {
  kind: 'character' | 'alias' | 'note' | 'relationship' | 'identity';
  reason: string;
  candidate: unknown;
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function pageNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/** Exact provenance is necessary, not a semantic proof of the extractor's conclusion. */
function validEvidence(
  value: unknown,
  pages: Page[],
  date: unknown,
  names: unknown[]
): SourceEvidence | undefined {
  const e = object(value);
  const page = pages.find((p) => p.page_no === e.source_page);
  if (!page || !pageNumber(date) || date !== e.source_page || !nonempty(e.quote)) return undefined;
  let start = e.start_char as number;
  let end = e.end_char as number;
  if (e.start_char === undefined && e.end_char === undefined) {
    start = page.content.indexOf(e.quote);
    if (start !== page.content.lastIndexOf(e.quote)) return undefined;
    end = start + e.quote.length;
  }
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end <= start ||
    end > page.content.length ||
    page.content.slice(start, end) !== e.quote
  )
    return undefined;
  if (!names.every((name) => nonempty(name) && (e.quote as string).includes(name.trim())))
    return undefined;
  return { source_page: e.source_page as number, quote: e.quote, start_char: start, end_char: end };
}

/** A single fail-closed boundary for live output and cached chapter replay. */
export function validateGroundedChapter(
  input: unknown,
  pages: Page[],
  options: { requireRelationshipSemantics?: boolean } = {}
): {
  characters: GroundedCharacter[];
  relationships: GroundedRelationship[];
  review: ReviewCandidate[];
} {
  const raw = object(input);
  const review: ReviewCandidate[] = [];
  const hold = (kind: ReviewCandidate['kind'], candidate: unknown, reason: string): void => {
    review.push({ kind, candidate, reason });
  };
  const characters: GroundedCharacter[] = [];
  for (const item of Array.isArray(raw.characters) ? raw.characters : []) {
    const c = object(item);
    const characterEvidence = validEvidence(c.evidence, pages, c.first_appearance_page, [c.name]);
    if (
      c.entity_type !== 'person' ||
      !['same', 'distinct'].includes(String(c.identity_status)) ||
      !nonempty(c.rationale) ||
      !characterEvidence
    ) {
      hold(
        'character',
        item,
        'Person classification, rationale and exact dated name evidence required'
      );
      continue;
    }
    const earlier = pages
      .filter((p) => p.page_no < (c.first_appearance_page as number))
      .flatMap((p) =>
        labelMentions(p.content, c.name as string).map((mention) => ({
          page: p.page_no,
          ...mention,
        }))
      );
    const exclusions = Array.isArray(c.earlier_mentions) ? c.earlier_mentions : [];
    const unresolvedEarlier = earlier.filter(
      (mention) =>
        !exclusions.some((item) => {
          const prior = object(item);
          const proof = validEvidence(prior.evidence, pages, prior.source_page, [c.name]);
          return (
            proof &&
            ['non_person', 'different_person'].includes(String(prior.kind)) &&
            nonempty(prior.rationale) &&
            prior.source_page === mention.page &&
            proof.start_char <= mention.start &&
            proof.end_char >= mention.end
          );
        })
    );
    if (unresolvedEarlier.length > 0) {
      hold(
        'character',
        item,
        `Earlier name mentions need identity review on pages ${[...new Set(unresolvedEarlier.map((p) => p.page))].join(', ')}; do not guess/backdate`
      );
      continue;
    }
    const aliases: GroundedAlias[] = [];
    for (const item of Array.isArray(c.aliases) ? c.aliases : []) {
      const a = object(item);
      const mention = a.mention_page ?? a.first_appearance_page;
      const aliasEvidence = validEvidence(a.evidence, pages, a.identity_established_page, [
        c.name,
        a.alias,
      ]);
      if (
        !['name', 'nickname', 'title', 'kinship'].includes(String(a.type)) ||
        a.reference_type !== 'person_label' ||
        !pageNumber(mention) ||
        !pageNumber(a.identity_established_page) ||
        mention > a.identity_established_page ||
        !nonempty(a.rationale) ||
        !aliasEvidence
      ) {
        hold(
          'alias',
          item,
          'Individual person-label classification and exact dated identity evidence naming both labels required'
        );
        continue;
      }
      const aliasIssue = aliasReviewReason(
        c.name as string,
        a.alias as string,
        a.type as string,
        aliasEvidence.quote
      );
      if (aliasIssue) {
        hold('alias', item, aliasIssue);
        continue;
      }
      // Runtime's alias date denotes when the identity link is safe to expose.
      aliases.push({
        ...a,
        evidence: aliasEvidence,
        mention_page: mention,
        first_appearance_page: Math.max(
          mention,
          a.identity_established_page,
          c.first_appearance_page as number
        ),
      } as unknown as GroundedAlias);
    }
    const notes: GroundedNote[] = [];
    for (const item of Array.isArray(c.notes) ? c.notes : []) {
      const n = object(item);
      const noteEvidence = validEvidence(n.evidence, pages, n.source_page, [c.name]);
      if (
        !nonempty(n.note) ||
        !nonempty(n.rationale) ||
        !noteEvidence ||
        (n.source_page as number) < (c.first_appearance_page as number)
      ) {
        hold('note', item, 'Exact dated subject evidence and rationale required');
        continue;
      }
      notes.push({ ...n, evidence: noteEvidence } as unknown as GroundedNote);
    }
    characters.push({
      ...c,
      evidence: characterEvidence,
      name: (c.name as string).trim(),
      aliases,
      notes,
    } as unknown as GroundedCharacter);
  }
  const relationships: GroundedRelationship[] = [];
  for (const item of Array.isArray(raw.relationships) ? raw.relationships : []) {
    const r = object(item);
    const relationshipEvidence = validEvidence(r.evidence, pages, r.established_page, [
      r.character_a,
      r.character_b,
    ]);
    if (
      !nonempty(r.label) ||
      !nonempty(r.rationale) ||
      r.character_a === r.character_b ||
      !relationshipEvidence
    ) {
      hold(
        'relationship',
        item,
        'Exact dated evidence naming both endpoints and rationale required'
      );
      continue;
    }
    let semantics: RelationshipSemantics | undefined;
    if (r.semantics !== undefined || options.requireRelationshipSemantics) {
      const s = object(r.semantics);
      const semanticEvidence = validEvidence(s.evidence, pages, r.established_page, [
        r.character_a,
        r.character_b,
      ]);
      const attributed = ['belief', 'claim', 'rumor', 'uncertain'].includes(
        String(s.assertion_status)
      );
      const qualified =
        /(?:주장|믿|생각|소문|전언|추측|불확실|확실하지|여(?:기|겼|긴)|아니|않|없|부정)/u;
      if (
        s.version !== 2 ||
        !['a_to_b', 'b_to_a', 'mutual', 'undirected', 'unknown'].includes(String(s.direction)) ||
        !['family', 'social', 'emotion', 'action'].includes(String(s.kind)) ||
        !['ongoing', 'event'].includes(String(s.temporal_scope)) ||
        !['active', 'ended'].includes(String(s.state)) ||
        !['fact', 'belief', 'claim', 'rumor', 'uncertain', 'negated'].includes(
          String(s.assertion_status)
        ) ||
        s.assertion_status !== r.assertion_status ||
        !nonempty(s.relation_key) ||
        !/^[a-z][a-z0-9_:-]{1,79}$/.test(s.relation_key) ||
        !nonempty(s.summary) ||
        s.summary.length > 500 ||
        ![r.character_a, r.character_b].every(
          (name) => nonempty(name) && (s.summary as string).includes(name)
        ) ||
        !semanticEvidence ||
        JSON.stringify(semanticEvidence) !== JSON.stringify(relationshipEvidence) ||
        /^(?:욕망|관계|감정|관심|연결|인연|애정|갈등|적대|사랑|desire|relationship|emotion)$/iu.test(
          (r.label as string).trim()
        ) ||
        (attributed &&
          (!nonempty(s.attribution) || !(s.summary as string).includes(s.attribution))) ||
        (s.attribution !== undefined &&
          (!nonempty(s.attribution) || !semanticEvidence.quote.includes(s.attribution))) ||
        (s.assertion_status !== 'fact' && !qualified.test(s.summary as string))
      ) {
        hold(
          'relationship',
          item,
          'Complete semantic v2 contract, specific predicate, qualified subject/object summary and exact dated evidence required'
        );
        continue;
      }
      // Only the versioned contract is persisted; extra model keys never become public JSON.
      semantics = {
        version: 2,
        direction: s.direction,
        kind: s.kind,
        relation_key: s.relation_key,
        summary: s.summary,
        assertion_status: s.assertion_status,
        temporal_scope: s.temporal_scope,
        state: s.state,
        evidence: semanticEvidence,
        ...(s.attribution !== undefined ? { attribution: s.attribution } : {}),
        ...(s.change_evidence !== undefined ? { change_evidence: s.change_evidence } : {}),
      } as RelationshipSemantics;
    }
    const needsChangeEvidence =
      r.change_type === 'transition' ||
      r.change_type === 'disclosure' ||
      semantics?.state === 'ended';
    const changeEvidence =
      needsChangeEvidence || r.change_evidence !== undefined
        ? validEvidence(r.change_evidence, pages, r.established_page, [
            r.character_a,
            r.character_b,
          ])
        : undefined;
    const innerChange =
      semantics?.change_evidence === undefined
        ? undefined
        : validEvidence(semantics.change_evidence, pages, r.established_page, [
            r.character_a,
            r.character_b,
          ]);
    if (
      (semantics?.change_evidence !== undefined &&
        (!innerChange ||
          !changeEvidence ||
          JSON.stringify(innerChange) !== JSON.stringify(changeEvidence))) ||
      (r.change_evidence !== undefined && !changeEvidence) ||
      (!semantics && r.assertion_status !== 'fact') ||
      !['establishment', 'restatement', 'transition', 'disclosure'].includes(
        String(r.change_type)
      ) ||
      (needsChangeEvidence && !changeEvidence)
    ) {
      hold(
        'relationship',
        item,
        'Established fact/status required; a transition or disclosure needs exact dated change evidence'
      );
      continue;
    }
    const source = pages.find((p) => p.page_no === relationshipEvidence.source_page)!;
    const following = source.content.slice(
      relationshipEvidence.end_char,
      relationshipEvidence.end_char + 1000
    );
    const next = pages.find((p) => p.page_no === source.page_no + 1);
    const nearby =
      following.length < 1000
        ? following + ' ' + (next?.content.slice(0, 1000 - following.length) ?? '')
        : following;
    const relationshipIssue =
      !semantics || semantics.assertion_status === 'fact'
        ? relationshipReviewReason(r.label as string, relationshipEvidence.quote, nearby)
        : undefined;
    if (relationshipIssue) {
      hold('relationship', item, relationshipIssue);
      continue;
    }
    relationships.push({
      ...r,
      evidence: relationshipEvidence,
      ...(semantics
        ? {
            semantics: {
              ...semantics,
              ...(changeEvidence ? { change_evidence: changeEvidence } : {}),
            },
          }
        : {}),
      ...(changeEvidence ? { change_evidence: changeEvidence } : {}),
    } as unknown as GroundedRelationship);
  }
  return { characters, relationships, review };
}

/** Includes split content/positions, chapter metadata and extraction contract version. */
export function groundingManifest(
  chapter: Chapter,
  pages: Page[],
  known: string[] = [],
  extractionContract = 'grounded-agent-v4-relationship-semantics'
): { schema_version: number; source_hash: string } {
  return {
    schema_version: GROUNDING_SCHEMA_VERSION,
    source_hash: createHash('sha256')
      .update(
        JSON.stringify({
          chapter,
          known,
          extractionContract,
          pages: pages.map(({ book_id, page_no, content }) => ({ book_id, page_no, content })),
        })
      )
      .digest('hex'),
  };
}

export function assertGroundingCache(
  input: unknown,
  chapter: Chapter,
  pages: Page[],
  known: string[] = [],
  extractionContract = 'grounded-agent-v4-relationship-semantics'
): void {
  const cached = object(object(input).grounding);
  const expected = groundingManifest(chapter, pages, known, extractionContract);
  const { grounding: _grounding, ...content } = object(input);
  if (
    cached.schema_version !== expected.schema_version ||
    cached.source_hash !== expected.source_hash ||
    cached.content_hash !== digest(content)
  ) {
    throw new Error(
      `Stale/unverified chapter ${chapter.chapter_no} cache: preserve it for review, then regenerate explicitly`
    );
  }
}

/** Seal raw candidates plus review metadata, before replay can consume the cache. */
export function sealChapterCache<T extends Record<string, unknown>>(
  data: T,
  chapter: Chapter,
  pages: Page[],
  known: string[] = [],
  extractionContract = 'grounded-agent-v4-relationship-semantics'
): T & { grounding: ReturnType<typeof groundingManifest> & { content_hash: string } } {
  const { grounding: _previous, ...content } = data;
  return {
    ...data,
    grounding: {
      ...groundingManifest(chapter, pages, known, extractionContract),
      content_hash: digest(content),
    },
  };
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/** An integrity seal, not a signature: catches stale/accidentally edited local artifacts. */
export function sealResolvedOutput<T extends Record<string, unknown>>(
  data: T,
  pages: Page[]
): T & {
  grounding: { schema_version: number; source_hash: string; content_hash: string };
} {
  const { grounding: _previous, ...content } = data;
  return {
    ...data,
    grounding: {
      schema_version: GROUNDING_SCHEMA_VERSION,
      source_hash: digest(
        pages.map(({ book_id, page_no, content }) => ({ book_id, page_no, content }))
      ),
      content_hash: digest(content),
    },
  };
}

export function assertResolvedGrounding(data: unknown, pages: Page[]): void {
  const record = object(data);
  const expected = sealResolvedOutput(record, pages).grounding;
  const actual = object(record.grounding);
  if (
    actual.schema_version !== expected.schema_version ||
    actual.source_hash !== expected.source_hash ||
    actual.content_hash !== expected.content_hash ||
    record.book_id !== pages[0]?.book_id
  ) {
    throw new Error(
      'Grounding manifest missing or changed: preserve the artifact and regenerate/review explicitly'
    );
  }
}

export async function assertStoredGrounding(
  client: {
    query(sql: string, params?: unknown[]): Promise<unknown>;
  },
  data: unknown,
  bookId: string
): Promise<void> {
  const result = (await client.query(
    'SELECT book_id, page_no, content FROM pages WHERE book_id = $1 ORDER BY page_no',
    [bookId]
  )) as {
    rows: { book_id: string; page_no: number; content: string }[];
  };
  assertResolvedGrounding(
    data,
    result.rows.map((page) => ({ ...page, id: `${bookId}-p${page.page_no}` }))
  );
}

/** Call inside the registration transaction; locks the book until initial import completes. */
export async function assertInitialRegistration(
  client: {
    query(sql: string, params?: unknown[]): Promise<unknown>;
  },
  bookId: string
): Promise<void> {
  const locked = (await client.query(
    'SELECT publish_status FROM books WHERE book_id = $1 FOR UPDATE',
    [bookId]
  )) as {
    rows: { publish_status: string }[];
  };
  const book = locked.rows[0];
  if (!book || book.publish_status !== 'draft') {
    throw new Error(
      'Initial import only: existing/published content requires a separately reviewed migration preserving IDs, corrections and review history'
    );
  }
  // A new statement after waiting for the lock gets a fresh READ COMMITTED snapshot.
  const result = (await client.query(
    `SELECT
    (EXISTS (SELECT 1 FROM characters WHERE book_id = $1)
      OR EXISTS (SELECT 1 FROM aliases WHERE book_id = $1)
      OR EXISTS (SELECT 1 FROM character_notes WHERE book_id = $1)
      OR EXISTS (SELECT 1 FROM relationships WHERE book_id = $1)
      OR EXISTS (SELECT 1 FROM chapter_summaries WHERE book_id = $1)
      OR EXISTS (SELECT 1 FROM terms WHERE book_id = $1)
      OR EXISTS (SELECT 1 FROM events WHERE book_id = $1)
      OR EXISTS (SELECT 1 FROM background_and_intro WHERE book_id = $1)) AS has_generated_content
    FROM books WHERE book_id = $1`,
    [bookId]
  )) as {
    rows: { publish_status: string; has_generated_content: boolean }[];
  };
  if (result.rows[0]?.has_generated_content !== false) {
    throw new Error(
      'Initial import only: existing/published content requires a separately reviewed migration preserving IDs, corrections and review history'
    );
  }
}
