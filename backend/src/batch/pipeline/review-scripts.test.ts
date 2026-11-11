import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseBookArgs, reviewSheetPath, BookArgs } from './run-args';
import { exportReviewSheet } from './run-export-review';
import { applyReviewSheet } from './run-apply-review';
import { ResolvedBookData } from './check-integrity';
import { REVIEW_SHEET_COLUMNS, APPLICABLE_CRITERIA, parseCsv } from './review';

const DATA_DIR = path.join(__dirname, '../../../data');

function resolvedData(bookId: string, termId: string, term: string): ResolvedBookData {
  return {
    book_id: bookId,
    chapter_summaries: [],
    characters: [],
    relationships: [],
    terms: [{ id: termId, term, definition: `${term} 정의`, first_appearance_page: 1 }],
    events: [],
    background_and_intro: { background: '', intro: '' },
  };
}

const LEGACY_COLUMNS = (REVIEW_SHEET_COLUMNS as readonly string[]).filter((c) => c !== 'book_id');

function filledSheet(
  rows: { bookId: string; termId: string }[],
  columns: readonly string[] = ['book_id', ...LEGACY_COLUMNS]
): string {
  const applicable = new Set<string>(APPLICABLE_CRITERIA.term);
  const lines = rows.map(({ bookId, termId }) =>
    columns
      .map((col) => {
        if (col === 'book_id') return bookId;
        if (col === 'target_type') return 'term';
        if (col === 'target_id') return termId;
        if (col === 'reviewer') return 'tester';
        return applicable.has(col) ? 'TRUE' : '';
      })
      .join(',')
  );
  return [columns.join(','), ...lines].join('\n') + '\n';
}

function tempBookArgs(root: string, bookId: string): BookArgs {
  const fullDir = path.join(root, bookId, 'full');
  fs.mkdirSync(fullDir, { recursive: true });
  return { ...parseBookArgs(['--book', bookId]), fullDir };
}

function recordingClient() {
  const calls: { sql: string; params: unknown[] }[] = [];
  const client = {
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return { rows: [] };
    },
    release: () => undefined,
  };
  let connects = 0;
  const pool = {
    connect: async () => {
      connects++;
      return client;
    },
  };
  return { calls, client, pool, connectCount: () => connects };
}

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'review-scripts-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('FR-ADM-005 🚦: 검수 시트 경로는 책마다 분리된다', () => {
  test('FR-ADM-005: 인자가 없으면 기존 data/generated/full/review-sheet-takryu.csv 그대로', () => {
    expect(reviewSheetPath(parseBookArgs([]))).toBe(
      path.join(DATA_DIR, 'generated/full/review-sheet-takryu.csv')
    );
  });

  test('FR-ADM-005: 다른 책의 검수 시트는 그 책 fullDir에 있어 탁류 시트를 덮어쓰지 않는다', () => {
    const takryu = reviewSheetPath(parseBookArgs([]));
    const hwabun = reviewSheetPath(parseBookArgs(['--book', 'hwabun']));
    const miso = reviewSheetPath(parseBookArgs(['--book', 'yeongwon-ui-miso']));
    expect(hwabun).toBe(path.join(DATA_DIR, 'generated/hwabun/full/review-sheet-hwabun.csv'));
    expect(miso).toBe(
      path.join(DATA_DIR, 'generated/yeongwon-ui-miso/full/review-sheet-yeongwon-ui-miso.csv')
    );
    expect(new Set([takryu, hwabun, miso]).size).toBe(3);
  });
});

