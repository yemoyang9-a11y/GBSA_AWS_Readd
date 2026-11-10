'use strict';
// Audited data repair. No connection without an explicit mode; --apply is the only commit path.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const backend = path.resolve(__dirname, '..');
const dataDir = path.join(backend, 'data/repairs');
const tables = {
  aliases: { keys: ['book_id', 'alias', 'character_id'], mutable: ['alias', 'alias_type', 'first_appearance_page'] },
  relationships: { keys: ['id', 'book_id'], mutable: ['label', 'established_page'] },
  characters: { keys: ['id', 'book_id'], mutable: ['first_appearance_page'] },
};
const contentTables = ['pages', 'aliases', 'relationships', 'characters', 'characterNotes', 'chapters'];
const fail = code => { throw Object.assign(new Error(code), { code }); };
const stable = value => JSON.stringify(canonical(value));
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
const hash = value => crypto.createHash('sha256').update(stable(value)).digest('hex');
const equal = (a, b) => stable(a) === stable(b);
const rowKey = (table, row) => stable(tables[table].keys.map(key => row[key]));
const sorted = rows => [...rows].sort((a, b) => stable(a).localeCompare(stable(b), 'en'));
function fingerprints(snapshot) {
  return Object.fromEntries(contentTables.map(table => [table, hash(sorted(snapshot[table]))]));
}
function planRepair(before, manifest, scope) {
  if (manifest.schemaVersion !== 1 || manifest.bookId !== 'takryu') fail('MANIFEST_VERSION');
  const targets = new Map(scope.targets.map(row => [row.auditRowId, row]));
  const ids = manifest.operations.map(op => op.auditRowId);
  if (ids.length !== targets.size || new Set(ids).size !== ids.length || ids.some(id => !targets.has(id))) fail('SCOPE_MISMATCH');
  if (scope.baselineHashes && !equal(fingerprints(before), scope.baselineHashes)) fail('BASELINE_DRIFT');
  const after = structuredClone(before);
  for (const op of manifest.operations) {
    const target = targets.get(op.auditRowId);
    const spec = tables[op.table];
    if (!spec || target.table !== op.table || !equal(target.record, op.before) || op.before.book_id !== 'takryu') fail('SCOPE_MISMATCH');
    const key = rowKey(op.table, op.before);
    if (!equal(op.key, Object.fromEntries(spec.keys.map(k => [k, op.before[k]])))) fail('KEY_MISMATCH');
    const matches = after[op.table].filter(row => rowKey(op.table, row) === key);
    if (matches.length !== 1 || !equal(matches[0], op.before)) fail('BEFORE_MISMATCH');
    if (!op.reason || !op.evidenceQuotes?.length || op.evidenceQuotes.some(e => !e.quote || !before.pages.find(p => p.page_no === e.page)?.content.includes(e.quote))) fail('EVIDENCE_MISMATCH');
    if (op.after !== null) {
      if (!equal(Object.keys(op.before).sort(), Object.keys(op.after).sort())) fail('COLUMN_MISMATCH');
      for (const field of Object.keys(op.before)) {
        if (!spec.mutable.includes(field) && !equal(op.before[field], op.after[field])) fail('IMMUTABLE_FIELD');
      }
      if (equal(op.before, op.after)) fail('NOOP_REPAIR');
      const page = op.after.established_page ?? op.after.first_appearance_page;
      if (!Number.isInteger(page) || !before.pages.some(p => p.page_no === page)) fail('INVALID_PAGE');
      if (op.table === 'aliases' && (!['name', 'title', 'kinship', 'nickname'].includes(op.after.alias_type) || !op.after.alias.trim())) fail('INVALID_ALIAS');
      if (op.table === 'relationships' && !op.after.label.trim()) fail('INVALID_RELATIONSHIP');
      if (after[op.table].some(row => rowKey(op.table, row) !== key && rowKey(op.table, row) === rowKey(op.table, op.after))) fail('KEY_COLLISION');
      after[op.table][after[op.table].indexOf(matches[0])] = structuredClone(op.after);
    } else {
      if (op.table === 'characters') fail('CHARACTER_DELETE_FORBIDDEN');
      after[op.table] = after[op.table].filter(row => rowKey(op.table, row) !== key);
    }
  }
  for (const protectedRow of scope.protectedRows) {
    const actual = after[protectedRow.table].find(row => rowKey(protectedRow.table, row) === rowKey(protectedRow.table, protectedRow.record));
    if (!equal(actual, protectedRow.record)) fail('PROTECTED_ROW_CHANGED');
  }
  // New/changed facts must not predate either character. Existing held facts remain untouched.
  for (const op of manifest.operations.filter(op => op.after && op.table === 'relationships')) {
    const minimum = Math.max(...[op.after.character_a_id, op.after.character_b_id].map(id => after.characters.find(c => c.id === id)?.first_appearance_page ?? Infinity));
    if (op.after.established_page < minimum) fail('RELATIONSHIP_BEFORE_CHARACTER');
  }
  return after;
}

