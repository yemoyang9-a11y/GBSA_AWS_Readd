import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { createHash } from 'crypto';
import { splitBook } from '../../src/batch/pipeline/split';

const script = path.resolve(__dirname, '../../scripts/apply-takryu-full-repair.cjs');
const { planRepair } = require(script);

function fixture() {
  const character = { id: 'c1', book_id: 'takryu', name: '행화', first_appearance_page: 21 };
  const alias = {
    book_id: 'takryu',
    alias: '기생',
    character_id: 'c1',
    alias_type: 'title',
    first_appearance_page: 21,
  };
  const before = {
    pages: [{ page_no: 20, content: '길 건너편에서 행화가 나온다.' }],
    characters: [character],
    aliases: [alias],
    relationships: [],
    characterNotes: [],
    chapters: [],
  };
  const operation = {
    auditRowId: 'E001',
    table: 'characters',
    key: { id: 'c1', book_id: 'takryu' },
    before: character,
    after: { ...character, first_appearance_page: 20 },
    reason: '원문 최초 등장',
    evidenceQuotes: [{ page: 20, quote: '행화가 나온다.' }],
  };
  const manifest = { schemaVersion: 1, bookId: 'takryu', operations: [operation] };
  const scope = {
    targets: [{ auditRowId: 'E001', table: 'characters', record: character }],
    protectedRows: [{ auditRowId: 'A001', table: 'aliases', record: alias }],
  };
  return { before, manifest, scope };
}

describe('audited book repair safety', () => {
  it('does not connect to a database without an explicit mode', () => {
    const result = spawnSync(process.execPath, [script], { encoding: 'utf8', env: {} });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: 'dry-run',
      databaseConnections: 0,
      databaseWrites: 0,
    });
  });
  it('changes only the audited page and preserves the held alias and source', () => {
    const { before, manifest, scope } = fixture();
    const after = planRepair(before, manifest, scope);
    expect(after.characters).toEqual([
      { id: 'c1', book_id: 'takryu', name: '행화', first_appearance_page: 20 },
    ]);
    expect(after.aliases).toEqual([
      {
        book_id: 'takryu',
        alias: '기생',
        character_id: 'c1',
        alias_type: 'title',
        first_appearance_page: 21,
      },
    ]);
    expect(after.pages).toEqual([{ page_no: 20, content: '길 건너편에서 행화가 나온다.' }]);
    expect(before.characters[0].first_appearance_page).toBe(21);
  });
  it('refuses a row changed since the audit', () => {
    const { before, manifest, scope } = fixture();
    before.characters = [{ ...before.characters[0], first_appearance_page: 22 }];
    expect(() => planRepair(before, manifest, scope)).toThrow('BEFORE_MISMATCH');
  });
  it('refuses an additional edit to a held row', () => {
    const { before, manifest, scope } = fixture();
    (manifest.operations as unknown[]).push({
      auditRowId: 'A001',
      table: 'aliases',
      before: before.aliases[0],
      after: null,
    });
    expect(() => planRepair(before, manifest, scope)).toThrow('SCOPE_MISMATCH');
  });
  it('refuses an unsupported evidence quote even when the page exists', () => {
    const { before, manifest, scope } = fixture();
    manifest.operations[0].evidenceQuotes[0].quote = '백석이 나온다.';
    expect(() => planRepair(before, manifest, scope)).toThrow('EVIDENCE_MISMATCH');
  });
  it('refuses identity changes hidden inside a page repair', () => {
    const { before, manifest, scope } = fixture();
    manifest.operations[0].after.name = '새 인물';
    expect(() => planRepair(before, manifest, scope)).toThrow('IMMUTABLE_FIELD');
  });
  it('refuses a duplicated operation rather than editing a row twice', () => {
    const { before, manifest, scope } = fixture();
    manifest.operations.push(manifest.operations[0]);
    expect(() => planRepair(before, manifest, scope)).toThrow('SCOPE_MISMATCH');
  });

  it('validates every approved repair against the committed original book and preserves all 135 non-target rows', () => {
    const root = path.resolve(__dirname, '../..');
    const manifest = JSON.parse(
      fs.readFileSync(path.join(root, 'data/repairs/takryu-2026-10-22.json'), 'utf8')
    );
    const scope = JSON.parse(
      fs.readFileSync(path.join(root, 'data/repairs/takryu-2026-10-22-scope.json'), 'utf8')
    );
    const raw = fs.readFileSync(path.join(root, 'data/raw/takryu.txt'), 'utf8');
    const pages = splitBook(raw, 'takryu').pages.map(({ page_no, content }) => ({
      page_no,
      content,
    }));
    const audited = [...scope.targets, ...scope.protectedRows] as {
      table: string;
      record: Record<string, unknown>;
    }[];
    const before = {
      pages,
      aliases: audited.filter((r) => r.table === 'aliases').map((r) => r.record),
      relationships: audited.filter((r) => r.table === 'relationships').map((r) => r.record),
      // Other endpoints are included in the frozen character inventory, independently
      // of operation.after, so a repaired relationship cannot predate its characters.
      characters: scope.characterBaseline,
      characterNotes: [],
      chapters: [],
    };
    expect(pages).toHaveLength(411);
    expect(createHash('sha256').update(JSON.stringify(pages)).digest('hex')).toBe(
      scope.sourcePagesSha256
    );
    expect(manifest.operations).toHaveLength(169);
    expect(scope.protectedRows).toHaveLength(135);
    const after = planRepair(before, manifest, { ...scope, baselineHashes: undefined });
    expect(after.aliases).toHaveLength(89);
    expect(after.relationships).toHaveLength(121);
    expect(after.characters).toHaveLength(52);
  });
});
