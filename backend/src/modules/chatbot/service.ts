import { SYSTEM_RULES, COMPLETION_STANCE, buildQuoteSection } from './response-policy';
import type { ChatbotQueryLog } from '../../shared/types';
import { assembleContext, buildStableContextParts } from './context-assembly';
import { vectorSearch } from './vector-search';
import { selectModel, logModelSelection, recordSelection, CHATBOT_TASK } from './difficulty-router';
import { stream as llmStream } from '../llm-gateway/gateway';
import { getMockContext, getMockSearchResults, getMockLLMResponse } from './__mocks__/mock-data';
import { recordTurns, getConversationContext } from './conversation-service';
import { questionFocus } from './question-focus';
import { resolveConversationContext } from './conversation-context';
import { formatConversationInput } from './conversation-input';

const MOCK_MODE = process.env.MOCK_MODE === 'true';

export { CHATBOT_TASK };

const NO_EVIDENCE_TOKEN = '[NO_EVIDENCE]';

export const NO_EVIDENCE_MESSAGE =
  '🔒 지금까지 읽은 내용으로는 알 수 없어요 🤔 다른 질문을 해보시겠어요?';

export const AMO_INTRO_MESSAGE =
  '저는 아모예요. 지금까지 읽은 내용 안에서만, 스포일러 없이 답해드리는 도우미예요. 궁금한 거 편하게 물어보세요.';

function isAskingAboutAmo(query: string): boolean {
  // Only a pure introduction intent may skip retrieval; mixed story questions continue normally.
  const text = query
    .trim()
    .replace(/[?？!！.。]+$/u, '')
    .trim();
  if (/^(?:아모(?:가\s*뭐야|에\s*대해\s*알려줘|야)|너\s*이름이\s*아모야)$/u.test(text)) return true;
  if (/^(?:너(?:는)?|넌|당신(?:은)?)\s*누구(?:야|니|세요)$/u.test(text)) return true;
  if (
    /^(?:너(?:는|의)?|넌|네|니|당신(?:은|의)?)\s*이름(?:이|은)?\s*(?:뭐야|뭐니|뭐예요|무엇인가요)$/u.test(
      text
    )
  )
    return true;

  // A bare name question may refer to a story character; only bypass retrieval when addressed to Amo.
  const addressed = text.replace(/^아모야[,\s]+|[,\s]+아모야$/gu, '').trim();
  return (
    addressed !== text &&
    /^(?:이름(?:이|은)?\s*(?:뭐야|뭐니|뭐예요|무엇인가요)|누구(?:야|니|세요))$/u.test(addressed)
  );
}

