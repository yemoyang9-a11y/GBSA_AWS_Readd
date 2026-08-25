/**
 * 챗봇 근거 조립기
 *
 * ⚠️ 중요: 질의 텍스트를 인자로 받지 않음! (NFR-SEC-006 🚦)
 * 이것이 1차 방어선입니다.
 *
 * @see dev-spec-R3-ai.md 3장
 * @see architecture-r1.md 5.3절
 */

import type {
  ChatbotContext,
  ChapterSummary,
  Character,
  Relationship,
  CharacterNote,
  Term,
  Event,
} from '../../shared/types';
import * as repo from './repository';

/**
 * 챗봇 근거 조립
 *
 * FR-QNA-006 🚦: 근거 조립 범위
 *
 * ⚠️ 이 함수는 질의 텍스트(query)를 인자로 받지 않습니다!
 * 질의는 검색(vector-search)에만 사용되며, 전량 주입분은 질의와 무관합니다.
 *
 * @param bookId - 도서 ID
 * @param K - 기준점 (cutoff = current_page - 1)
 * @returns 챗봇 근거 컨텍스트
 *
 * @example
 * const snapshot = await getCutoffSnapshot(deviceId, bookId);
 * const context = await assembleContext(bookId, snapshot.cutoff);
 */
export async function assembleContext(
  bookId: string,
  K: number // cutoff (기준점)
  // ⚠️ query는 인자로 받지 않는다! (NFR-SEC-006 🚦)
): Promise<ChatbotContext> {
  // ① 전량 주입분 (질의 비관여, 결정적)
  // 같은 K에서 질의를 바꿔도 이 부분은 동일해야 함

  // ①-0 책 제목·저자 (상한 없음 — 배경지식과 동일한 방식)
  const book = await getBookMeta(bookId);

  // ①-a 장 요약 전부 (종료 페이지 <= K)
  const chapterSummaries = await findChapterSummaries(bookId, K);

  // ①-b 현재 장 원문 절단 [현재 장 시작 .. K]
  const currentChapterText = await getCurrentChapterText(bookId, K);

  // ② 엔티티 전량 (각 <= K)
  const characters = await findCharacters(bookId, K);
  const relationships = await findRelationships(bookId, K); // A6: 이력 전체, 페이지 병기
  const characterNotes = await findCharacterNotes(bookId, K);
  const terms = await findTerms(bookId, K);
  const events = await findEvents(bookId, K);

  // ③ 배경지식 전문 (R5: 상한 없음)
  const background = await getBackgroundKnowledge(bookId);

  return {
    book,
    chapter_summaries: chapterSummaries,
    current_chapter_text: currentChapterText,
    entities: {
      characters,
      relationships,
      character_notes: characterNotes,
      terms,
      events,
    },
    background,
  };
}

/**
 * 책 제목·저자 조회
 *
 * 상한 없음 — 배경지식(getBackgroundKnowledge)과 같은 고정 메타데이터라 K를 받지 않는다.
 */
async function getBookMeta(bookId: string): Promise<{ title: string; author: string }> {
  return repo.getBookMeta(bookId);
}

/**
 * 장 요약 조회 (완결된 장만)
 *
 * FR-QNA-006 🚦: 종료 페이지 <= K
 */
async function findChapterSummaries(bookId: string, K: number): Promise<ChapterSummary[]> {
  return repo.findChapterSummaries(bookId, K);
}

/**
 * 현재 장 원문 절단
 *
 * FR-QNA-006 🚦: [현재 장 시작 .. K]
 *
 * @returns 절단된 원문 (페이지 연결)
 */
async function getCurrentChapterText(bookId: string, K: number): Promise<string | null> {
  return repo.getCurrentChapterText(bookId, K);
}

/**
 * 인물 조회
 *
 * FR-QNA-006 🚦: 최초 등장 페이지 <= K
 */
async function findCharacters(bookId: string, K: number): Promise<Character[]> {
  return repo.findCharacters(bookId, K);
}

