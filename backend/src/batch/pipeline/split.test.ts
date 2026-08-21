/**
 * S1/S2 게이트 테스트 — 구현 전에 작성한다 (05-test-guide.md 3.2절)
 * FR-DAT-002 🚦 페이지 커버리지(누락·중복 0)
 * FR-DAT-001 🚦 장 경계 커버리지
 * D11        페이지 크기·경계 우선순위(장>문단>문장), 문장 중간 절단 금지
 */
import { Chapter, Page } from '../../shared/types';
import { parseChapters, reflowLines, splitBook, validateSplit, computeMeasurements } from './split';

const BOOK_ID = 'takryu';

function ownerOf(page: Page, chapters: Chapter[]): Chapter | undefined {
  return chapters.find((c) => page.page_no >= c.start_page && page.page_no <= c.end_page);
}

describe('reflowLines — D11 줄바꿈 이음 규칙(항상 공백 1개 삽입)', () => {
  test('여러 줄을 공백 1개로 이어붙인다', () => {
    expect(reflowLines(['첫째 줄', '둘째 줄', '셋째 줄'])).toBe('첫째 줄 둘째 줄 셋째 줄');
  });

  test('한 줄짜리 문단은 그대로 반환한다', () => {
    expect(reflowLines(['한 줄뿐인 문단'])).toBe('한 줄뿐인 문단');
  });
});

describe('parseChapters — 장 헤더·문단 파싱', () => {
  const fixture = [
    '탁류',
    '',
    '',
    '',
    '1 인간기념물',
    '',
    '첫 문단 첫째 줄',
    '첫 문단 둘째 줄',
    '',
    '둘째 문단입니다.',
    '',
    '',
    '2 생활 제일과',
    '',
    '두번째 장 문단입니다.',
    '',
  ].join('\n');

  test('장 헤더 2개를 순서대로 인식한다', () => {
    const chapters = parseChapters(fixture);
    expect(chapters.map((c) => c.chapterNo)).toEqual([1, 2]);
    expect(chapters[0].title).toBe('인간기념물');
    expect(chapters[1].title).toBe('생활 제일과');
  });

  test('빈 줄로 구분된 문단을 올바르게 그룹화하고, 줄바꿈은 공백 1개로 잇는다', () => {
    const chapters = parseChapters(fixture);
    expect(chapters[0].paragraphs).toEqual(['첫 문단 첫째 줄 첫 문단 둘째 줄', '둘째 문단입니다.']);
  });

  test('장 이전(제목줄 등)은 어떤 장에도 포함되지 않는다', () => {
    const chapters = parseChapters(fixture);
    const allText = chapters.flatMap((c) => c.paragraphs).join('');
    expect(allText).not.toContain('탁류');
  });
});

describe('FR-DAT-002 🚦 splitBook 커버리지 — 누락·중복 0건', () => {
  function longParagraph(sentenceCount: number, sentenceLen: number, seed: string): string {
    const filler = seed.repeat(Math.max(1, Math.ceil((sentenceLen - 1) / seed.length)));
    return Array.from({ length: sentenceCount }, (_, i) => `${filler.slice(0, sentenceLen - 1)}${i}.`).join(' ');
  }

  const rawText = [
    '1 첫 장',
    '',
    longParagraph(30, 60, '가나다라마바사아자차'),
    '',
    longParagraph(20, 80, '카타파하거너더러머버'),
    '',
    '2 둘째 장',
    '',
    longParagraph(15, 50, '서어저처커터퍼허고노'),
    '',
  ].join('\n');

  test('모든 페이지 내용을 이어붙이면 장 원문과 정확히 일치한다 (0건 누락·중복)', () => {
    const { pages, chapters } = splitBook(rawText, BOOK_ID);
    const parsed = parseChapters(rawText);
    for (const chapter of chapters) {
      const chapterPages = pages
        .filter((p) => p.page_no >= chapter.start_page && p.page_no <= chapter.end_page)
        .sort((a, b) => a.page_no - b.page_no);
      const rebuilt = chapterPages.map((p) => p.content).join('');
      const source = parsed.find((c) => c.chapterNo === chapter.chapter_no);
      expect(rebuilt).toBe(source?.paragraphs.join('\n'));
    }
  });

  test('validateSplit이 커버리지 위반 0건을 보고한다', () => {
    const { pages, chapters } = splitBook(rawText, BOOK_ID);
    const report = validateSplit(pages, chapters, rawText);
    expect(report.coverageViolations).toBe(0);
  });
});

