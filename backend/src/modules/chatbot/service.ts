/**
 * 챗봇 서비스 (⑤)
 *
 * R3 담당 - 챗봇 질의 처리
 *
 * @see dev-spec-R3-ai.md 3~5장
 * @see API_CONTRACT.md R3 제공 API
 */

import type { ChatbotQueryLog } from '../../shared/types';
import { assembleContext, buildPrompt } from './context-assembly';
import { vectorSearch } from './vector-search';
import { selectModel, logModelSelection, recordSelection } from './difficulty-router';
import { stream as llmStream } from '../llm-gateway/gateway';

/**
 * 근거 부재 토큰 (FR-QNA-004 🚦)
 */
const NO_EVIDENCE_TOKEN = '[NO_EVIDENCE]';
export const NO_EVIDENCE_MESSAGE = '현재까지 읽은 페이지 기준으로 알 수 없는 내용입니다. 다른 질문 해주세요.';

/**
 * 시스템 규칙 (프롬프트에 포함)
 */
const SYSTEM_RULES = `
# 시스템 규칙

당신은 전자책 독서 보조 챗봇입니다.

## 중요 제약사항

1. **근거 외 생성 금지** (NFR-AI-005):
   - 오직 아래 "근거 데이터"에 포함된 정보만 사용하세요
   - 당신의 사전 지식을 사용하지 마세요
   - 근거에 없는 내용은 절대 추론하거나 생성하지 마세요

2. **근거 부재 처리**:
   - 질문에 답할 근거가 충분하지 않으면 "${NO_EVIDENCE_TOKEN}" 토큰을 응답하세요
   - 이유를 설명하지 마세요. 토큰만 반환하세요

3. **페이지 참조**:
   - 답변 시 관련 페이지 번호를 명시하세요
   - 예: "정주사는 고무신 장사로 돈을 모았습니다 (p.10)."

## 응답 형식

- 간결하고 명확하게 답변하세요
- 근거가 명확한 경우에만 답변하세요
- 불확실하면 "${NO_EVIDENCE_TOKEN}"을 반환하세요
`.trim();

/**
 * 챗봇 질의 처리 (스트리밍)
 *
 * @param bookId - 도서 ID
 * @param query - 사용자 질의
 * @param K - 기준점 (cutoff)
 * @param deviceId - 디바이스 ID (로그용)
 * @yields 텍스트 청크
 *
 * @example
 * for await (const chunk of handleQuery(bookId, query, K, deviceId)) {
 *   res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
 * }
 */
export async function* handleQuery(
  bookId: string,
  query: string,
  K: number,
  deviceId: string
): AsyncGenerator<string> {

  // const startTime = Date.now(); // TODO: 성능 측정 시 사용
  let noEvidence = false;

  try {
    // 1. 근거 조립 (질의 텍스트는 인자로 넘기지 않음! - NFR-SEC-006 🚦)
    const context = await assembleContext(bookId, K);

    // 2. 벡터 검색 (질의 관여, 범위는 K로 강제)
    const searchResults = await vectorSearch(bookId, query, K);

    // 3. 프롬프트 구성
    const basePrompt = buildPrompt(context, SYSTEM_RULES);

    // 검색 결과 추가
    let fullPrompt = basePrompt;
    if (searchResults.length > 0) {
      fullPrompt += '\n\n## 검색 결과 (관련 페이지)\n\n';
      searchResults.forEach(result => {
        fullPrompt += `### p.${result.page_no}\n${result.content}\n\n`;
      });
    }

    // 사용자 질의 추가
    fullPrompt += `\n\n# 사용자 질문\n\n${query}`;

    // 4. 난이도 분기 (규칙 기반)
    const modelSelection = selectModel(query);
    logModelSelection(modelSelection, query);
    recordSelection(modelSelection.model);

    // 5. LLM 호출 (스트리밍)
    const task = `chatbot_${modelSelection.model}`;
    let responseText = '';

    for await (const chunk of llmStream(task, fullPrompt)) {
      responseText += chunk;

      // 근거 부재 토큰 감지 (FR-QNA-004 🚦)
      if (responseText.includes(NO_EVIDENCE_TOKEN)) {
        noEvidence = true;
        break;
      }

      yield chunk;
    }

    // 6. 근거 부재 처리
    if (noEvidence) {
      // 서버 상수 문구로 치환 (FR-QNA-004 🚦)
      yield NO_EVIDENCE_MESSAGE;
    }

    // 7. 로그 기록 (NFR-OBS-005 🚦)
    await logQuery({
      timestamp: new Date(),
      device_id: deviceId,
      book_id: bookId,
      cutoff_page: K,
      query,
      input_records: {
        chapter_summaries: context.chapter_summaries.map(ch => ch.title),
        current_chapter_pages: [], // TODO
        characters: context.entities.characters.map(c => c.id),
        relationships: context.entities.relationships.map(r => r.id),
        character_notes: context.entities.character_notes.map(n => n.id),
        terms: context.entities.terms.map(t => t.id),
        events: context.entities.events.map(e => e.id),
        background: context.background ? 'included' : 'none',
      },
      search_selected_pages: searchResults.map(r => ({
        page_no: r.page_no,
        distance: r.distance,
      })),
      no_evidence: noEvidence,
      model: modelSelection.modelId,
      output_ref: `chatbot-${Date.now()}`,
      tokens: {
        input: 0, // TODO: 실제 토큰 수
        output: responseText.length, // 임시
      },
    });

  } catch (error) {
    console.error('[Chatbot] Query failed', { bookId, query, K, error });
    throw error;
  }
}

/**
 * 챗봇 질의 로그 기록
 *
 * NFR-OBS-005 🚦
 */
async function logQuery(log: ChatbotQueryLog): Promise<void> {
  // TODO: 실제 DB에 저장
  // INSERT INTO chatbot_query_log (...)

  console.log('[Chatbot] Query log', {
    timestamp: log.timestamp.toISOString(),
    device_id: log.device_id,
    book_id: log.book_id,
    cutoff_page: log.cutoff_page,
    query: log.query.substring(0, 50),
    search_result_count: log.search_selected_pages.length,
    no_evidence: log.no_evidence,
    model: log.model,
  });
}

/**
 * 챗봇 통계 조회 (모니터링용)
 */
export function getChatbotStats(): {
  noEvidenceToken: string;
  noEvidenceMessage: string;
} {
  return {
    noEvidenceToken: NO_EVIDENCE_TOKEN,
    noEvidenceMessage: NO_EVIDENCE_MESSAGE,
  };
}
