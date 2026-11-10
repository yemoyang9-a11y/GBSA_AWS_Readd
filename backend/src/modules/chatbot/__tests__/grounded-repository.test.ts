import { pool } from '../../../config/database';
import * as repo from '../repository';
import * as conversations from '../conversation-repository';

jest.mock('../../../config/database', () => ({ pool: { query: jest.fn() } }));

describe('grounded SQL boundaries', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (pool.query as jest.Mock).mockResolvedValue({ rows: [] });
  });

  test('lexical search uses literal bounded terms with book and cutoff SQL filters', async () => {
    await repo.lexicalSearch('book', '정주사 % _ [a]+', 40, 6);
    const [sql, params] = (pool.query as jest.Mock).mock.calls[0];
    expect(sql).toMatch(/book_id\s*=\s*\$1/);
    expect(sql).toMatch(/page_no\s*<=\s*\$2/);
    expect(sql).toMatch(/strpos\(/i);
    expect(sql).toMatch(/LIMIT \$4/);
    expect(params[0]).toBe('book');
    expect(params[1]).toBe(40);
    expect(params[2]).toContain('정주사');
    expect(params[2].length).toBeLessThanOrEqual(16);
    expect(params[3]).toBe(6);
  });

  test('alias targets are bounded by both book and first appearance', async () => {
    await repo.findAliases('book', 40);
    const [sql, params] = (pool.query as jest.Mock).mock.calls[0];
    expect(sql).toMatch(/a\.book_id\s*=\s*\$1/);
    expect(sql).toMatch(/c\.first_appearance_page\s*<=\s*\$2/);
    expect(params).toEqual(['book', 40]);
  });

  test('relationship evidence requires both endpoint characters in the same book and cutoff', async () => {
    await repo.findRelationships('book', 40);
    const [sql, params] = (pool.query as jest.Mock).mock.calls[0];
    expect(sql).toMatch(/JOIN characters a ON r\.character_a_id = a\.id/);
    expect(sql).toMatch(/JOIN characters b ON r\.character_b_id = b\.id/);
    expect(sql).toMatch(/a\.book_id\s*=\s*\$1/);
    expect(sql).toMatch(/b\.book_id\s*=\s*\$1/);
    expect(sql).toMatch(/a\.first_appearance_page\s*<=\s*\$2/);
    expect(sql).toMatch(/b\.first_appearance_page\s*<=\s*\$2/);
    expect(sql).toMatch(/r\.established_page\s*<=\s*\$2/);
    expect(params).toEqual(['book', 40]);
  });

  test('character note evidence requires the note and its character to share the requested book', async () => {
    await repo.findCharacterNotes('book', 40);
    const [sql, params] = (pool.query as jest.Mock).mock.calls[0];
    expect(sql).toMatch(/cn\.book_id\s*=\s*\$1/);
    expect(sql).toMatch(/c\.book_id\s*=\s*\$1/);
    expect(sql).toMatch(/cn\.source_page\s*<=\s*\$2/);
    expect(sql).toMatch(/c\.first_appearance_page\s*<=\s*\$2/);
    expect(params).toEqual(['book', 40]);
  });

  test('current chapter text keeps source page markers through the positive cutoff boundary', async () => {
    (pool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ chapter_no: 2, start_page: 30, end_page: 50 }] })
      .mockResolvedValueOnce({
        rows: [
          { page_no: 39, content: '이전 페이지 근거' },
          { page_no: 40, content: '현재 페이지 근거' },
        ],
      });
    const text = await repo.getCurrentChapterText('book', 40);
    expect(text).toBe('[p.39]\n이전 페이지 근거\n\n[p.40]\n현재 페이지 근거');
    const [sql, params] = (pool.query as jest.Mock).mock.calls[1];
    expect(sql).toMatch(/page_no\s*<=\s*\$3/);
    expect(params).toEqual(['book', 30, 40]);
  });

  test('detail reads parent and turns under one cutoff-scoped SQL snapshot', async () => {
    await conversations.getConversationSnapshot('device', 'book', 7, 40);
    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = (pool.query as jest.Mock).mock.calls[0];
    expect(sql).toMatch(/c\.device_id\s*=\s*\$2/);
    expect(sql).toMatch(/c\.book_id\s*=\s*\$3/);
    expect(sql).toMatch(/c\.cutoff_page\s*<=\s*\$4/);
    expect(sql).toMatch(/t\.cutoff_page\s*<=\s*\$4/);
    expect(params).toEqual([7, 'device', 'book', 40]);
  });

  test.each([repo.findTerms, repo.findEvents])(
    'generated projections wait until their containing chapter is fully within K',
    async (find) => {
      await find('book', 40);
      const [sql, params] = (pool.query as jest.Mock).mock.calls[0];
      expect(sql).toMatch(/JOIN chapters c ON/);
      expect(sql).toMatch(/c\.book_id\s*=\s*\w+\.book_id/);
      expect(sql).toMatch(/c\.start_page\s*<=/);
      expect(sql).toMatch(/c\.end_page\s*>=/);
      expect(sql).toMatch(/c\.end_page\s*<=\s*\$2/);
      expect(params).toEqual(['book', 40]);
    }
  );
});