describe('D11 🚦 페이지 경계 — 장 가로지름 금지 · 문장 중간 절단 금지 · 크기 700~1400', () => {
  function sentence(n: number): string {
    return `이것은 검증용으로 생성한 문장 번호 ${n}번이며 충분히 길게 채워서 문장 경계 계산을 확인한다.`;
  }

  const paraA = Array.from({ length: 40 }, (_, i) => sentence(i)).join(' ');
  const paraB = Array.from({ length: 30 }, (_, i) => sentence(100 + i)).join(' ');

  const rawText = ['1 장1', '', paraA, '', paraB, '', '2 장2', '', paraA, ''].join('\n');

  test('어떤 페이지도 두 장에 걸치지 않는다', () => {
    const { pages, chapters } = splitBook(rawText, BOOK_ID);
    for (const page of pages) {
      const owners = chapters.filter((c) => page.page_no >= c.start_page && page.page_no <= c.end_page);
      expect(owners).toHaveLength(1);
    }
  });

  test('장의 마지막 페이지를 제외하면 모든 페이지가 700~1400자다', () => {
    const { pages, chapters } = splitBook(rawText, BOOK_ID);
    const violations: number[] = [];
    for (const page of pages) {
      const chapter = ownerOf(page, chapters);
      const isLastOfChapter = chapter ? page.page_no === chapter.end_page : false;
      const len = page.content.length;
      if (!isLastOfChapter && (len < 700 || len > 1400)) violations.push(page.page_no);
    }
    expect(violations).toEqual([]);
  });

  test('장의 마지막 페이지가 아닌 모든 페이지는 문장 종결부에서 끝난다(문장 중간 절단 금지)', () => {
    const { pages, chapters } = splitBook(rawText, BOOK_ID);
    const sentenceEndRe = /[.!?…]+[”’」』]*\s*$/;
    for (const page of pages) {
      const chapter = ownerOf(page, chapters);
      const isLastOfChapter = chapter ? page.page_no === chapter.end_page : false;
      if (!isLastOfChapter) {
        expect(sentenceEndRe.test(page.content)).toBe(true);
      }
    }
  });

  test('validateSplit이 D11 위반 0건을 보고한다', () => {
    const { pages, chapters } = splitBook(rawText, BOOK_ID);
    const report = validateSplit(pages, chapters, rawText);
    expect(report.crossChapterViolations).toBe(0);
    expect(report.midSentenceViolations).toBe(0);
  });
});

describe('D11 예외 상황 — 경계가 없는 비정상적으로 긴 문장(오버사이즈 보고, 은폐 금지)', () => {
  test('1,400자를 넘는 단일 문장은 페이지가 커지더라도 문장을 자르지 않고, 위반으로 보고한다', () => {
    const hugeSentence = '가'.repeat(2000) + '.';
    const rawText = ['1 장1', '', hugeSentence, ''].join('\n');
    const { pages, chapters } = splitBook(rawText, BOOK_ID);
    expect(pages).toHaveLength(1);
    expect(pages[0].content.endsWith('.')).toBe(true);

    const report = validateSplit(pages, chapters, rawText);
    expect(report.oversizedPages).toBe(1);
    expect(report.midSentenceViolations).toBe(0); // 문장은 안 잘렸다 — 크기 위반과 절단 위반은 다른 문제
  });
});

describe('FR-DAT-001 🚦 장 경계 커버리지 — 간극·중첩 0', () => {
  test('장 범위 합집합이 [1, 마지막 페이지]를 간극·중첩 없이 덮는다', () => {
    function sentence(n: number): string {
      return `문장 ${n} 내용을 충분히 길게 채워서 페이지 분할이 여러 장에 걸쳐 발생하도록 만든다.`;
    }
    const para = Array.from({ length: 25 }, (_, i) => sentence(i)).join(' ');
    const rawText = ['1 장1', '', para, '', '2 장2', '', para, '', '3 장3', '', para, ''].join('\n');

    const { pages, chapters } = splitBook(rawText, BOOK_ID);
    const totalPages = pages.length;

    expect(chapters[0].start_page).toBe(1);
    for (let i = 0; i < chapters.length - 1; i++) {
      expect(chapters[i + 1].start_page).toBe(chapters[i].end_page + 1);
    }
    expect(chapters[chapters.length - 1].end_page).toBe(totalPages);
  });
});

describe('computeMeasurements — CP1 실측 3건', () => {
  test('글자수 분포 · 문장경계 폴백 횟수 · 최장 장 크기를 산출한다', () => {
    function sentence(n: number): string {
      return `계측용 문장 ${n}번, 길이를 늘리기 위한 텍스트를 덧붙인다.`;
    }
    const para = Array.from({ length: 25 }, (_, i) => sentence(i)).join(' ');
    const rawText = ['1 장1', '', para, '', '2 장2', '', para, para, ''].join('\n');

    const { pages, chapters } = splitBook(rawText, BOOK_ID);
    const measurements = computeMeasurements(pages, chapters, rawText);

    expect(measurements.totalPages).toBe(pages.length);
    expect(measurements.longestChapterRawLength).toBeGreaterThan(0);
    expect(measurements.sentenceFallbackCount).toBeGreaterThanOrEqual(0);
    expect(measurements.underMinRatio).toBeGreaterThanOrEqual(0);
    expect(measurements.overMaxRatio).toBeGreaterThanOrEqual(0);
  });
});
