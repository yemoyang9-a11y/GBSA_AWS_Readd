/**
 * FR-ADM-001 원문 등록 — 도서·장 경계·페이지를 공개 콘텐츠 스토어에 적재한다.
 * 공개 콘텐츠 스토어의 유일한 쓰기 주체는 파이프라인(⑦)이다 (4.3절).
 *
 * DB 커넥션 대신 최소 인터페이스(QueryClient)를 받아, 실제 pg.Pool과
 * 테스트용 mock 양쪽에 그대로 쓸 수 있게 한다.
 */
import { Chapter, Page } from '../../shared/types';
import { ResolvedBookData } from './check-integrity';
import { canonicalRelationship, AccumulatedRelationship } from './accumulate';
import { assertResolvedGrounding } from './grounding';

export interface QueryClient {
  query(sql: string, params?: unknown[]): Promise<unknown>;
}

export interface BookMeta {
  book_id: string;
  title: string;
  author: string;
  cover_url?: string;
  publish_year?: number;
  /** "분량" — 도서 소개용 짧은 문구(예: "411페이지"). total_pages 컬럼과 별개 — FR-BRW-003 */
  extent?: string;
}

type OwnedIdTable = 'characters' | 'character_notes' | 'relationships' | 'terms' | 'events';

/** FR-ADM-005: global row IDs never grant ownership of another book's content. */
async function assertIdOwnership(
  client: QueryClient,
  bookId: string,
  table: OwnedIdTable,
  ids: string[]
): Promise<void> {
  if (!ids.length) return;
  const result = (await client.query(
    `SELECT id FROM ${table} WHERE id = ANY($1::text[]) AND book_id <> $2 FOR UPDATE`,
    [[...new Set(ids)], bookId]
  )) as { rows: { id: string }[] };
  if (result.rows.length)
    throw new Error(`Content ID ownership conflict: ${table} ID belongs to another book`);
}

/** Conflict ownership is checked again atomically, including a concurrent insert after preflight. */
async function writeOwnedRow(
  client: QueryClient,
  table: OwnedIdTable,
  sql: string,
  params: unknown[]
): Promise<void> {
  const result = (await client.query(
    `${sql}
       WHERE ${table}.book_id = EXCLUDED.book_id RETURNING id`,
    params
  )) as { rows: { id: string }[] };
  if (result.rows.length !== 1 || result.rows[0].id !== params[0])
    throw new Error(
      `Content ID ownership conflict: ${table} write did not affect the intended book`
    );
}

/** 도서 메타 + 장 경계 + 페이지를 upsert한다. 완비 여부/공개 상태는 항상 draft로 등록한다(FR-ADM-006) */
export async function registerBook(
  client: QueryClient,
  meta: BookMeta,
  chapters: Chapter[],
  pages: Page[]
): Promise<void> {
  await client.query(
    `INSERT INTO books (book_id, title, author, cover_url, publish_year, extent, total_pages, ssabi_ready, publish_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, false, 'draft')
     ON CONFLICT (book_id) DO UPDATE SET
       title = $2, author = $3, cover_url = $4, publish_year = $5, extent = $6, total_pages = $7`,
    [
      meta.book_id,
      meta.title,
      meta.author,
      meta.cover_url ?? null,
      meta.publish_year ?? null,
      meta.extent ?? null,
      pages.length,
    ]
  );

  for (const chapter of chapters) {
    await client.query(
      `INSERT INTO chapters (book_id, chapter_no, title, start_page, end_page)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (book_id, chapter_no) DO UPDATE SET
         title = $3, start_page = $4, end_page = $5`,
      [chapter.book_id, chapter.chapter_no, chapter.title, chapter.start_page, chapter.end_page]
    );
  }

  for (const page of pages) {
    await client.query(
      `INSERT INTO pages (book_id, page_no, content)
       VALUES ($1, $2, $3)
       ON CONFLICT (book_id, page_no) DO UPDATE SET content = $3`,
      [page.book_id, page.page_no, page.content]
    );
  }
}

