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
export { validateGroundedChapter } from './grounding';

/** LLM이 페이지 번호를 정확히 인용할 수 있도록 원문에 페이지 표시를 단다 */
export function buildPageTaggedText(pages: Page[]): string {
  return pages.map((p) => `[페이지 ${p.page_no}]\n${p.content}`).join('\n\n');
}

/** 장 요약 — FR-DAT-003 🚦. 입력은 "장 단위"(해당 장 원문만) — 이후 사건이 물리적으로 없다 */
export function buildSummaryPrompt(chapter: Chapter, pages: Page[]): string {
  return `다음은 이 작품 ${chapter.chapter_no}장 "${chapter.title}"의 원문 전체다.
이 장에서 벌어지는 사건만 3~5문장으로 요약하라. 이 장 이후에 일어나는 일은 절대 언급하지 마라(알더라도 금지).
출력은 아래 JSON 형식만 반환하라. 다른 설명·마크다운 코드블록 없이 JSON 텍스트만 출력하라.
{"summary": "..."}

--- 원문 ---
${buildPageTaggedText(pages)}`;
}

/** 인물 + 별칭 + 인물 노트 — FR-DAT-004, D6(전 별칭 태깅), A5(노트 상한) */
export function buildCharacterPrompt(
  chapter: Chapter,
  pages: Page[],
  knownCharacterNames: string[]
): string {
  const known =
    knownCharacterNames.length > 0 ? knownCharacterNames.join(', ') : '(없음 — 이 장이 첫 장)';
  return `다음은 이 작품 ${chapter.chapter_no}장 "${chapter.title}"의 원문이다(각 문단 앞에 [페이지 N] 표시).
이 장에서 처음 등장하거나 언급되는 인물을 전부 추출하라.

규칙:
- 대표명과 최초 등장 페이지(원문의 [페이지 N] 기준, 정확히 그 숫자를 인용)
- 별칭: 원문 표기가 다른 경우(1937년작 특유의 고어체·방언·띄어쓰기 변형 포함), 호칭·직함·가족관계 호칭을 전부 별칭으로 등록. 유형은 name(이름 표기 변형) / title(직함) / kinship(가족관계 호칭) / nickname(그 외 호칭) 중 하나, 각 별칭의 최초 등장 페이지도 표시
- 인물 노트: 이 인물을 설명하는 서술 문장을 문장당 1개씩, 근거 페이지와 함께. 이 장에서는 인물당 최대 2문장까지만
- 이미 등장한 인물: ${known}. name은 현재 원문 표기를 사용한다. 나중에 알려지는 본명으로 앞부분의 이름을 바꾸지 않는다.
- entity_type은 person/non_person/uncertain 중 하나다. person은 인간만이 아니라 대화하거나 독립적으로 행동하는 동물·AI 등 비인간 서사 행위자도 포함하는 등장인물 분류다. non_person은 비행위자인 사물·장소다. 사물 형태의 이름도 인물의 별명일 수 있다. 단순히 이름이 나온다는 이유로 인물이 되지 않는다. 행동·대사·서술에 근거한 rationale을 쓴다. 불확실한 후보도 uncertain으로 남긴다.
- identity_status는 기존 인물과 동일하면 same, 처음 등장하거나 별개인 인물이면 distinct, 동일인 여부가 모호하면 uncertain이다. rationale에 동일인 판정 이유도 쓴다. 동명이인·공유 호칭을 임의로 합치지 않는다.
- 인물·별칭 대응·노트마다 독립적인 evidence와 rationale을 쓴다. evidence는 source_page와 quote다. quote는 이름과 문맥을 포함한 해당 페이지의 정확한 부분 문자열이다. 유일한 인용이면 서버가 위치를 계산한다. 같은 인용이 반복되는 경우에만 start_char, end_char를 추가하며 페이지 본문의 0 기반 UTF-16 문자 위치이고 end_char는 제외한다.
- 인물 first_appearance_page와 노트 source_page는 각 근거 페이지다. 앞 장의 등장 페이지를 추측하지 않는다. 검증이 늦으면 앞 페이지로 소급하지 않는다.
- 별칭 evidence는 name과 alias 양쪽을 포함하여 동일인임을 보여야 한다. identity_established_page는 그 근거 페이지다. 별칭 첫 등장만으로 동일인 확립을 소급하지 않는다. 두 이름의 단순 동시 등장은 동일인 근거가 아니다.
- 별칭은 한 인물을 실제로 지칭하는 독립된 명사형 표기만 등록한다. 조사·어미가 붙은 일부, 발언 문장, 외모/행동 설명문, 가족·내외 같은 집합은 개인 별칭이 아니다. 친구/동료는 가족호칭(kinship)이 아니며 직업은 title이다. 묘사 수식어가 추가된 별명은 단순 이름 표기(name)가 아니다.
- 별칭 자체의 지시 대상을 reference_type=person_label/description/collective/utterance/non_person/uncertain으로 독립 분류한다. 같은 문장에 대표명이 있어도 그 별칭이 해당 개인을 가리키지 않으면 person_label이 아니다. 다른 사람·사물 지칭, 불명확한 대명사를 억지로 연결하지 않는다. 서버는 person_label만 자동 승인하며 나머지 후보와 근거는 검수에 남긴다.
- 현재 장 안에서 같은 이름이 먼저 나왔다면 최초 인용을 우선 확인한다. 인물의 직업이나 별명의 유래를 나중에 알게 되었다고 최초 등장을 늦추지 않는다. 앞선 같은 표기가 사물이나 동명이인이라면 earlier_mentions에 source_page, kind(non_person|different_person), rationale, evidence를 각각 기록한다. 근거 없는 제외나 이름만 보고 소급하는 것은 금지한다. 서버는 설명되지 않은 앞선 표기가 있으면 인물을 검수 보류한다.

출력은 아래 JSON 형식만 반환하라. 다른 설명·마크다운 코드블록 없이 JSON 텍스트만 출력하라.
{"characters": [{"name": "...", "first_appearance_page": 0, "entity_type": "person|non_person|uncertain", "identity_status": "same|distinct|uncertain", "rationale": "사람 판정과 동일인 여부의 이유", "evidence": {"source_page": 0, "quote": "...", "start_char": 0, "end_char": 0}, "earlier_mentions": [], "aliases": [{"alias": "...", "type": "name|title|kinship|nickname", "reference_type": "person_label|description|collective|utterance|non_person|uncertain", "first_appearance_page": 0, "identity_established_page": 0, "rationale": "...", "evidence": {"source_page": 0, "quote": "...", "start_char": 0, "end_char": 0}}], "notes": [{"note": "...", "source_page": 0, "rationale": "...", "evidence": {"source_page": 0, "quote": "...", "start_char": 0, "end_char": 0}}]}]}

--- 원문 ---
${buildPageTaggedText(pages)}`;
}