export async function* handleQuery(
  bookId: string,
  query: string,
  K: number,
  deviceId: string,
  conversationId?: number,
  quote?: string,
  currentPageText?: { pageNo: number; content: string },
  isComplete = false
): AsyncGenerator<string> {
  // This payload is loaded by the server route; still enforce K at the final boundary.
  currentPageText =
    currentPageText &&
    Number.isInteger(currentPageText.pageNo) &&
    currentPageText.pageNo >= 1 &&
    currentPageText.pageNo <= K
      ? currentPageText
      : undefined;
  let generationDeadline: ReturnType<typeof setTimeout> | undefined;
  let generationController: AbortController | undefined;

  if (isAskingAboutAmo(query)) {
    if (conversationId != null) {
      if (quote) await recordTurns(conversationId, query, AMO_INTRO_MESSAGE, K, quote);
      else await recordTurns(conversationId, query, AMO_INTRO_MESSAGE, K);
    }
    await logQuery({
      timestamp: new Date(),
      device_id: deviceId,
      book_id: bookId,
      cutoff_page: K,
      query,
      quote,
      input_records: {
        chapter_summaries: [],
        current_chapter_pages: [],
        characters: [],
        relationships: [],
        character_notes: [],
        terms: [],
        events: [],
        background: 'none',
      },
      search_selected_pages: [],
      no_evidence: false,
      is_complete: isComplete,
      model: 'canned:amo-self-intro',
      output_ref: `chatbot-amo-${Date.now()}`,
      tokens: { input: 0, output: AMO_INTRO_MESSAGE.length },
    });
    yield AMO_INTRO_MESSAGE;
    return;
  }

  try {
    const context = MOCK_MODE ? getMockContext(K) : await assembleContext(bookId, K);

    const priorTurns =
      conversationId != null && !MOCK_MODE ? await getConversationContext(conversationId, K) : [];
    // Resolve the user's subject before retrieval, using only cutoff-filtered history.
    // Past assistant claims are conversational context, never an identity lookup.
    const dialogue = resolveConversationContext(
      formatConversationInput(query, quote),
      priorTurns,
      context.entities.characters,
      K
    );
    const subjectHint =
      dialogue.status === 'explicit' && !quote
        ? ''
        : dialogue.retrievalHint || quote?.slice(0, 500);
    const searchResults = MOCK_MODE
      ? getMockSearchResults(query, K)
      : subjectHint
        ? await vectorSearch(bookId, query, K, subjectHint)
        : await vectorSearch(bookId, query, K);

    // A8-2: the same K-bounded context, ordered append-only and sent before history so the
    // provider prefix cache can hit across turns. Selection is unchanged (FR-SPL-002 🚦, R4).
    const stableContext = buildStableContextParts(context);

    let fullPrompt = '';

    if (isComplete) {
      fullPrompt += `\n\n${COMPLETION_STANCE}`;
    }
    if (searchResults.length > 0) {
      fullPrompt += '\n\n## 검색 결과 (관련 페이지)\n\n';
      searchResults.forEach((result) => {
        fullPrompt += `### p.${result.page_no}\n${result.content}\n\n`;
      });
    }

    if (currentPageText) {
      fullPrompt += `\n\n## ⚠️ 지금 보고 있는 페이지 본문 (p.${currentPageText.pageNo}) — 사용자가 실제로 읽고 있는 확정된 텍스트\n\n${currentPageText.content}\n\n(위는 사용자가 지금 화면에 띄워 놓은 페이지 전체입니다. 질문의 답이 이 안에 있으면 "${NO_EVIDENCE_TOKEN}"을 반환하지 말고 반드시 이 내용으로 답하세요 — 이 안의 단어·인명·지명·서술은 전부 이미 열람 가능한 확정된 근거입니다. "지금 몇 페이지야?", "현재 페이지 어디야?"처럼 사용자의 현재 위치를 묻는 질문에는 무조건 정확히 "p.${currentPageText.pageNo}"로만 답하세요 — "이전 대화"나 다른 근거에 있는 페이지 번호를 쓰지 말고, 다른 숫자를 지어내지도 마세요.)`;
    }

    if (quote) {
      const quoteSources = [...searchResults];
      if (currentPageText)
        quoteSources.unshift({
          page_no: currentPageText.pageNo,
          content: currentPageText.content,
          distance: 0,
        });
      fullPrompt += buildQuoteSection(quote, quoteSources, K);
    }

    const focus = questionFocus(query);
    if (focus) {
      fullPrompt += `\n\n## 질문 초점 (사용자 문장의 구조이며 작품 근거 아님)\n\n${JSON.stringify(focus)}`;
    }
    fullPrompt += `\n\n## 대화 대상 (사용자 표현의 연결이며 작품 사실 아님)\n\n${JSON.stringify({
      status: dialogue.status,
      subjects: dialogue.subjects,
    })}`;
    const subjectFacts = context.entities.characters
      .filter(
        (character) =>
          character.first_appearance_page <= K && dialogue.subjects.includes(character.name)
      )
      .map(({ name, first_appearance_page }) => ({ name, first_appearance_page }));
    if (subjectFacts.length) {
      fullPrompt += `\n\n## 현재 질문 대상의 인물 근거 (현재 읽기 범위의 서버 자료)\n\n${JSON.stringify({ subject_facts: subjectFacts })}`;
    }
    fullPrompt += `\n\n# 사용자 질문\n\n${query}`;
    fullPrompt = fullPrompt.replace(/^\n+/, '');

    const modelSelection = selectModel(query);
    logModelSelection(modelSelection, query);
    recordSelection(modelSelection.model);

    const task = CHATBOT_TASK;
    const controller = new AbortController();
    generationController = controller;
    // One generation request, including SDK transport retries, shares this deadline.
    generationDeadline = setTimeout(() => controller.abort(), 60_000);
    const streamSource = MOCK_MODE
      ? getMockLLMResponse(query)
      : llmStream(task, fullPrompt, {
          system: SYSTEM_RULES,
          context: stableContext,
          history: dialogue.history,
          signal: controller.signal,
        });
    let responseText = '';
    let pending = '';

    // Stream immediately. Only a possible split internal control token is held locally.
    // FR-SPL-005: control tokens are errors, never canned answers or extra LLM calls.
    for await (const chunk of streamSource) {
      controller.signal.throwIfAborted();
      pending += chunk;
      if (pending.includes(NO_EVIDENCE_TOKEN)) throw new Error('CHATBOT_INTERNAL_TOKEN');
      let held = Math.min(pending.length, NO_EVIDENCE_TOKEN.length - 1);
      while (held > 0 && !pending.endsWith(NO_EVIDENCE_TOKEN.slice(0, held))) held--;
      const ready = pending.slice(0, pending.length - held);
      pending = pending.slice(pending.length - held);
      if (ready) {
        responseText += ready;
        yield ready;
      }
    }
    controller.signal.throwIfAborted();
    if (pending) {
      responseText += pending;
      yield pending;
    }
    if (!responseText.trim()) throw new Error('CHATBOT_EMPTY_RESPONSE');
    clearTimeout(generationDeadline);

    if (conversationId != null) {
      if (quote) await recordTurns(conversationId, query, responseText, K, quote);
      else await recordTurns(conversationId, query, responseText, K);
    }

    await logQuery({
      timestamp: new Date(),
      device_id: deviceId,
      book_id: bookId,
      cutoff_page: K,
      query,
      quote,
      input_records: {
        chapter_summaries: context.chapter_summaries.map((ch) => ch.title),
        current_chapter_pages: [], // TODO
        characters: context.entities.characters.map((c) => c.id),
        relationships: context.entities.relationships.map((r) => r.id),
        character_notes: context.entities.character_notes.map((n) => n.id),
        terms: context.entities.terms.map((t) => t.id),
        events: context.entities.events.map((e) => e.id),
        background: context.background ? 'included' : 'none',
      },
      search_selected_pages: searchResults.map((r) => ({
        page_no: r.page_no,
        distance: r.distance,
      })),
      no_evidence: false,
      is_complete: isComplete,
      model: modelSelection.modelId,
      logical_model_calls: MOCK_MODE ? 0 : 1,
      output_ref: `chatbot-${Date.now()}`,
      tokens: {
        input: 0, // TODO: 실제 토큰 수
        output: responseText.length, // 임시
      },
    });
  } catch (error) {
    console.error('[Chatbot] Query failed', { bookId, query, K, error });
    throw error;
  } finally {
    if (generationDeadline) clearTimeout(generationDeadline);
    generationController?.abort();
  }
}

async function logQuery(log: ChatbotQueryLog): Promise<void> {
  // NFR-OBS-005: preserve every record ID in one physical stdout line.
  console.log(
    '[Chatbot] Query log',
    JSON.stringify({
      timestamp: log.timestamp.toISOString(),
      device_id: log.device_id,
      book_id: log.book_id,
      cutoff_page: log.cutoff_page,
      query: log.query.substring(0, 50),
      quote: log.quote?.substring(0, 50),
      input_records: log.input_records,
      search_selected_pages: log.search_selected_pages,
      search_result_count: log.search_selected_pages.length,
      no_evidence: log.no_evidence,
      is_complete: log.is_complete ?? false,
      model: log.model,
      logical_model_calls: log.logical_model_calls ?? 0,
      output_ref: log.output_ref,
      tokens: log.tokens,
    })
  );
}

export function getChatbotStats(): {
  noEvidenceToken: string;
  noEvidenceMessage: string;
} {
  return {
    noEvidenceToken: NO_EVIDENCE_TOKEN,
    noEvidenceMessage: NO_EVIDENCE_MESSAGE,
  };
}