/**
 * 관계 조회 (이력 전체, 페이지 병기)
 *
 * A6: 챗봇 근거에는 이력 전체를 확립 페이지와 병기해 넣는다
 * (표시는 최신 라벨 1개지만, 챗봇은 변화 자체가 답이 되는 질의에 대응)
 *
 * FR-QNA-006 🚦: 확립 페이지 <= K
 */
async function findRelationships(bookId: string, K: number): Promise<Relationship[]> {
  return repo.findRelationships(bookId, K);
}

/**
 * 인물 노트 조회
 *
 * FR-QNA-006 🚦: 근거 페이지 <= K
 */
async function findCharacterNotes(bookId: string, K: number): Promise<CharacterNote[]> {
  return repo.findCharacterNotes(bookId, K);
}

/**
 * 용어 조회
 *
 * FR-QNA-006 🚦: 최초 등장 페이지 <= K
 */
async function findTerms(bookId: string, K: number): Promise<Term[]> {
  return repo.findTerms(bookId, K);
}

/**
 * 사건 조회
 *
 * FR-QNA-006 🚦: 발생 페이지 <= K
 */
async function findEvents(bookId: string, K: number): Promise<Event[]> {
  return repo.findEvents(bookId, K);
}

/**
 * 배경지식 조회
 *
 * R5: 상한 없음 (1페이지 시점에도 안전한 고정 콘텐츠)
 * FR-BGK-002 🚦
 */
async function getBackgroundKnowledge(bookId: string): Promise<string> {
  return repo.getBackgroundKnowledge(bookId);
}

/**
 * 프롬프트 구성
 *
 * 근거 블록을 LLM 프롬프트로 변환
 *
 * @param context - 근거 컨텍스트
 * @param systemRules - 시스템 규칙 (근거 외 생성 금지, 근거 부재 토큰 규약)
 * @returns 구조화된 프롬프트
 */
