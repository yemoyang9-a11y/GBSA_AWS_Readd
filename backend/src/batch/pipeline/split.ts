/**
 * ⑦ 콘텐츠 파이프라인 — S1 원문 등록·페이지 분할 / S2 장 경계 매핑
 *
 * 경계 우선순위: ① 장 경계(절대) ② 문단 경계 ③ 문장 경계 — D11
 * 목표 1,000자 / 허용 700~1,400자, 문장 중간 절단 금지 — D11
 * FR-DAT-001 🚦 장 범위 합집합 == [1, 마지막 페이지], 간극·중첩 0
 * FR-DAT-002 🚦 페이지 본문 합집합 == 원문 전체, 누락·중복 0
 *
 * 원문은 인쇄본 그대로 고정폭으로 줄바꿈되어 있어(한글은 하이픈 없이 어디서든
 * 줄바꿈 가능) 줄 끝이 단어 중간인지 단어 경계인지 표시가 남아있지 않다.
 * 팀 결정: 줄을 이어붙일 때 항상 공백 1개를 삽입한다 — 단어 중간에 공백이
 * 남는 것(예: "휘돌려다 가는")은 가벼운 오탈자 수준이지만, 공백을 안 넣어
 * 서로 다른 단어가 붙어버리는 것(예: "재미있게벌어져")은 더 큰 오독을 만든다.
 */
import { Chapter, Page } from '../../shared/types';

export const TARGET_SIZE = 1000;
export const MIN_SIZE = 700;
export const MAX_SIZE = 1400;

const CHAPTER_HEADER_RE = /^([0-9]{1,2}) (.+)$/;
// 문장 종결 — 마침표/느낌표/물음표/줄임표 연속 + 닫는 인용부호 + 뒤따르는 공백까지 소비
const SENTENCE_END_RE = /[.!?…]+[”’」』]*[ \t]*/g;

export interface ParsedChapter {
  chapterNo: number;
  title: string;
  paragraphs: string[];
}

/** D11 — 원문 인쇄줄을 이어붙일 때 항상 공백 1개를 삽입한다 */
export function reflowLines(lines: string[]): string {
  return lines.join(' ');
}

