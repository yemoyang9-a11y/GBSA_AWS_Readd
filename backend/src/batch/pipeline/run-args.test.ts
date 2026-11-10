import * as path from 'path';
import { parseBookArgs, parseChapterNo, requireBookMeta } from './run-args';

const DATA_DIR = path.join(__dirname, '../../../data');

describe('NFR-OBS-004: 파이프라인 bookId 매개변수화', () => {
  test('인자가 없으면 기존 하드코딩과 같은 takryu · data/raw/takryu.txt · data/generated/full', () => {
    const args = parseBookArgs([]);
    expect(args.bookId).toBe('takryu');
    expect(args.filePath).toBe(path.join(DATA_DIR, 'raw/takryu.txt'));
    expect(args.generatedDir).toBe(path.join(DATA_DIR, 'generated'));
    expect(args.fullDir).toBe(path.join(DATA_DIR, 'generated/full'));
    expect(requireBookMeta(args)).toEqual({ title: '탁류', author: '채만식' });
    expect(args.publishYear).toBe(1937);
    expect(args.dryRun).toBe(false);
  });

  test('다른 책은 생성물 디렉터리가 분리돼 책 A 캐시가 책 B에서 재생되지 않는다', () => {
    const a = parseBookArgs(['--book', 'hwabun']);
    const b = parseBookArgs(['--book', 'yeongwon-ui-miso']);
    const takryu = parseBookArgs([]);
    expect(a.fullDir).toBe(path.join(DATA_DIR, 'generated/hwabun/full'));
    expect(b.fullDir).toBe(path.join(DATA_DIR, 'generated/yeongwon-ui-miso/full'));
    expect(new Set([a.fullDir, b.fullDir, takryu.fullDir]).size).toBe(3);
    // --file 없으면 data/raw/<bookId>.txt
    expect(a.filePath).toBe(path.join(DATA_DIR, 'raw/hwabun.txt'));
  });

  test('--file · --title · --author · --year 를 그대로 해석하고 다른 플래그는 무시한다', () => {
    const args = parseBookArgs([
      '--replace-relationships',
      '--book',
      'hwabun',
      '--file',
      'some/where.txt',
      '--title',
      '화분',
      '--author',
      '이효석',
      '--year',
      '1939',
      '--dry-run',
    ]);
    expect(args.filePath).toBe(path.resolve('some/where.txt'));
    expect(requireBookMeta(args)).toEqual({ title: '화분', author: '이효석' });
    expect(args.publishYear).toBe(1939);
    expect(args.dryRun).toBe(true);
  });

  test('다른 책의 서지를 탁류 값으로 채우지 않는다 — 제목·저자 없으면 거부', () => {
    expect(() => requireBookMeta(parseBookArgs(['--book', 'hwabun']))).toThrow(/--title/);
  });

  test('값 없는 플래그와 잘못된 bookId는 거부한다', () => {
    expect(() => parseBookArgs(['--book'])).toThrow(/값이 필요/);
    expect(() => parseBookArgs(['--book', '--file', 'x'])).toThrow(/값이 필요/);
    expect(() => parseBookArgs(['--book', '../takryu'])).toThrow(/형식/);
    expect(() =>
      requireBookMeta(parseBookArgs(['--book', 'x', '--title', 't', '--author', 'a', '--year', 'abc']))
    ).toThrow(/정수/);
  });
});

describe('NFR-OBS-004: run-generate-sample 장 선택', () => {
  test('--chapter 가 없으면 기존처럼 1장, 있으면 그 장 하나', () => {
    expect(parseChapterNo([])).toBe(1);
    expect(parseChapterNo(['--book', 'hwabun', '--chapter', '3'])).toBe(3);
  });

  test('--chapter 값이 1 이상의 정수가 아니면 거부한다', () => {
    expect(() => parseChapterNo(['--chapter'])).toThrow(/정수/);
    expect(() => parseChapterNo(['--chapter', '0'])).toThrow(/정수/);
    expect(() => parseChapterNo(['--chapter', '1.5'])).toThrow(/정수/);
  });
});