describe('FR-ADM-005 🚦: 검수 시트 내보내기는 지정한 책만 다룬다', () => {
  test('FR-ADM-005: 내보내기는 그 책의 all-resolved.json을 읽고 review_records를 그 책 book_id로만 조회한다', async () => {
    const hwabun = tempBookArgs(root, 'hwabun');
    const takryu = tempBookArgs(root, 'takryu');
    fs.writeFileSync(
      path.join(hwabun.fullDir, 'all-resolved.json'),
      JSON.stringify(resolvedData('hwabun', 'term-hw', '화분용어'))
    );
    fs.writeFileSync(
      path.join(takryu.fullDir, 'all-resolved.json'),
      JSON.stringify(resolvedData('takryu', 'term-tk', '미두장'))
    );

    const hw = recordingClient();
    const hwResult = await exportReviewSheet(hw.client, hwabun);
    expect(hw.calls.map((c) => c.params)).toEqual([['hwabun']]);
    expect(hwResult.outPath).toBe(path.join(hwabun.fullDir, 'review-sheet-hwabun.csv'));
    const hwCsv = fs.readFileSync(hwResult.outPath, 'utf-8');
    expect(hwCsv).toContain('term-hw');
    expect(hwCsv).not.toContain('term-tk');
    expect(fs.existsSync(path.join(takryu.fullDir, 'review-sheet-takryu.csv'))).toBe(false);

    const tk = recordingClient();
    const tkResult = await exportReviewSheet(tk.client, takryu);
    expect(tk.calls.map((c) => c.params)).toEqual([['takryu']]);
    expect(tkResult.outPath).toBe(path.join(takryu.fullDir, 'review-sheet-takryu.csv'));
    const tkCsv = fs.readFileSync(tkResult.outPath, 'utf-8');
    expect(tkCsv).toContain('term-tk');
    expect(tkCsv).not.toContain('term-hw');
    expect(fs.readFileSync(hwResult.outPath, 'utf-8')).toBe(hwCsv);
  });
});

describe('FR-ADM-005 🚦: 검수 판정 적용은 지정한 책만 다룬다', () => {
  test('FR-ADM-005: 적용은 그 책의 시트를 읽고 review_records에 그 책 book_id로만 기록한다', async () => {
    const hwabun = tempBookArgs(root, 'hwabun');
    const takryu = tempBookArgs(root, 'takryu');
    fs.writeFileSync(
      reviewSheetPath(hwabun),
      filledSheet([{ bookId: 'hwabun', termId: 'term-hw' }])
    );
    fs.writeFileSync(
      reviewSheetPath(takryu),
      filledSheet([{ bookId: 'takryu', termId: 'term-tk' }])
    );

    const hw = recordingClient();
    const hwResult = await applyReviewSheet(hw.pool, hwabun);
    const hwInserts = hw.calls.filter((c) => c.sql.includes('INSERT INTO review_records'));
    expect(hwResult.rows).toBe(1);
    expect(hwInserts.map((c) => [c.params[1], c.params[3]])).toEqual([['hwabun', 'term-hw']]);
    expect(hw.calls.flatMap((c) => c.params)).not.toContain('takryu');
    expect(hw.calls.map((c) => c.sql)).toEqual(expect.arrayContaining(['BEGIN', 'COMMIT']));

    const tk = recordingClient();
    await applyReviewSheet(tk.pool, takryu);
    const tkInserts = tk.calls.filter((c) => c.sql.includes('INSERT INTO review_records'));
    expect(tkInserts.map((c) => [c.params[1], c.params[3]])).toEqual([['takryu', 'term-tk']]);
    expect(tk.calls.flatMap((c) => c.params)).not.toContain('hwabun');
  });

  test('FR-ADM-005: 그 책의 시트가 없으면 다른 책 시트로 대신하지 않고 DB 연결 전에 실패한다', async () => {
    const hwabun = tempBookArgs(root, 'hwabun');
    const takryu = tempBookArgs(root, 'takryu');
    fs.writeFileSync(
      reviewSheetPath(takryu),
      filledSheet([{ bookId: 'takryu', termId: 'term-tk' }])
    );

    const hw = recordingClient();
    await expect(applyReviewSheet(hw.pool, hwabun)).rejects.toThrow(/ENOENT/);
    expect(hw.connectCount()).toBe(0);
    expect(hw.calls).toEqual([]);

    const tk = recordingClient();
    await expect(applyReviewSheet(tk.pool, takryu)).resolves.toMatchObject({ rows: 1 });
    expect(tk.connectCount()).toBe(1);
  });
});