function groupParagraphs(bodyLines: string[]): string[] {
  const paragraphs: string[] = [];
  let current: string[] = [];
  for (const line of bodyLines) {
    if (line.trim() === '') {
      if (current.length > 0) {
        paragraphs.push(reflowLines(current));
        current = [];
      }
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) paragraphs.push(reflowLines(current));
  return paragraphs;
}

/**
 * 원문 전체에서 장 헤더를 찾아 장별 문단 목록으로 파싱한다.
 * 장 헤더는 "번호 공백 제목" 형태이며, 오탐 방지를 위해 바로 앞 줄이
 * 빈 줄인 경우만 헤더로 인정한다(본문 대사 중 숫자로 시작하는 줄과 구분).
 */
export function parseChapters(rawText: string): ParsedChapter[] {
  const lines = rawText.split('\n');
  const headers: { lineIdx: number; no: number; title: string }[] = [];

  lines.forEach((line, idx) => {
    const m = CHAPTER_HEADER_RE.exec(line);
    if (!m) return;
    const precededByBlank = idx === 0 || lines[idx - 1].trim() === '';
    if (precededByBlank) headers.push({ lineIdx: idx, no: Number(m[1]), title: m[2] });
  });

  return headers.map((h, i) => {
    const start = h.lineIdx + 1;
    const end = i + 1 < headers.length ? headers[i + 1].lineIdx : lines.length;
    const paragraphs = groupParagraphs(lines.slice(start, end));
    return { chapterNo: h.no, title: h.title, paragraphs };
  });
}

interface Candidate {
  offset: number;
  isParagraphEnd: boolean;
}

/** 장 전체 본문 — 문단을 '\n'(문단 경계 문자, 페이지 커버리지에 포함)으로 잇는다 */
export function buildChapterFullText(paragraphs: string[]): string {
  return paragraphs.join('\n');
}

/** 문장/문단 경계 후보 오프셋을 찾는다(장 전체 본문 기준) */
export function findCandidates(paragraphs: string[]): Candidate[] {
  const candidates: Candidate[] = [];
  let base = 0;

  paragraphs.forEach((para, i) => {
    const re = new RegExp(SENTENCE_END_RE);
    let m: RegExpExecArray | null;
    while ((m = re.exec(para))) {
      const offset = base + m.index + m[0].length;
      if (offset < base + para.length) {
        candidates.push({ offset, isParagraphEnd: false });
      }
    }
    base += para.length;
    if (i < paragraphs.length - 1) {
      base += 1; // '\n' 문단 경계 문자
      candidates.push({ offset: base, isParagraphEnd: true });
    }
  });

  return candidates;
}

/**
 * 후보 경계만을 잘라 지점으로 써서 [700,1400] 범위·목표 1,000자에 가장
 * 가까운 지점을 그리디로 선택한다. 범위 안에 문단 경계가 있으면 문단
 * 경계를 우선한다(D11 우선순위). 범위 안에 후보가 전혀 없으면(비정상적
 * 으로 긴 문장) 범위를 벗어나더라도 목표에 가장 가까운 경계를 택한다 —
 * 경계를 어기고 문장을 자르는 일은 없다.
 */
export function selectCuts(fullText: string, candidates: Candidate[]): number[] {
  const sorted = [...candidates].sort((a, b) => a.offset - b.offset);
  const total = fullText.length;
  const cuts: number[] = [];
  let start = 0;

  while (start < total) {
    const ahead = sorted.filter((c) => c.offset > start);
    const options: Candidate[] = [...ahead, { offset: total, isParagraphEnd: true }];
    const inRange = options.filter((c) => c.offset - start >= MIN_SIZE && c.offset - start <= MAX_SIZE);

    const pool = inRange.length > 0 ? inRange : options;
    const preferred = inRange.length > 0 && pool.some((c) => c.isParagraphEnd)
      ? pool.filter((c) => c.isParagraphEnd)
      : pool;

    const chosen = preferred.reduce((best, c) =>
      Math.abs(c.offset - start - TARGET_SIZE) < Math.abs(best.offset - start - TARGET_SIZE) ? c : best
    );

    cuts.push(chosen.offset);
    start = chosen.offset;
  }

  return cuts;
}

/** 장 하나를 페이지로 분할한다. startPageNo부터 순차 번호를 매긴다 */
export function splitChapterToPages(bookId: string, paragraphs: string[], startPageNo: number): Page[] {
  const fullText = buildChapterFullText(paragraphs);
  const candidates = findCandidates(paragraphs);
  const cuts = selectCuts(fullText, candidates);

  const pages: Page[] = [];
  let prev = 0;
  cuts.forEach((cut, i) => {
    const pageNo = startPageNo + i;
    pages.push({
      id: `${bookId}-p${pageNo}`,
      book_id: bookId,
      page_no: pageNo,
      content: fullText.slice(prev, cut),
    });
    prev = cut;
  });

  return pages;
}

export interface SplitResult {
  pages: Page[];
  chapters: Chapter[];
}

/** FR-DAT-001·002 🚦 원문 전체를 장 경계 절대 규칙 아래 페이지로 분할한다 */
export function splitBook(rawText: string, bookId: string): SplitResult {
  const parsedChapters = parseChapters(rawText);
  const pages: Page[] = [];
  const chapters: Chapter[] = [];
  let nextPageNo = 1;

  for (const parsed of parsedChapters) {
    const startPage = nextPageNo;
    const chapterPages = splitChapterToPages(bookId, parsed.paragraphs, startPage);
    pages.push(...chapterPages);
    nextPageNo = startPage + chapterPages.length;

    chapters.push({
      id: `${bookId}-c${parsed.chapterNo}`,
      book_id: bookId,
      chapter_no: parsed.chapterNo,
      title: parsed.title,
      start_page: startPage,
      end_page: nextPageNo - 1,
    });
  }

  return { pages, chapters };
}

export interface ValidationReport {
  coverageViolations: number;
  crossChapterViolations: number;
  midSentenceViolations: number;
  underMinViolations: number; // 장 마지막 페이지 제외
  oversizedPages: number; // 1,400자 초과
  details: string[];
}

const SENTENCE_END_TRAILING_RE = /[.!?…]+[”’」』]*\s*$/;

/**
 * V1/V2 자가 검증 — 파이프라인 실행마다 돌리는 것을 전제로 한다.
 * 하나라도 위반이면 다음 단계로 진행하지 않는다(05-test-guide.md, CLAUDE.md 7장).
 */
export function validateSplit(pages: Page[], chapters: Chapter[], rawText: string): ValidationReport {
  const details: string[] = [];
  const parsedChapters = parseChapters(rawText);

  let coverageViolations = 0;
  for (const chapter of chapters) {
    const chapterPages = pages
      .filter((p) => p.page_no >= chapter.start_page && p.page_no <= chapter.end_page)
      .sort((a, b) => a.page_no - b.page_no);
    const rebuilt = chapterPages.map((p) => p.content).join('');
    const source = parsedChapters.find((c) => c.chapterNo === chapter.chapter_no);
    const expected = source ? buildChapterFullText(source.paragraphs) : '';
    if (rebuilt !== expected) {
      coverageViolations++;
      details.push(`FR-DAT-002 위반: 장 ${chapter.chapter_no} 페이지 합집합이 원문과 불일치`);
    }
  }

  let crossChapterViolations = 0;
  for (const page of pages) {
    const owners = chapters.filter((c) => page.page_no >= c.start_page && page.page_no <= c.end_page);
    if (owners.length !== 1) {
      crossChapterViolations++;
      details.push(`D11 위반: 페이지 ${page.page_no}가 장 ${owners.length}개에 걸침`);
    }
  }

  let midSentenceViolations = 0;
  let underMinViolations = 0;
  let oversizedPages = 0;
  for (const page of pages) {
    const chapter = chapters.find((c) => page.page_no >= c.start_page && page.page_no <= c.end_page);
    const isLastOfChapter = chapter ? page.page_no === chapter.end_page : false;
    const len = page.content.length;

    if (!isLastOfChapter && !SENTENCE_END_TRAILING_RE.test(page.content)) {
      midSentenceViolations++;
      details.push(`D11 위반: 페이지 ${page.page_no}가 문장 중간에서 끝남`);
    }
    if (!isLastOfChapter && len < MIN_SIZE) {
      underMinViolations++;
      details.push(`D11 위반: 페이지 ${page.page_no} 길이 ${len}자 (700자 미만, 장 마지막 페이지 아님)`);
    }
    if (len > MAX_SIZE) {
      oversizedPages++;
      details.push(`D11: 페이지 ${page.page_no} 길이 ${len}자 (1,400자 초과 — 경계 없는 긴 문장/문단)`);
    }
  }

  let chapterCoverageViolations = 0;
  const sortedChapters = [...chapters].sort((a, b) => a.chapter_no - b.chapter_no);
  if (sortedChapters.length > 0 && sortedChapters[0].start_page !== 1) {
    chapterCoverageViolations++;
    details.push('FR-DAT-001 위반: 첫 장이 1페이지부터 시작하지 않음');
  }
  for (let i = 0; i < sortedChapters.length - 1; i++) {
    if (sortedChapters[i + 1].start_page !== sortedChapters[i].end_page + 1) {
      chapterCoverageViolations++;
      details.push(`FR-DAT-001 위반: 장 ${sortedChapters[i].chapter_no}~${sortedChapters[i + 1].chapter_no} 사이 간극/중첩`);
    }
  }

  return {
    coverageViolations,
    crossChapterViolations: crossChapterViolations + chapterCoverageViolations,
    midSentenceViolations,
    underMinViolations,
    oversizedPages,
    details,
  };
}

export interface Measurements {
  totalPages: number;
  underMinRatio: number; // 700자 미만 비율(장 마지막 페이지 제외)
  overMaxRatio: number; // 1,400자 초과 비율
  sentenceFallbackCount: number; // 문단 경계 대신 문장 경계로 자른 횟수 — R1-pipeline.md S3 ②
  longestChapterRawLength: number; // 가장 긴 장의 원문 절단 최대 크기 — R3 성능예산 입력, S3 ③
}

/** S3 — CP1 보고용 실측 3건 */
export function computeMeasurements(pages: Page[], chapters: Chapter[], rawText: string): Measurements {
  const parsedChapters = parseChapters(rawText);

  let underMin = 0;
  let overMax = 0;
  let sentenceFallbackCount = 0;

  for (const chapter of chapters) {
    const chapterPages = pages
      .filter((p) => p.page_no >= chapter.start_page && p.page_no <= chapter.end_page)
      .sort((a, b) => a.page_no - b.page_no);

    chapterPages.forEach((page, i) => {
      const isLast = i === chapterPages.length - 1;
      const len = page.content.length;
      if (!isLast && len < MIN_SIZE) underMin++;
      if (len > MAX_SIZE) overMax++;
      // 문단 경계로 끝났는지 판정: 다음 페이지가 있고, 이 페이지 내용이 '\n'으로 끝나지 않으면
      // (문단 경계 문자 '\n'을 삼키지 못한 채 문장에서 끝난 것) 문장 경계 폴백으로 집계한다.
      if (!isLast && !page.content.endsWith('\n')) sentenceFallbackCount++;
    });
  }

  const longestChapterRawLength = Math.max(
    0,
    ...parsedChapters.map((c) => buildChapterFullText(c.paragraphs).length)
  );

  return {
    totalPages: pages.length,
    underMinRatio: pages.length > 0 ? underMin / pages.length : 0,
    overMaxRatio: pages.length > 0 ? overMax / pages.length : 0,
    sentenceFallbackCount,
    longestChapterRawLength,
  };
}
