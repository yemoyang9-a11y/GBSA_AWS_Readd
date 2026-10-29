/**
 * 파이프라인 실행 스크립트 공용 인자 — 도서 1권당 비용 실측용 매개변수화 (NFR-OBS-004)
 *
 * 사용: --book <bookId> --file <원문 경로> [--title <제목> --author <저자> --year <연도>]
 *       --dry-run 을 주면 해석된 인자만 출력하고 종료한다(DB·LLM 접근 전).
 *
 * 인자가 없으면 예전 하드코딩과 똑같이 takryu · data/raw/takryu.txt · data/generated/full 로
 * 해석한다. 다른 책은 생성물 디렉터리를 data/generated/<bookId>/ 아래로 분리한다 — 책 A의
 * 장 캐시가 책 B 실행에서 재생(replay)되면 안 되기 때문이다.
 */
import * as path from 'path';

const DATA_DIR = path.join(__dirname, '../../../data');

export const DEFAULT_BOOK_ID = 'takryu';

/** 기존 스크립트에 하드코딩돼 있던 「탁류」 서지 — takryu의 기본값으로만 쓴다 */
const KNOWN_BOOK_META: Record<string, { title: string; author: string; publishYear: number }> = {
  // 조선일보 연재 시작년(1937.10.12~1938.5.17) — R4 회신 반영
  takryu: { title: '탁류', author: '채만식', publishYear: 1937 },
};

export interface BookArgs {
  bookId: string;
  /** 원문 경로 */
  filePath: string;
  /** 생성물 루트 — sample-chapter-N.json 등이 놓인다 */
  generatedDir: string;
  /** run-generate-full 산출물(chapter-N.json·all-resolved.json 등) 디렉터리 */
  fullDir: string;
  title?: string;
  author?: string;
  publishYear?: number;
  dryRun: boolean;
}

function flagValue(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  if (i === -1) return undefined;
  const value = argv[i + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${flag} 뒤에 값이 필요하다`);
  }
  return value;
}

export function parseBookArgs(argv: string[] = process.argv.slice(2)): BookArgs {
  const bookId = flagValue(argv, '--book') ?? DEFAULT_BOOK_ID;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(bookId)) {
    throw new Error(`bookId 형식이 잘못됨: "${bookId}" (소문자·숫자·하이픈만)`);
  }
  const file = flagValue(argv, '--file');
  const filePath = file ? path.resolve(file) : path.join(DATA_DIR, 'raw', `${bookId}.txt`);

  // takryu는 기존 경로(data/generated/full)를 그대로 쓴다 — 인자 없는 실행이 예전과 같아야 한다
  const generatedDir =
    bookId === DEFAULT_BOOK_ID
      ? path.join(DATA_DIR, 'generated')
      : path.join(DATA_DIR, 'generated', bookId);

  const known = KNOWN_BOOK_META[bookId];
  const year = flagValue(argv, '--year');
  return {
    bookId,
    filePath,
    generatedDir,
    fullDir: path.join(generatedDir, 'full'),
    title: flagValue(argv, '--title') ?? known?.title,
    author: flagValue(argv, '--author') ?? known?.author,
    publishYear: year !== undefined ? Number(year) : known?.publishYear,
    dryRun: argv.includes('--dry-run'),
  };
}

/** 제목·저자가 필요한 스크립트(등록·배경지식 생성)용 — 다른 책의 서지를 탁류 값으로 채우지 않는다 */
export function requireBookMeta(args: BookArgs): { title: string; author: string } {
  if (!args.title || !args.author) {
    throw new Error(`"${args.bookId}"는 --title 과 --author 를 지정해야 한다`);
  }
  if (args.publishYear !== undefined && !Number.isInteger(args.publishYear)) {
    throw new Error(`--year 는 정수여야 한다: ${args.publishYear}`);
  }
  return { title: args.title, author: args.author };
}

/** run-generate-sample의 --chapter <장 번호> — 없으면 1장(기존 동작). P2 견적처럼 장 하나만 생성할 때 쓴다 */
export function parseChapterNo(argv: string[] = process.argv.slice(2)): number {
  const i = argv.indexOf('--chapter');
  if (i === -1) return 1;
  const chapterNo = Number(argv[i + 1]);
  if (!Number.isInteger(chapterNo) || chapterNo < 1) {
    throw new Error(`--chapter 는 1 이상의 정수여야 한다: ${argv[i + 1]}`);
  }
  return chapterNo;
}

/** 스크립트 진입부에서 쓴다 — --dry-run이면 해석 결과만 출력하고 종료한다 */
export function bookArgsFromCli(script: string): BookArgs {
  const args = parseBookArgs();
  if (args.dryRun) {
    console.log(`[dry-run] ${script}`, JSON.stringify(args));
    process.exit(0);
  }
  return args;
}
