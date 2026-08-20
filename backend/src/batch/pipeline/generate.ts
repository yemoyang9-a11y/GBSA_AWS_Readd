/**
 * S4 준비 — 생성 6종 프롬프트 + 응답 파싱
 *
 * 게이트웨이(⑥) 경유만 허용 — 4.3절. 이 파일은 프롬프트만 만들고 실제 호출은
 * run-generate-sample.ts(표본 검증)·향후 generate.ts 실행기에서 gateway.call()로 한다.
 *
 * 파이프라인은 상한 개념이 없다(CLAUDE.md 2장 6번 예외) — 각 장은 그 장 원문만
 * 보되, 위치 태깅은 실제 페이지 번호로 한다. 상한 필터는 조회 시점(R2·R3·R4)에서만 건다.
 */
import { Chapter, Page } from '../../shared/types';

/** LLM이 페이지 번호를 정확히 인용할 수 있도록 원문에 페이지 표시를 단다 */
export function buildPageTaggedText(pages: Page[]): string {
  return pages.map((p) => `[페이지 ${p.page_no}]\n${p.content}`).join('\n\n');
}

/** 장 요약 — FR-DAT-003 🚦. 입력은 "장 단위"(해당 장 원문만) — 이후 사건이 물리적으로 없다 */
export function buildSummaryPrompt(chapter: Chapter, pages: Page[]): string {
  return `다음은 채만식 소설 「탁류」 ${chapter.chapter_no}장 "${chapter.title}"의 원문 전체다.
이 장에서 벌어지는 사건만 3~5문장으로 요약하라. 이 장 이후에 일어나는 일은 절대 언급하지 마라(알더라도 금지).
출력은 아래 JSON 형식만 반환하라. 다른 설명·마크다운 코드블록 없이 JSON 텍스트만 출력하라.
{"summary": "..."}

--- 원문 ---
${buildPageTaggedText(pages)}`;
}

/** 인물 + 별칭 + 인물 노트 — FR-DAT-004, D6(전 별칭 태깅), A5(노트 상한) */
export function buildCharacterPrompt(chapter: Chapter, pages: Page[], knownCharacterNames: string[]): string {
  const known = knownCharacterNames.length > 0 ? knownCharacterNames.join(', ') : '(없음 — 이 장이 첫 장)';
  return `다음은 「탁류」 ${chapter.chapter_no}장 "${chapter.title}"의 원문이다(각 문단 앞에 [페이지 N] 표시).
이 장에서 처음 등장하거나 언급되는 인물을 전부 추출하라.

규칙:
- 대표명과 최초 등장 페이지(원문의 [페이지 N] 기준, 정확히 그 숫자를 인용)
- 별칭: 원문 표기가 다른 경우(1937년작 특유의 고어체·방언·띄어쓰기 변형 포함), 호칭·직함·가족관계 호칭을 전부 별칭으로 등록. 유형은 name(이름 표기 변형) / title(직함) / kinship(가족관계 호칭) / nickname(그 외 호칭) 중 하나, 각 별칭의 최초 등장 페이지도 표시
- 인물 노트: 이 인물을 설명하는 서술 문장을 문장당 1개씩, 근거 페이지와 함께. 이 장에서는 인물당 최대 2문장까지만
- 이미 등장한 인물: ${known} — 같은 인물이면 새로 만들지 말고 그 이름을 그대로 써라

출력은 아래 JSON 형식만 반환하라. 다른 설명·마크다운 코드블록 없이 JSON 텍스트만 출력하라.
{"characters": [{"name": "...", "first_appearance_page": 0, "aliases": [{"alias": "...", "type": "name|title|kinship|nickname", "first_appearance_page": 0}], "notes": [{"note": "...", "source_page": 0}]}]}

--- 원문 ---
${buildPageTaggedText(pages)}`;
}