function statement(op) {
  const spec = tables[op.table];
  if (!spec) fail('INVALID_TABLE');
  const fields = Object.keys(op.before);
  // All identifiers come from the verified audit schema, never from CLI input.
  if (fields.some(field => ![...spec.keys, ...spec.mutable, 'name', 'character_a_id', 'character_b_id'].includes(field))) fail('INVALID_COLUMN');
  const values = [];
  const param = value => { values.push(value); return '$' + values.length; };
  const set = op.after === null ? '' : spec.mutable.filter(field => !equal(op.before[field], op.after[field])).map(field => `"${field}"=${param(op.after[field])}`).join(',');
  const where = fields.map(field => `"${field}" IS NOT DISTINCT FROM ${param(op.before[field])}`).join(' AND ');
  return { text: op.after === null ? `DELETE FROM public.${op.table} WHERE ${where}` : `UPDATE public.${op.table} SET ${set} WHERE ${where}`, values };
}

async function snapshot(db) {
  const select = async sql => (await db.query(sql, ['takryu'])).rows;
  return {
    pages: await select('SELECT page_no,content FROM public.pages WHERE book_id=$1 ORDER BY page_no'),
    aliases: await select('SELECT * FROM public.aliases WHERE book_id=$1'),
    relationships: await select('SELECT * FROM public.relationships WHERE book_id=$1'),
    characters: await select('SELECT * FROM public.characters WHERE book_id=$1'),
    characterNotes: await select('SELECT * FROM public.character_notes WHERE book_id=$1'),
    chapters: await select('SELECT * FROM public.chapters WHERE book_id=$1'),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const modes = ['--check-plan', '--preflight', '--apply', '--verify'];
  if (!args.length) return emit({ status: 'dry-run', databaseConnections: 0, databaseWrites: 0, modes });
  const mode = args.shift();
  if (!modes.includes(mode)) fail('INVALID_MODE');
  const options = {};
  while (args.length) {
    const key = args.shift();
    if (!['--snapshot', '--output-dir'].includes(key) || !args.length || options[key]) fail('INVALID_ARGUMENT');
    options[key] = path.resolve(args.shift());
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(dataDir, 'takryu-2026-10-22.json'), 'utf8'));
  const scope = JSON.parse(fs.readFileSync(path.join(dataDir, 'takryu-2026-10-22-scope.json'), 'utf8'));
  if (scope.targets.length !== 169 || scope.protectedRows.filter(r => r.verdict === 'needs_review').length !== 44) fail('AUDIT_SCOPE_MISMATCH');
  const summary = {
    auditedRows: 160, characterPages: 8, dependentCharacterPages: 1,
    operations: manifest.operations.length,
    updates: manifest.operations.filter(op => op.after !== null).length,
    deletes: manifest.operations.filter(op => op.after === null).length,
    preservedReviewRows: 44,
  };
  if (mode === '--check-plan') {
    if (!options['--snapshot']) fail('SNAPSHOT_REQUIRED');
    const before = JSON.parse(fs.readFileSync(options['--snapshot'], 'utf8'));
    const after = planRepair(before, manifest, scope);
    return emit({ status: 'plan-verified', ...summary, afterCounts: Object.fromEntries(contentTables.map(t => [t, after[t].length])), databaseConnections: 0, databaseWrites: 0 });
  }
  if (!options['--output-dir']) fail('OUTPUT_DIRECTORY_REQUIRED');
  fs.mkdirSync(options['--output-dir'], { recursive: true });
  const save = (file, value, exclusive = true) => fs.writeFileSync(path.join(options['--output-dir'], file), JSON.stringify(value, null, 2) + '\n', { flag: exclusive ? 'wx' : 'w' });
  for (const method of ['log', 'info', 'warn', 'error', 'debug', 'trace']) console[method] = () => {};
  const loaded = require('dotenv').config({ path: path.join(backend, '.env'), override: true });
  if (loaded.error) fail('ENV_LOAD_FAILED');
  const url = new URL(process.env.DATABASE_URL);
  if (url.hostname !== 'aws-0-ap-northeast-1.pooler.supabase.com' || decodeURIComponent(url.username) !== 'postgres.dzoejwecyyilehiktvcg' || ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'ssl'].some(k => url.searchParams.has(k))) fail('DATABASE_TARGET_MISMATCH');
  process.env.NODE_ENV = 'production'; process.env.DB_POOL_MAX = '1';
  require('ts-node').register({ project: path.join(backend, 'tsconfig.json') });
  ({ pool } = require('../src/config/database'));
  pool.on('error', () => { process.exitCode = 1; });
  client = await pool.connect();
  stage = mode.slice(2);
  await client.query(mode === '--apply' ? 'BEGIN ISOLATION LEVEL SERIALIZABLE' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await client.query("SET LOCAL statement_timeout='15000'");
  await client.query("SET LOCAL lock_timeout='3000'");
  if (mode === '--apply') await client.query('LOCK TABLE public.aliases,public.characters,public.relationships IN SHARE ROW EXCLUSIVE MODE');
  const actual = await snapshot(client);
  if (mode === '--verify') {
    const backup = JSON.parse(fs.readFileSync(path.join(options['--output-dir'], 'before.json'), 'utf8'));
    if (backup.manifestSha256 !== hash(manifest)) fail('BACKUP_MANIFEST_MISMATCH');
    const expected = planRepair(backup.before, manifest, scope);
    if (!equal(fingerprints(actual), fingerprints(expected))) fail('POST_REPAIR_MISMATCH');
    await client.query('ROLLBACK');
    const result = { checkedAt: new Date().toISOString(), status: 'verified', ...summary, nonTargetRowsUnchanged: true, fingerprints: fingerprints(actual), independentConnection: true };
    save('verification.json', result, false);
    return emit(result);
  }
  const expected = planRepair(actual, manifest, scope);
  const triggers = (await client.query("SELECT tgname FROM pg_trigger WHERE tgrelid IN ('public.aliases'::regclass,'public.characters'::regclass,'public.relationships'::regclass) AND NOT tgisinternal")).rows;
  const incoming = (await client.query("SELECT conname FROM pg_constraint WHERE contype='f' AND confrelid IN ('public.aliases'::regclass,'public.relationships'::regclass)")).rows;
  if (triggers.length || incoming.length) fail('DEPENDENCIES_CHANGED');
  if (mode === '--preflight') {
    await client.query('ROLLBACK');
    save('preflight.json', { checkedAt: new Date().toISOString(), ...summary, manifestSha256: hash(manifest), beforeHashes: fingerprints(actual), expectedHashes: fingerprints(expected) });
    return emit({ status: 'ready', ...summary, databaseWrites: 0 });
  }
  save('before.json', { capturedAt: new Date().toISOString(), manifestSha256: hash(manifest), before: actual });
  for (const op of manifest.operations) {
    if ((await client.query(statement(op))).rowCount !== 1) fail('WRITE_ROW_COUNT_MISMATCH');
  }
  const after = await snapshot(client);
  if (!equal(fingerprints(after), fingerprints(expected))) fail('UNEXPECTED_DATA_CHANGE');
  stage = 'commit'; commitAttempted = true;
  await client.query('COMMIT'); committed = true;
  save('applied.json', { committedAt: new Date().toISOString(), ...summary, fingerprints: fingerprints(after) });
  emit({ status: 'committed', ...summary, nonTargetRowsUnchanged: true });
  // Verification is deliberately a separate invocation/connection, using before.json.
}

let pool, client, committed = false, commitAttempted = false, stage = 'arguments';
const emit = value => process.stdout.write(JSON.stringify(value) + '\n');
if (require.main === module) main().catch(async error => {
  if (client) try { await client.query('ROLLBACK'); } catch {}
  emit({ status: 'failed', stage, committed, commitOutcome: committed ? 'committed' : commitAttempted ? 'unknown-run-verify-before-retrying' : 'not-committed', code: /^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'UNEXPECTED_ERROR' });
  process.exitCode = 1;
}).finally(async () => { if (client) client.release(); if (pool) await pool.end(); });

module.exports = { planRepair, fingerprints, statement, hash };