/**
 * S4/S5 산출물(all-resolved.json 형태)을 공개 콘텐츠 스토어에 적재한다.
 * FR-ADM-005 🚦: 검수 전 데이터도 등록은 가능하다 — 공개 전환(publish_status)만 검수 완료를 요구한다(R12).
 *
 * 선행 조건: registerBook으로 해당 도서·장이 이미 등록돼 있어야 한다(chapter_summaries가
 * chapters(book_id, chapter_no)를 FK로 참조).
 *
 * review_status는 여기서 건드리지 않는다 — 재실행 시 이미 검수된 판정을 되돌리면 안 된다(DDL 기본값 'pending'은 최초 삽입에만 적용).
 */
export async function registerGeneratedContent(
  client: QueryClient,
  data: ResolvedBookData
): Promise<void> {
  const { book_id } = data;
  // Complete every ownership preflight before readiness or content can be mutated.
  await assertIdOwnership(client, book_id, 'characters', [
    ...data.characters.map((c) => c.id),
    ...data.relationships.flatMap((r) => [r.character_a_id, r.character_b_id]),
  ]);
  await assertIdOwnership(
    client,
    book_id,
    'character_notes',
    data.characters.flatMap((c) => c.notes.map((n) => n.id))
  );
  await assertIdOwnership(
    client,
    book_id,
    'relationships',
    data.relationships.map((r) => r.id)
  );
  await assertIdOwnership(
    client,
    book_id,
    'terms',
    data.terms.map((t) => t.id)
  );
  await assertIdOwnership(
    client,
    book_id,
    'events',
    data.events.map((e) => e.id)
  );
  // R12 / FR-ADM-005: make existing public content unavailable BEFORE any mutation.
  // run-register-content uses a transaction; even a direct caller fails safely closed.
  await client.query(
    "UPDATE books SET ssabi_ready = false, publish_status = 'review' WHERE book_id = $1 AND (ssabi_ready OR publish_status = 'published')",
    [book_id]
  );

  for (const cs of data.chapter_summaries) {
    await client.query(
      `INSERT INTO chapter_summaries (book_id, chapter_no, summary)
       VALUES ($1, $2, $3)
       ON CONFLICT (book_id, chapter_no) DO UPDATE SET summary = $3`,
      [book_id, cs.chapter_no, cs.summary]
    );
  }

  for (const c of data.characters) {
    await writeOwnedRow(
      client,
      'characters',
      `INSERT INTO characters (id, book_id, name, first_appearance_page)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET name = $3, first_appearance_page = $4`,
      [c.id, book_id, c.name, c.first_appearance_page]
    );

    for (const a of c.aliases) {
      await client.query(
        `INSERT INTO aliases (book_id, alias, character_id, alias_type, first_appearance_page)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (book_id, alias, character_id) DO UPDATE SET alias_type = $4, first_appearance_page = $5`,
        [book_id, a.alias, c.id, a.type, a.first_appearance_page]
      );
    }

    for (const n of c.notes) {
      await writeOwnedRow(
        client,
        'character_notes',
        `INSERT INTO character_notes (id, book_id, character_id, note, source_page)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET note = $4, source_page = $5`,
        [n.id, book_id, c.id, n.note, n.source_page]
      );
    }
  }

  await registerRelationshipRows(client, book_id, data.relationships);

  for (const t of data.terms) {
    await writeOwnedRow(
      client,
      'terms',
      `INSERT INTO terms (id, book_id, term, definition, first_appearance_page)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET term = $3, definition = $4, first_appearance_page = $5`,
      [t.id, book_id, t.term, t.definition, t.first_appearance_page]
    );
  }

  for (const e of data.events) {
    await writeOwnedRow(
      client,
      'events',
      `INSERT INTO events (id, book_id, event, description, occurrence_page)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET event = $3, description = $4, occurrence_page = $5`,
      [e.id, book_id, e.event, e.description, e.occurrence_page]
    );
  }

  await client.query(
    `INSERT INTO background_and_intro (book_id, kind, content)
     VALUES ($1, 'background', $2)
     ON CONFLICT (book_id, kind) DO UPDATE SET content = $2`,
    [book_id, data.background_and_intro.background]
  );
  await client.query(
    `INSERT INTO background_and_intro (book_id, kind, content)
     VALUES ($1, 'intro', $2)
     ON CONFLICT (book_id, kind) DO UPDATE SET content = $2`,
    [book_id, data.background_and_intro.intro]
  );
}

