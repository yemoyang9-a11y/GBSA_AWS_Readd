import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { call } from '../../modules/llm-gateway/gateway';
import { runRelationshipGeneration } from './run-generate-relationships';

jest.mock('../../modules/llm-gateway/gateway', () => ({ call: jest.fn() }));
const input = {
  book_id: 'other-novel',
  source: { kind: 'synthetic', description: 'Invented test, not a novel evaluation' },
  known_character_names: ['Ada', 'Ben'],
  chapters: [
    { id: 'c1', book_id: 'other-novel', chapter_no: 1, title: 'One', start_page: 1, end_page: 1 },
  ],
  pages: [{ id: 'p1', book_id: 'other-novel', page_no: 1, content: 'Ada employed Ben.' }],
};
let directory: string;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'relationships-'));
  jest.clearAllMocks();
});
afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

test('FR-DAT-005: generic run preserves raw malformed model candidates and reports semantic review pending', async () => {
  (call as jest.Mock).mockResolvedValue(JSON.stringify({ relationships: [{ label: 'desire' }] }));
  const out = await runRelationshipGeneration(input as never, directory);
  expect(out.book_id).toBe('other-novel');
  expect(out.counts).toEqual({ raw: 1, accepted: 0, held: 1 });
  expect(out.semantic_review).toBe('required');
  expect(out.public_store_updated).toBe(false);
  expect(
    JSON.parse(fs.readFileSync(path.join(directory, 'chapter-1.json'), 'utf8')).raw.relationships
  ).toEqual([{ label: 'desire' }]);
});

test('FR-DAT-005: exact sealed replay makes no model call and changed source cannot reuse it', async () => {
  (call as jest.Mock).mockResolvedValue('{"relationships":[]}');
  await runRelationshipGeneration(input as never, directory);
  (call as jest.Mock).mockClear();
  await runRelationshipGeneration(input as never, directory);
  expect(call).not.toHaveBeenCalled();
  await expect(
    runRelationshipGeneration(
      { ...input, pages: [{ ...input.pages[0], content: 'Ada dismissed Ben.' }] } as never,
      directory
    )
  ).rejects.toThrow(/Stale/);
  expect(call).not.toHaveBeenCalled();
});