describe('FR-ADM-005 🚦: 다른 책 산출물·시트는 거부한다', () => {
  test('FR-ADM-005: 내보내기는 all-resolved.json의 book_id가 --book과 다르면 DB 조회·시트 쓰기 전에 실패한다', async () => {
    const hwabun = tempBookArgs(root, 'hwabun');
    const resolvedPath = path.join(hwabun.fullDir, 'all-resolved.json');

    fs.writeFileSync(resolvedPath, JSON.stringify(resolvedData('takryu', 'term-tk', '미두장')));
    const wrong = recordingClient();
    await expect(exportReviewSheet(wrong.client, hwabun)).rejects.toThrow(/book_id/);
    expect(wrong.calls).toEqual([]);
    expect(fs.existsSync(reviewSheetPath(hwabun))).toBe(false);

    fs.writeFileSync(resolvedPath, JSON.stringify(resolvedData('hwabun', 'term-hw', '화분용어')));
    const right = recordingClient();
    await expect(exportReviewSheet(right.client, hwabun)).resolves.toMatchObject({ rows: 3 });
    expect(right.calls.map((c) => c.params)).toEqual([['hwabun']]);
    expect(fs.existsSync(reviewSheetPath(hwabun))).toBe(true);
  });

  test('FR-ADM-005: 내보낸 시트의 모든 행 book_id 열에 그 책 식별자가 들어간다', async () => {
    const hwabun = tempBookArgs(root, 'hwabun');
    fs.writeFileSync(
      path.join(hwabun.fullDir, 'all-resolved.json'),
      JSON.stringify(resolvedData('hwabun', 'term-hw', '화분용어'))
    );
    const { outPath } = await exportReviewSheet(recordingClient().client, hwabun);
    const [header, ...rows] = parseCsv(fs.readFileSync(outPath, 'utf-8')).filter(
      (r) => r.length > 1
    );
    const idx = header.indexOf('book_id');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(rows.length).toBe(3);
    expect(rows.map((r) => r[idx])).toEqual(['hwabun', 'hwabun', 'hwabun']);
  });

  test('FR-ADM-005: 적용은 시트 행의 book_id가 하나라도 --book과 다르면 DB 연결 전에 전체를 거부한다', async () => {
    const hwabun = tempBookArgs(root, 'hwabun');
    const sheetPath = reviewSheetPath(hwabun);

    for (const rows of [
      [{ bookId: 'takryu', termId: 'term-tk' }],
      [
        { bookId: 'hwabun', termId: 'term-hw' },
        { bookId: 'takryu', termId: 'term-tk' },
      ],
      [{ bookId: '', termId: 'term-hw' }],
    ]) {
      fs.writeFileSync(sheetPath, filledSheet(rows));
      const wrong = recordingClient();
      await expect(applyReviewSheet(wrong.pool, hwabun)).rejects.toThrow(/book_id/);
      expect(wrong.connectCount()).toBe(0);
      expect(wrong.calls).toEqual([]);
    }

    fs.writeFileSync(sheetPath, filledSheet([{ bookId: 'hwabun', termId: 'term-hw' }]));
    const right = recordingClient();
    await expect(applyReviewSheet(right.pool, hwabun)).resolves.toMatchObject({ rows: 1 });
    expect(right.connectCount()).toBe(1);
  });

  test('FR-ADM-005: book_id 열이 없는 옛 형식 시트는 DB 연결 전에 거부한다', async () => {
    const hwabun = tempBookArgs(root, 'hwabun');
    const sheetPath = reviewSheetPath(hwabun);

    fs.writeFileSync(
      sheetPath,
      filledSheet([{ bookId: 'hwabun', termId: 'term-hw' }], LEGACY_COLUMNS)
    );
    const legacy = recordingClient();
    await expect(applyReviewSheet(legacy.pool, hwabun)).rejects.toThrow(/헤더/);
    expect(legacy.connectCount()).toBe(0);

    fs.writeFileSync(sheetPath, filledSheet([{ bookId: 'hwabun', termId: 'term-hw' }]));
    const current = recordingClient();
    await expect(applyReviewSheet(current.pool, hwabun)).resolves.toMatchObject({ rows: 1 });
  });
});