async function registerRelationshipRows(
  client: QueryClient,
  book_id: string,
  relationships: AccumulatedRelationship[]
): Promise<void> {
  for (const r of relationships) {
    // FR-CHR-001: canonical storage preserves directional meaning; legacy rows remain unverified.
    const canonical = canonicalRelationship(r);
    await writeOwnedRow(
      client,
      'relationships',
      `INSERT INTO relationships (id, book_id, character_a_id, character_b_id, label, established_page, semantics)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       ON CONFLICT (id) DO UPDATE SET
         character_a_id = $3, character_b_id = $4, label = $5, established_page = $6, semantics = $7::jsonb`,
      [
        r.id,
        book_id,
        canonical.character_a_id,
        canonical.character_b_id,
        r.label,
        r.established_page,
        canonical.semantics ? JSON.stringify(canonical.semantics) : null,
      ]
    );
  }
}

/**
 * R12: explicit full-book replacement, never used for sample output or implicit cache replay.
 * Caller must hold a transaction and persist the returned before/after audit before COMMIT.
 * Existing character/alias corrections are preserved; unresolved regenerated IDs fail closed.
 */
export async function replaceRelationshipSnapshot(client: QueryClient, data: ResolvedBookData) {
  const coverage = data.provenance?.relationship_coverage;
  if (
    !coverage?.complete ||
    !data.relationships.length ||
    data.relationships.some((r) => r.semantics?.version !== 2)
  )
    throw new Error('A complete nonempty semantic-v2 relationship snapshot is required');
  const book = (await client.query(
    'SELECT publish_status FROM books WHERE book_id = $1 FOR UPDATE',
    [data.book_id]
  )) as { rows: unknown[] };
  if (!book.rows.length) throw new Error('Replacement book does not exist');
  const storedPages = (await client.query(
    'SELECT book_id, page_no, content FROM pages WHERE book_id = $1 ORDER BY page_no',
    [data.book_id]
  )) as { rows: Page[] };
  assertResolvedGrounding(data, storedPages.rows);
  const chapters = (await client.query(
    'SELECT chapter_no FROM chapters WHERE book_id = $1 ORDER BY chapter_no',
    [data.book_id]
  )) as { rows: { chapter_no: number }[] };
  const expectedChapters = chapters.rows.map((c) => c.chapter_no);
  const actualChapters = [...coverage.chapter_nos].sort((a, b) => a - b);
  if (
    coverage.source_page_count !== storedPages.rows.length ||
    JSON.stringify(actualChapters) !== JSON.stringify(expectedChapters) ||
    JSON.stringify(data.chapter_summaries.map((c) => c.chapter_no).sort((a, b) => a - b)) !==
      JSON.stringify(expectedChapters)
  )
    throw new Error('Complete source and every chapter must be processed before replacement');
  const characters = (await client.query('SELECT id FROM characters WHERE book_id = $1', [
    data.book_id,
  ])) as { rows: { id: string }[] };
  const ids = new Set(characters.rows.map((c) => c.id));
  if (data.relationships.some((r) => !ids.has(r.character_a_id) || !ids.has(r.character_b_id)))
    throw new Error(
      'Unmapped relationship endpoint identity; supply a reviewed existing-ID mapping first'
    );
  await assertIdOwnership(
    client,
    data.book_id,
    'relationships',
    data.relationships.map((r) => r.id)
  );
  const existing = (await client.query(
    'SELECT * FROM relationships WHERE book_id = $1 ORDER BY id',
    [data.book_id]
  )) as { rows: { id: string }[] };
  const nextIds = data.relationships.map((r) => r.id);
  if (new Set(nextIds).size !== nextIds.length)
    throw new Error('Relationship snapshot contains duplicate IDs');
  await client.query(
    "UPDATE books SET ssabi_ready = false, publish_status = 'review' WHERE book_id = $1",
    [data.book_id]
  );
  await registerRelationshipRows(client, data.book_id, data.relationships);
  await client.query(
    'DELETE FROM relationships WHERE book_id = $1 AND NOT (id = ANY($2::text[]))',
    [data.book_id, nextIds]
  );
  await client.query(
    "DELETE FROM review_records WHERE book_id = $1 AND target_type = 'relationship'",
    [data.book_id]
  );
  return {
    book_id: data.book_id,
    before: existing.rows,
    after: data.relationships.map(canonicalRelationship),
    removed_ids: existing.rows.filter((r) => !nextIds.includes(r.id)).map((r) => r.id),
    relationship_review: 'required',
    published: false,
  };
}