/** 관계 — FR-DAT-005, A6(이력형 복수 행), 확립 페이지 = 이른 쪽 */
export function buildRelationshipPrompt(chapter: Chapter, pages: Page[], knownCharacterNames: string[]): string {
  const known = knownCharacterNames.length > 0 ? knownCharacterNames.join(', ') : '(없음 — 이 장이 첫 장)';
  return `다음은 「탁류」 ${chapter.chapter_no}장 "${chapter.title}"의 원문이다(각 문단 앞에 [페이지 N] 표시).
이 장에서 드러나는 인물 간 관계를 추출하라.

규칙:
- 확립 페이지 = "호칭이 처음 등장한 페이지"와 "서술로 관계가 드러난 페이지" 중 이른 쪽
- 같은 두 인물의 관계가 이 장에서 바뀌면(예: 약혼 → 부부) 기존 라벨을 덮어쓰지 말고 새 행으로 추가하라(이력형)
- 이미 등장한 인물: ${known}

출력은 아래 JSON 형식만 반환하라. 다른 설명·마크다운 코드블록 없이 JSON 텍스트만 출력하라.
{"relationships": [{"character_a": "...", "character_b": "...", "label": "...", "established_page": 0}]}

--- 원문 ---
${buildPageTaggedText(pages)}`;
}

/** 배경지식·소개 — FR-DAT-006, R5(상한 없음, 1페이지 시점에도 안전해야 함) */
export function buildBackgroundPrompt(title: string, author: string): string {
  return `${author}의 장편소설 「${title}」(1937~1938년 조선일보 연재)에 대한 배경지식과 책 소개를 작성하라.

절대 규칙: 이 소설의 결말, 구체적 사건, 인물의 운명·관계 변화를 절대 언급하지 마라. 이 책을 1페이지도 읽지 않은 독자가 봐도 완전히 안전해야 한다.
- background: 시대 배경(1930년대 일제강점기 조선), 작품의 소재·무대(미두장, 군산), 읽기 포인트(문체 특징 등). 사건 언급 금지
- intro: 작품을 소개하는 글. 줄거리 요약이나 결말 암시 없이, 어떤 분위기·주제의 작품인지만

출력은 아래 JSON 형식만 반환하라. 다른 설명·마크다운 코드블록 없이 JSON 텍스트만 출력하라.
{"background": "...", "intro": "..."}`;
}

/** 용어 — FR-DAT-007 */
export function buildTermPrompt(chapter: Chapter, pages: Page[]): string {
  return `다음은 「탁류」 ${chapter.chapter_no}장 "${chapter.title}"의 원문이다(각 문단 앞에 [페이지 N] 표시).
현대 독자가 이해하기 어려운 용어(방언, 고어, 1930년대 전문용어 — 예: 미두장, 하바꾼 등)를 추출하고 뜻을 설명하라. 최초 등장 페이지를 표시하라.
응답 길이 제한이 있으니 이 장에서 가장 중요하고 대표적인 용어 위주로 **최대 15개까지만** 추려라.

출력은 아래 JSON 형식만 반환하라. 다른 설명·마크다운 코드블록 없이 JSON 텍스트만 출력하라.
{"terms": [{"term": "...", "definition": "...", "first_appearance_page": 0}]}

--- 원문 ---
${buildPageTaggedText(pages)}`;
}

/** 사건 — FR-DAT-008 */
export function buildEventPrompt(chapter: Chapter, pages: Page[]): string {
  return `다음은 「탁류」 ${chapter.chapter_no}장 "${chapter.title}"의 원문이다(각 문단 앞에 [페이지 N] 표시).
이 장에서 벌어진 주요 사건(타임라인에 남을 사건)을 추출하라. 발생 페이지를 표시하라.

출력은 아래 JSON 형식만 반환하라. 다른 설명·마크다운 코드블록 없이 JSON 텍스트만 출력하라.
{"events": [{"event": "...", "description": "...", "occurrence_page": 0}]}

--- 원문 ---
${buildPageTaggedText(pages)}`;
}

/** LLM 응답에서 JSON을 안전하게 뽑아낸다(마크다운 코드블록으로 감싸는 경우 대응) */
export function parseJsonResponse<T>(raw: string): T {
  let text = raw.trim();
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) text = fenceMatch[1].trim();

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`JSON을 찾을 수 없음: ${raw.slice(0, 200)}`);
  }
  return JSON.parse(text.slice(start, end + 1)) as T;
}