export function buildPrompt(context: ChatbotContext, systemRules: string): string {
  // NFR-AI-005: 근거 외 생성 금지
  // A10: 모델의 사전 지식 누설 방지 (유일한 수단, 100% 보장 아님)

  const sections: string[] = [systemRules, '', '# 근거 데이터', ''];

  // 책 정보 (상한 없음)
  //
  // ⚠️ 실사용 중 발견(2026-08-25) — 시스템 규칙이 "답변 시 페이지 번호를 명시하라"고
  // 강제하다 보니, 페이지에 묶이지 않는 이 섹션(제목·저자)으로 답할 때도 모델이 "(p.1)"
  // 같은 페이지 번호를 스스로 지어내는 걸 실제 Bedrock 호출로 재현 확인했다(드래그
  // 인용문 페이지 지어내기 버그, 커밋 bc71b41과 같은 유형). "지어내지 마라"만 지시했더니
  // 이번엔 "채만식이에요. (p.없음)"처럼 페이지가 없다는 말을 답변에 그대로 노출시키는
  // 새 부작용이 실제 호출에서 나왔다 — "지어내지 말고 조용히 생략하라"까지 명시해서 막는다.
  if (context.book.title || context.book.author) {
    sections.push('## 책 정보');
    if (context.book.title) sections.push(`- 제목: ${context.book.title}`);
    if (context.book.author) sections.push(`- 저자: ${context.book.author}`);
    sections.push(
      '(위 책 정보는 특정 페이지에 속한 내용이 아닙니다. 이 정보로 답할 때는 페이지 번호를 붙이지 마세요 — ' +
        '지어내지도 말고, "페이지 정보 없음"처럼 없다는 사실을 언급하지도 말고, 그냥 조용히 생략하세요.)'
    );
    sections.push('');
  }

  // 장 요약
  if (context.chapter_summaries.length > 0) {
    sections.push('## 장 요약');
    context.chapter_summaries.forEach((ch) => {
      sections.push(`### ${ch.title} (종료: p.${ch.end_page})`);
      sections.push(ch.content);
      sections.push('');
    });
  }

  // 현재 장 원문
  if (context.current_chapter_text) {
    sections.push('## 현재 장 원문 (절단)');
    sections.push(context.current_chapter_text);
    sections.push('');
  }

  // 인물
  if (context.entities.characters.length > 0) {
    sections.push('## 인물');
    context.entities.characters.forEach((char) => {
      sections.push(`- ${char.name} (첫 등장: p.${char.first_appearance_page})`);
    });
    sections.push('');
  }

  // 관계 (이력 전체, 페이지 병기 - A6)
  if (context.entities.relationships.length > 0) {
    sections.push('## 인물 관계 (이력)');
    context.entities.relationships.forEach((rel) => {
      sections.push(`- ${rel.label} (확립: p.${rel.established_page})`);
    });
    // 라벨은 "A → B: 관계" 한 방향으로만 저장된다. 질문이 반대 방향(예: "정주사 아들
    // 누구야?"인데 저장된 라벨은 "정주사 → 병주: 아버지")으로 오면 방향을 못 뒤집어
    // 답을 못 하는 걸 실사용 중 확인해서(2026-08-25) 지시를 목록 바로 옆에 추가한다.
    sections.push(
      '(위 관계는 "A → B: 관계" 한 방향으로만 저장돼 있습니다. 질문이 반대 방향에서 오면 ' +
        '방향을 뒤집어 답하세요 — 예: "정주사 → 병주: 아버지"가 있으면 "정주사 아들 누구야?" ' +
        '질문엔 "병주"로 답하세요(아버지↔아들/딸, 남편↔아내 등).)'
    );
    sections.push('');
  }

  // 용어
  if (context.entities.terms.length > 0) {
    sections.push('## 용어');
    context.entities.terms.forEach((term) => {
      sections.push(`- **${term.term}**: ${term.definition} (p.${term.first_appearance_page})`);
    });
    sections.push('');
  }

  // 사건
  if (context.entities.events.length > 0) {
    sections.push('## 사건');
    context.entities.events.forEach((event) => {
      sections.push(`- ${event.event} (p.${event.occurrence_page}): ${event.description}`);
    });
    sections.push('');
  }

  // ⚠️ 실사용 중 발견(2026-08-25) — SYSTEM_RULES의 "질문 전제가 틀렸을 때 정정하라"는
  // 지시만으로는 부족했다(2026-08-24의 currentPageText 케이스와 같은 이유: 위 인물·관계
  // 목록이 프롬프트 앞부분 시스템 규칙보다 한참 뒤에 있다 보니, Haiku가 존재하지 않는
  // 관계를 물으면 목록에 실제로 정정 근거가 있어도 무시하고 [NO_EVIDENCE]를 반환하는 걸
  // 실제 배포본에서 재현했다 — 예: "정주사 아들 누구야?"에 목록엔 "정주사의 딸 초봉"이
  // 있는데도 거절함). 지시를 근거 바로 옆에 다시 박아 넣는다.
  if (
    context.entities.characters.length > 0 ||
    context.entities.relationships.length > 0 ||
    context.entities.terms.length > 0 ||
    context.entities.events.length > 0
  ) {
    sections.push(
      '(위 인물·인물 관계·용어·사건은 전부 지금까지 확인된 확정 근거입니다. 질문의 전제가 ' +
        '위 내용과 다르면(예: 실제로는 딸인데 "아들"이라고 물음) "[NO_EVIDENCE]" 대신 위 ' +
        '내용으로 정정해서 답하세요 — 단, "OO는 아들이 없어요"처럼 책 전체에 대한 단정적 ' +
        '부정은 쓰지 말고 "지금까지 읽은 부분에서는 ~"으로 범위를 한정하세요.)'
    );
    sections.push('');
  }

  // 배경지식 (상한 없음 - R5)
  if (context.background) {
    sections.push('## 배경지식');
    sections.push(context.background);
    sections.push('');
  }

  return sections.join('\n');
}
