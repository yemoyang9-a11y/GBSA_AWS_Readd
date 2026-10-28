/* Local PostgreSQL execution. Requires optional validation-only @electric-sql/pglite via NODE_PATH.
 * Never uses DATABASE_URL and never writes to a remote service.
 * Run from backend: NODE_PATH=/tmp/ssabi-relation-tools/node_modules node scripts/verify-relationship-storage.cjs OUTDIR
 */
require('../node_modules/ts-node/register/transpile-only');
const { PGlite } = require('@electric-sql/pglite');
const { registerBook, registerGeneratedContent } = require('../src/batch/pipeline/register');
const { createPgSsabiRepository } = require('../src/modules/ssabi/pg-repository');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

async function main() {
  const out = path.resolve(process.argv[2] || '../../relationship-validation');
  fs.mkdirSync(out, { recursive: true });
  const db = new PGlite();
  try {
    // Original content-store schema excluding ONLY unrelated embedding extension/column/index.
    const baseline = fs
      .readFileSync(path.join(__dirname, '../migrations/001_content_store.sql'), 'utf8')
      .replace(/^CREATE EXTENSION IF NOT EXISTS vector;.*$/m, '')
      .replace(/^\s*embedding vector\(1024\),.*$/m, '')
      .replace(/^CREATE INDEX IF NOT EXISTS ix_pages_embedding.*$/m, '');
    await db.exec(baseline);
    const migration = fs.readFileSync(
      path.join(__dirname, '../migrations/006_relationship_semantics.sql'),
      'utf8'
    );
    await db.exec(migration);
    await db.exec(migration); // idempotence of the real migration
    const source = {
      2: '지우는 민서를 신뢰했다. 민서는 지우를 의심했다. 두 사람은 남매였다.',
      3: '지우는 민서의 짐을 들어 주었다.',
      5: '지우는 이제 민서를 신뢰하지 않게 되었다.',
      6: '지우는 민서의 짐을 다시 들어 주었다.',
      9: '나중에 만나는 새로운 인물.',
    };
    const pages = Object.entries(source).map(([p, content]) => ({
      book_id: 'storage-fixture',
      page_no: Number(p),
      content,
    }));
    const proof = (page, quote) => ({
      source_page: page,
      quote,
      start_char: source[page].indexOf(quote),
      end_char: source[page].indexOf(quote) + quote.length,
    });
    const semantic = (overrides = {}) => ({
      version: 2,
      direction: 'a_to_b',
      kind: 'emotion',
      relation_key: 'trust',
      summary: '지우는 민서를 신뢰한다.',
      assertion_status: 'fact',
      temporal_scope: 'ongoing',
      state: 'active',
      evidence: proof(2, '지우는 민서를 신뢰했다.'),
      ...overrides,
    });
    const row = (id, page, semantics) => ({
      id,
      character_a_id: 'z-jiu',
      character_b_id: 'a-minseo',
      label: id,
      established_page: page,
      semantics,
    });
    const data = {
      book_id: 'storage-fixture',
      chapter_summaries: [],
      terms: [],
      events: [],
      background_and_intro: { background: '', intro: '' },
      characters: [
        { id: 'z-jiu', name: '지우', first_appearance_page: 2, aliases: [], notes: [] },
        { id: 'a-minseo', name: '민서', first_appearance_page: 2, aliases: [], notes: [] },
        { id: 'future', name: '나중 인물', first_appearance_page: 9, aliases: [], notes: [] },
      ],
      relationships: [
        row('trust', 2, semantic()),
        row(
          'distrust-reverse',
          2,
          semantic({
            direction: 'b_to_a',
            relation_key: 'distrust',
            summary: '민서는 지우를 의심한다.',
            evidence: proof(2, '민서는 지우를 의심했다.'),
          })
        ),
        row(
          'siblings',
          2,
          semantic({
            direction: 'mutual',
            kind: 'family',
            relation_key: 'siblings',
            summary: '두 사람은 남매다.',
            evidence: proof(2, '두 사람은 남매였다.'),
          })
        ),
        row(
          'trust-ended',
          5,
          semantic({
            state: 'ended',
            summary: '지우는 더는 민서를 신뢰하지 않는다.',
            evidence: proof(5, source[5]),
            change_evidence: proof(5, source[5]),
          })
        ),
        row(
          'help-once',
          3,
          semantic({
            kind: 'action',
            relation_key: 'help',
            temporal_scope: 'event',
            summary: '지우가 민서의 짐을 들어 주었다.',
            evidence: proof(3, source[3]),
          })
        ),
        row(
          'help-twice',
          6,
          semantic({
            kind: 'action',
            relation_key: 'help',
            temporal_scope: 'event',
            summary: '지우가 민서의 짐을 다시 들어 주었다.',
            evidence: proof(6, source[6]),
          })
        ),
      ],
    };
    await registerBook(
      db,
      { book_id: data.book_id, title: '관계 검증용 창작 발췌', author: 'validation fixture' },
      [],
      pages
    );
    await registerGeneratedContent(db, data);
    const repo = createPgSsabiRepository(db);
    const graphs = {};
    for (const cutoff of [1, 2, 3, 5, 6])
      graphs[cutoff] = await repo.getGraph(data.book_id, cutoff);
    assert.equal(graphs[1].edges.length, 0);
    assert.equal(graphs[2].edges.length, 3);
    assert.equal(graphs[3].edges.length, 4);
    assert.equal(graphs[5].edges.length, 4);
    assert.equal(graphs[6].edges.length, 5);
    assert.equal(graphs[6].history.length, 6);
    assert.ok(graphs[3].edges.some((e) => e.id === 'trust'));
    assert.ok(!graphs[3].edges.some((e) => e.id === 'trust-ended'));
    assert.ok(!graphs[5].edges.some((e) => e.id === 'trust'));
    const trust = graphs[2].edges.find((e) => e.id === 'trust');
    assert.equal(trust.source, 'a-minseo');
    assert.equal(trust.target, 'z-jiu');
    assert.equal(trust.semantics.direction, 'b_to_a');

    const insert =
      'INSERT INTO relationships (id,book_id,character_a_id,character_b_id,label,established_page,semantics) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)';
    await assert.rejects(
      db.query(insert, [
        'future-evidence',
        data.book_id,
        'a-minseo',
        'z-jiu',
        'future',
        2,
        JSON.stringify(semantic({ evidence: proof(9, source[9]) })),
      ])
    );
    await assert.rejects(
      db.query(insert, [
        'incomplete-semantics',
        data.book_id,
        'a-minseo',
        'z-jiu',
        'bad',
        2,
        JSON.stringify({ version: 2 }),
      ])
    );
    await db.query(insert, [
      'wrong-quote',
      data.book_id,
      'a-minseo',
      'z-jiu',
      'not in source',
      2,
      JSON.stringify(
        semantic({
          evidence: { source_page: 2, quote: '원문에 없는 문장', start_char: 0, end_char: 10 },
        })
      ),
    ]);
    await db.query(insert, [
      'future-endpoint',
      data.book_id,
      'a-minseo',
      'future',
      'future person',
      2,
      null,
    ]);
    const bounded = await repo.getGraph(data.book_id, 6);
    assert.ok(!bounded.history.some((e) => e.id === 'wrong-quote' || e.id === 'future-endpoint'));
    fs.writeFileSync(path.join(out, 'storage-graphs.json'), JSON.stringify(graphs, null, 2));
    fs.writeFileSync(
      path.join(out, 'storage-fixture.json'),
      JSON.stringify({ source, data }, null, 2)
    );
    const result = {
      status: 'passed',
      engine: 'PGlite (PostgreSQL WASM), local only',
      real_sql: true,
      mock_model: true,
      checks: [
        'migration twice',
        'pipeline register -> PostgreSQL -> production repository',
        'canonical reversal preserves direction',
        'parallel reverse/kind tracks',
        'event occurrences',
        'bounded history/rewind',
        'end state not visible early',
        'future evidence rejected by DB',
        'missing semantics rejected',
        'mismatched source quote excluded',
        'future endpoint excluded',
      ],
      limitations: [
        'Synthetic source/candidates; no live model in this run',
        'Embedding columns omitted from baseline schema; not relevant to relationship queries',
        'No remote deployed DB migration',
      ],
    };
    fs.writeFileSync(path.join(out, 'storage-results.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await db.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