/** 관계 — FR-DAT-005, A6(이력형 복수 행), 확립 페이지 = 명시적 근거 페이지 */
export function buildRelationshipPrompt(
  chapter: Chapter,
  pages: Page[],
  knownCharacterNames: string[],
  previousRelationships: string[] = []
): string {
  const known =
    knownCharacterNames.length > 0 ? knownCharacterNames.join(', ') : '(없음 — 이 장이 첫 장)';
  return `다음은 이 작품 ${chapter.chapter_no}장 "${chapter.title}"의 원문이다(각 문단 앞에 [페이지 N] 표시).
이 장에서 드러나는 인물 간 관계를 추출하라.

규칙:
- 확립 페이지 = 관계가 원문에서 명시적으로 확인되는 근거 페이지. 호칭 첫 등장만으로 소급하지 않는다.
- 각 관계는 두 이름을 모두 포함한 정확한 원문 evidence(source_page, quote)와 관계 판정 rationale을 쓴다. 유일한 인용은 서버가 위치를 계산한다. 반복 인용에만 start_char, end_char를 추가하며 0 기반 UTF-16 위치이고 end_char는 제외한다. 단순 동시 등장·추측은 관계로 만들지 않는다.
- 같은 두 인물의 관계가 이 장에서 바뀌면(예: 약혼 → 부부) 기존 라벨을 덮어쓰지 말고 새 행으로 추가하라(이력형)
- assertion_status는 fact/plan/claim/belief/comparison/negated/uncertain 중 하나다. fact는 실제 성립이 원문으로 확인되는 경우만이다. 일방의 결혼/입양 계획, 거짓 유언, 마음속 추측, 친족에 빗댄 표현을 성립한 관계로 승격하지 않는다. 바로 뒤의 서술이나 다음 페이지에서 부정·거짓·오해라고 밝히는지도 확인한다. 불확실한 후보를 fact로 억지 분류하지 않는다. 서버는 fact만 자동 승인한다.
- change_type은 establishment/restatement/transition/disclosure 중 하나다. 새 쌍의 처음 관계는 establishment다. 이전 관계를 다른 표현으로 반복한 경우 restatement이며 새로운 날짜를 만들지 않는다. 이미 알려진 쌍의 상태가 실제 바뀌면 transition, 친구였던 두 사람이 사촌임이 처음 밝혀지는 것처럼 관계의 새 사실이 드러나면 disclosure다. transition/disclosure에는 별도의 change_evidence(source_page, quote, 필요 시 start_char/end_char)로 실제 변화 또는 새 공개를 증명한다. 서버는 라벨만 바꾼 행이 최신 관계를 덮는 것을 보류한다.
- 이미 등장한 인물: ${known}
- 앞 장까지의 최신 관계: ${previousRelationships.length ? previousRelationships.join('; ') : '(없음)'}

출력은 아래 JSON 형식만 반환하라. 다른 설명·마크다운 코드블록 없이 JSON 텍스트만 출력하라.
{"relationships": [{"character_a": "...", "character_b": "...", "label": "...", "established_page": 0, "assertion_status": "fact|plan|claim|belief|comparison|negated|uncertain", "change_type": "establishment|restatement|transition|disclosure", "rationale": "...", "evidence": {"source_page": 0, "quote": "...", "start_char": 0, "end_char": 0}, "change_evidence": {"source_page": 0, "quote": "실제 변화 또는 새 공개를 명시한 원문", "start_char": 0, "end_char": 0}}]}
change_evidence는 transition/disclosure일 때 필수이고 establishment/restatement일 때만 생략할 수 있다.

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
  return `다음은 이 작품 ${chapter.chapter_no}장 "${chapter.title}"의 원문이다(각 문단 앞에 [페이지 N] 표시).
현대 독자가 이해하기 어려운 용어(방언, 고어, 1930년대 전문용어 — 예: 미두장, 하바꾼 등)를 추출하고 뜻을 설명하라. 최초 등장 페이지를 표시하라.
응답 길이 제한이 있으니 이 장에서 가장 중요하고 대표적인 용어 위주로 **최대 15개까지만** 추려라.

출력은 아래 JSON 형식만 반환하라. 다른 설명·마크다운 코드블록 없이 JSON 텍스트만 출력하라.
{"terms": [{"term": "...", "definition": "...", "first_appearance_page": 0}]}

--- 원문 ---
${buildPageTaggedText(pages)}`;
}

/** 사건 — FR-DAT-008 */
export function buildEventPrompt(chapter: Chapter, pages: Page[]): string {
  return `다음은 이 작품 ${chapter.chapter_no}장 "${chapter.title}"의 원문이다(각 문단 앞에 [페이지 N] 표시).
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
