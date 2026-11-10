import * as fs from 'fs';
import { call } from '../../modules/llm-gateway/gateway';
import { loadOrGenerateChapter } from './run-generate-full';
import * as runner from './run-generate-full';
import { groundingManifest } from './grounding';
import { Chapter, Page } from '../../shared/types';

jest.mock('../../modules/llm-gateway/gateway', () => ({ call: jest.fn() }));
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

const chapter: Chapter = {
  id: 'c',
  book_id: 'fixture',
  chapter_no: 1,
  title: 'fixture',
  start_page: 1,
  end_page: 1,
};
const pages: Page[] = [
  { id: 'p', book_id: 'fixture', page_no: 1, content: '전봇대라는 별명의 사람이 걷는다.' },
];
const character = {
  name: '전봇대',
  entity_type: 'person',
  identity_status: 'distinct',
  rationale: '별명의 사람이라고 명시된다.',
  first_appearance_page: 1,
  evidence: {
    source_page: 1,
    quote: pages[0].content,
    start_char: 0,
    end_char: pages[0].content.length,
  },
  aliases: [],
  notes: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test('fresh generation and cache replay apply the same validation without replay model calls', async () => {
  (fs.existsSync as jest.Mock).mockReturnValue(false);
  const invalid = { ...character, name: '없는사람' };
  (call as jest.Mock)
    .mockResolvedValueOnce(JSON.stringify({ summary: '요약' }))
    .mockResolvedValueOnce(JSON.stringify({ characters: [character, invalid] }))
    .mockResolvedValueOnce(JSON.stringify({ relationships: [] }))
    .mockResolvedValueOnce(JSON.stringify({ terms: [] }))
    .mockResolvedValueOnce(JSON.stringify({ events: [] }));
  const generated = await loadOrGenerateChapter(chapter, pages, []);
  expect(generated.characters.map((c) => c.name)).toEqual(['전봇대']);
  expect(generated.review.map((r) => r.candidate)).toEqual([invalid]);
  const saved = (fs.writeFileSync as jest.Mock).mock.calls[0][1];
  expect(JSON.parse(saved).characters).toHaveLength(2); // raw candidate preserved for review
  (fs.existsSync as jest.Mock).mockReturnValue(true);
  (fs.readFileSync as jest.Mock).mockReturnValue(saved);
  (call as jest.Mock).mockClear();
  expect(await loadOrGenerateChapter(chapter, pages, [])).toEqual(generated);
  expect(call).not.toHaveBeenCalled();
});

test.each([
  {},
  { grounding: { schema_version: 0, source_hash: 'old' } },
  { grounding: groundingManifest(chapter, [{ ...pages[0], content: 'old source' }]) },
])('old or incompatible cache fails closed without a model call: %p', async (cached) => {
  (fs.existsSync as jest.Mock).mockReturnValue(true);
  (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(cached));
  await expect(loadOrGenerateChapter(chapter, pages, [])).rejects.toThrow(/Stale/);
  expect(call).not.toHaveBeenCalled();
});

test('partial and null model candidates reach the review boundary before page reporting', async () => {
  (fs.existsSync as jest.Mock).mockReturnValue(false);
  (call as jest.Mock)
    .mockResolvedValueOnce(JSON.stringify({ summary: '요약' }))
    .mockResolvedValueOnce(
      JSON.stringify({ characters: [{ ...character, aliases: undefined, notes: undefined }, null] })
    )
    .mockResolvedValueOnce(JSON.stringify({ relationships: [null] }))
    .mockResolvedValueOnce(JSON.stringify({ terms: [] }))
    .mockResolvedValueOnce(JSON.stringify({ events: [] }));
  const out = await loadOrGenerateChapter(chapter, pages, []);
  expect(out.characters).toHaveLength(1);
  expect(out.review.map((r) => r.kind)).toEqual(['character', 'relationship']);
});

test('JSON 파싱 실패는 그 호출만 최대 2회 재시도하고, 3회째도 실패하면 장 저장 없이 실패한다', async () => {
  (fs.existsSync as jest.Mock).mockReturnValue(false);
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  (call as jest.Mock)
    .mockResolvedValueOnce('요약 산문만 반환')
    .mockResolvedValueOnce(JSON.stringify({ summary: '요약' }))
    .mockResolvedValueOnce(JSON.stringify({ characters: [character] }))
    .mockResolvedValueOnce(JSON.stringify({ relationships: [] }))
    .mockResolvedValueOnce(JSON.stringify({ terms: [] }))
    .mockResolvedValueOnce(JSON.stringify({ events: [] }));
  const out = await loadOrGenerateChapter(chapter, pages, []);
  expect(out.summary).toBe('요약');
  expect(call).toHaveBeenCalledTimes(6);
  expect(warn).toHaveBeenCalledWith('[JSON 재시도] task=generate_summary 장=1 시도=2');

  (call as jest.Mock).mockReset().mockResolvedValue('{"summary": 깨진}');
  (fs.writeFileSync as jest.Mock).mockClear();
  await expect(loadOrGenerateChapter(chapter, pages, [])).rejects.toThrow(SyntaxError);
  expect(call).toHaveBeenCalledTimes(3);
  expect(fs.writeFileSync).not.toHaveBeenCalled();
});

test('replay preserves an existing corrected resolved artifact and saves changed output separately', () => {
  const persist = (
    runner as unknown as {
      persistResolvedOutput: (file: string, data: Record<string, unknown>, pages: Page[]) => void;
    }
  ).persistResolvedOutput;
  expect(typeof persist).toBe('function');
  (fs.existsSync as jest.Mock).mockReturnValue(true);
  (fs.readFileSync as jest.Mock).mockReturnValue(
    JSON.stringify({ book_id: 'fixture', characters: [], manual_correction: 'held' })
  );
  expect(() =>
    persist('all-resolved.json', { book_id: 'fixture', characters: [character] }, pages)
  ).toThrow(/preserv/i);
  expect((fs.writeFileSync as jest.Mock).mock.calls.map(([file]) => file)).toEqual([
    'all-resolved.json.candidate.json',
  ]);
});
