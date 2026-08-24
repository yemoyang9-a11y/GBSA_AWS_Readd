/**
 * S8 — 시연 위치 리캡 주입 (UC-19 3번)
 *
 * 지정 디바이스·도서·기준점의 저장 리캡을 R2 소유 saved_recap 테이블에 upsert한다.
 * 발표 중 실시간 호출을 없애기 위한 것 — R1이 독서 상태 스토어에 쓰는 유일한 예외
 * (dev-spec R1 0장 "내 것" 표: 저장 리캡 주입만 예외).
 *
 * 입력 조립은 shared/types.ts의 RecapInput 계약을 그대로 따른다(R2·R3·R4 공유 타입).
 * cutoff는 함수 인자로 명시 — cutoff 없이 저장소에 접근하지 않는다 (FR-SPL-002 🚦).
 * 상한은 SQL WHERE절(데이터 선택 단계)에서만 걸고, 프롬프트 지시로 거는 폴백은 두지 않는다
 * (FR-SPL-003 🚦, R4 불변식, CLAUDE.md 2장 3번).
 */
import { QueryClient } from './register';
import { RecapInput, ChapterSummary } from '../../shared/types';

interface ChapterRow {
  chapter_no: number;
  title: string;
  start_page: number;
  end_page: number;
}

/** 완결된 장 요약(종료 페이지 <= cutoff) + 현재 장 원문 절단[현재 장 시작..cutoff]을 조립한다 */
export async function assembleRecapInput(
  client: QueryClient,
  bookId: string,
  cutoff: number
): Promise<RecapInput> {
  const chaptersResult = (await client.query(
    `SELECT chapter_no, title, start_page, end_page FROM chapters WHERE book_id = $1 ORDER BY chapter_no`,
    [bookId]
  )) as { rows: ChapterRow[] };
  const chapters = chaptersResult.rows;

  const completed = chapters.filter((c) => c.end_page <= cutoff);
  const current = chapters.find((c) => c.start_page <= cutoff && cutoff < c.end_page);

  let chapterSummaries: ChapterSummary[] = [];
  if (completed.length > 0) {
    const summaryResult = (await client.query(
      `SELECT chapter_no, summary FROM chapter_summaries WHERE book_id = $1 AND chapter_no = ANY($2) ORDER BY chapter_no`,
      [bookId, completed.map((c) => c.chapter_no)]
    )) as { rows: { chapter_no: number; summary: string }[] };
    const summaryByChapter = new Map(summaryResult.rows.map((r) => [r.chapter_no, r.summary]));

    chapterSummaries = completed.map((c) => ({
      chapter_no: c.chapter_no,
      title: c.title,
      content: summaryByChapter.get(c.chapter_no) ?? '',
      end_page: c.end_page,
    }));
  }

  let currentChapterText: string | null = null;
  if (current) {
    const pagesResult = (await client.query(
      `SELECT page_no, content FROM pages WHERE book_id = $1 AND page_no BETWEEN $2 AND $3 ORDER BY page_no`,
      [bookId, current.start_page, cutoff]
    )) as { rows: { page_no: number; content: string }[] };
    currentChapterText = pagesResult.rows.map((p) => p.content).join('\n\n');
  }

  return { chapter_summaries: chapterSummaries, current_chapter_text: currentChapterText, cutoff };
}

/** 리캡 종합 프롬프트 — 조립된 입력(RecapInput) 밖의 사건은 지어내지 않는다 */
export function buildRecapPrompt(input: RecapInput, title: string, author: string): string {
  const summaryBlock =
    input.chapter_summaries.length > 0
      ? input.chapter_summaries
          .map((cs) => `${cs.chapter_no}장 "${cs.title}": ${cs.content}`)
          .join('\n')
      : '(없음 — 아직 완결된 장 없음)';

  const currentBlock = input.current_chapter_text
    ? `\n\n--- 진행 중인 장의 원문(현재까지 읽은 부분) ---\n${input.current_chapter_text}`
    : '';

  return `${author}의 장편소설 「${title}」을 읽고 있는 독자에게, 지금까지 읽은 부분(${input.cutoff}페이지까지)의 줄거리를 자연스러운 리캡으로 종합하라.
아래 자료가 독자가 아는 것 전부다 — 여기 없는 사건은 지어내지 마라.
5문장 내외, 500자 이내로 간결하게 써라(recap.service.ts와 동일한 목표 분량, 2026-08-24 확정).
한 문단으로 몰아쓰지 말고 2~3개의 짧은 문단으로 나눠라. 문단 사이는 빈 줄로 구분해라.
제목이나 "#" 같은 마크다운 기호를 붙이지 말고 본문 문단만 써라.

--- 완결된 장 요약 ---
${summaryBlock}${currentBlock}

출력은 아래 JSON 형식만 반환하라. 다른 설명·마크다운 코드블록 없이 JSON 텍스트만 출력하라.
{"recap": "..."}`;
}

export interface DemoRecapParams {
  deviceId: string;
  bookId: string;
  cutoff: number;
  title: string;
  author: string;
}

/** 조립 → LLM 종합 → saved_recap upsert. callLLM은 게이트웨이(⑥) 경유 호출을 주입받는다(4.3절) */
export async function injectDemoRecap(
  client: QueryClient,
  callLLM: (prompt: string) => Promise<string>,
  parseRecap: (raw: string) => { recap: string },
  params: DemoRecapParams
): Promise<string> {
  const input = await assembleRecapInput(client, params.bookId, params.cutoff);
  const prompt = buildRecapPrompt(input, params.title, params.author);
  const { recap } = parseRecap(await callLLM(prompt));

  await client.query(
    `INSERT INTO saved_recap (device_id, book_id, cutoff_page, recap_text, created_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (device_id, book_id) DO UPDATE SET cutoff_page = $3, recap_text = $4, created_at = now()`,
    [params.deviceId, params.bookId, params.cutoff, recap]
  );

  return recap;
}
