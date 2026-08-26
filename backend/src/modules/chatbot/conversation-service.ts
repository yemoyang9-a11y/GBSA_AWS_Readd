/**
 * 챗봇 대화 이력 서비스 (R3 소유)
 *
 * 사용자가 나중에 다시 열어보는 대화 목록 — 클로드류 "새 채팅" + 하루 단위 자동 롤오버.
 * 2026-08-24 사용자·R2 조율 결정. R6("세션 = 무조작 30분")와는 다른 개념이라 이름을
 * "세션"이 아니라 "대화(conversation)"로 둔다 — 용어 충돌 방지.
 *
 * @see migrations/005_chatbot_conversation_history.sql
 */

import * as repo from './conversation-repository';
import type { ConversationRow, ConversationTurnRow } from './conversation-repository';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** KST(Asia/Seoul) 자정 기준 캘린더 날짜 — 사용자 승인 결정 */
export function kstDateString(date: Date = new Date()): string {
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  return kst.toISOString().slice(0, 10);
}

export interface ResolvedConversation {
  conversationId: number;
  isNew: boolean;
}

/**
 * 요청 바디로 들어온 conversationId를 정수로 정규화한다.
 *
 * `chatbot_conversation.id`는 BIGINT라 pg 드라이버가 문자열로 돌려준다("241") —
 * SSE `done` 프레임도 그 값을 그대로 실어 보내고, 프론트는 다음 질문에 받은 값을
 * 그대로 왕복시킨다. 그래서 요청 바디의 conversationId도 문자열로 들어온다.
 * `typeof x === 'number'`처럼 타입만 보고 판별하면 문자열은 전부 "안 보냄"으로
 * 취급돼 resolveConversation이 매번 새 대화를 만든다(2026-08-25, 사용자 제보 — "같은
 * 세션에서 진행한 대화인데도 각각 다른 기록으로 저장된다"). 숫자든 숫자 문자열이든
 * 정수로 정규화해서 판정해야 한다.
 */
export function parseConversationId(raw: unknown): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  // 빈 문자열은 Number('') === 0 이라 정수 검사를 그냥 통과해버린다 — 값이 없는
  // 것과 진짜 0을 구분하려면 빈 문자열을 먼저 걸러야 한다.
  if (typeof raw === 'string' && raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isInteger(n) ? n : undefined;
}

/**
 * 이번 질의가 속할 대화를 정한다.
 *
 * - requestedConversationId 없음 → 새 대화 (수동 "새 채팅"도 이 경로 — 프론트가 로컬
 *   conversationId를 비우고 보내면 여기로 온다)
 * - requestedConversationId 있고 오늘(KST) 날짜와 같음 → 이어서 사용, 봉인 기준점 래칫
 * - requestedConversationId 있는데 다른 디바이스/도서 소유이거나 날짜가 지났음 → 새 대화로
 *   자동 롤오버 (하루가 지나면 자동으로 새 채팅 — 사용자 요구사항)
 */
export async function resolveConversation(
  deviceId: string,
  bookId: string,
  K: number,
  requestedConversationId?: number
): Promise<ResolvedConversation> {
  const today = kstDateString();

  if (requestedConversationId != null) {
    const existing = await repo.getConversationById(deviceId, bookId, requestedConversationId);
    if (existing && existing.conversation_date === today) {
      await repo.ratchetCutoff(existing.id, K);
      return { conversationId: existing.id, isNew: false };
    }
  }

  const created = await repo.createConversation(deviceId, bookId, K, today);
  return { conversationId: created.id, isNew: true };
}

/**
 * 대화에 문답 한 쌍(사용자 질문 + 싸비 답변)을 기록한다.
 * 제목은 그 대화의 첫 질문으로만 채워진다(이미 있으면 덮어쓰지 않음).
 *
 * @param K - 이 문답이 적용한 기준점. 나중에 맥락으로 재사용할 때(getConversationContext)
 *   이 값으로 필터링한다.
 */
export async function recordTurns(
  conversationId: number,
  query: string,
  answer: string,
  K: number
): Promise<void> {
  const base = await repo.getMaxTurnNo(conversationId);
  await repo.insertTurn(conversationId, base + 1, 'user', query, K);
  await repo.insertTurn(conversationId, base + 2, 'assistant', answer, K);
  await repo.setTitleIfMissing(conversationId, query.slice(0, 40));
  await repo.touchConversation(conversationId);
}

/**
 * 새 질문의 프롬프트에 섞을 "이전 대화" 맥락.
 *
 * cutoff_page <= K 인 turn만 포함한다 — 대화를 이어가는 도중 뒤로 페이지 이동한 뒤에도
 * 그보다 큰 K에서 생성된 예전 답변이 새 프롬프트로 새어 들어가지 않게 막는다
 * (005 마이그레이션의 cutoff_page 컬럼 주석 참조). 근거(evidence)가 아니라 맥락 파악용이므로
 * 호출부(service.ts)가 프롬프트에서 "근거 데이터"와 분리된 별도 섹션으로 넣는다.
 */
export async function getConversationContext(
  conversationId: number,
  K: number
): Promise<Array<{ role: 'user' | 'assistant'; text: string }>> {
  const rows = await repo.listTurnsForContext(conversationId, K);
  return rows.map((r) => ({ role: r.role, text: r.text }));
}

export interface ConversationSummary {
  id: number;
  conversation_date: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

function toSummary(row: ConversationRow): ConversationSummary {
  return {
    id: row.id,
    conversation_date: row.conversation_date,
    title: row.title,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

/**
 * 대화 목록. 봉인 기준점이 현재 K를 넘는 대화(뒤로 페이지 이동 후)는 목록에서 빠진다
 * — 005 마이그레이션 헤더의 결정 참조.
 */
export async function listConversations(
  deviceId: string,
  bookId: string,
  K: number
): Promise<ConversationSummary[]> {
  const rows = await repo.listConversations(deviceId, bookId, K);
  return rows.map(toSummary);
}

export interface ConversationDetail extends ConversationSummary {
  turns: Array<{ role: 'user' | 'assistant'; text: string }>;
}

/**
 * 대화 상세. 목록과 같은 봉인 규칙을 여기서도 다시 확인한다 — 목록에 안 보여도 ID를 직접
 * 넣어 조회하는 경로가 우회로가 되지 않도록 하는 방어선이다 (절대 규칙 6번).
 * 존재하지 않는 것과 봉인되어 숨겨진 것을 구분하지 않고 둘 다 null을 반환한다.
 */
export async function getConversationDetail(
  deviceId: string,
  bookId: string,
  conversationId: number,
  K: number
): Promise<ConversationDetail | null> {
  const row = await repo.getConversationById(deviceId, bookId, conversationId);
  if (!row || row.cutoff_page > K) {
    return null;
  }

  const turns = await repo.listTurns(conversationId);
  return {
    ...toSummary(row),
    turns: turns.map((t: ConversationTurnRow) => ({ role: t.role, text: t.text })),
  };
}

/** 대화 삭제(2026-08-25, 사용자 요청). 존재하지 않거나 소유자가 다르면 false. */
export async function deleteConversation(
  deviceId: string,
  bookId: string,
  conversationId: number
): Promise<boolean> {
  return repo.deleteConversation(deviceId, bookId, conversationId);
}
