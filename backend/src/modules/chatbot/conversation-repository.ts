/**
 * 챗봇 대화 이력 데이터 접근 레이어 (R3 소유)
 *
 * @see migrations/005_chatbot_conversation_history.sql
 * @see conversation-service.ts — 롤오버·봉인 판정은 이 레이어가 아니라 서비스가 한다
 */

import { pool } from '../../config/database';

export interface ConversationRow {
  id: number;
  device_id: string;
  book_id: string;
  conversation_date: string; // DATE -> 'YYYY-MM-DD'
  cutoff_page: number;
  title: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ConversationTurnRow {
  id: number;
  conversation_id: number;
  turn_no: number;
  role: 'user' | 'assistant';
  text: string;
  /** 이 turn이 생성된 시점의 기준점. 맥락 재사용 시 필터링에 쓴다 */
  cutoff_page: number;
  created_at: Date;
}

export async function getConversationById(
  deviceId: string,
  bookId: string,
  conversationId: number
): Promise<ConversationRow | null> {
  const result = await pool.query(
    `SELECT id, device_id, book_id, conversation_date, cutoff_page, title, created_at, updated_at
     FROM chatbot_conversation
     WHERE id = $1 AND device_id = $2 AND book_id = $3`,
    [conversationId, deviceId, bookId]
  );
  return result.rows[0] ?? null;
}

export async function createConversation(
  deviceId: string,
  bookId: string,
  cutoffPage: number,
  conversationDate: string
): Promise<ConversationRow> {
  const result = await pool.query(
    `INSERT INTO chatbot_conversation (device_id, book_id, conversation_date, cutoff_page)
     VALUES ($1, $2, $3, $4)
     RETURNING id, device_id, book_id, conversation_date, cutoff_page, title, created_at, updated_at`,
    [deviceId, bookId, conversationDate, cutoffPage]
  );
  return result.rows[0];
}

/**
 * 대화의 봉인 기준점을 현재 K와 견주어 더 큰 값으로 갱신한다 (래칫 — 감소하지 않음).
 * 대화 중 사용자가 계속 읽어 K가 커지면, 그 대화는 그 최댓값까지의 정보를 담게 되기 때문.
 */
export async function ratchetCutoff(conversationId: number, K: number): Promise<void> {
  await pool.query(
    `UPDATE chatbot_conversation
     SET cutoff_page = GREATEST(cutoff_page, $2), updated_at = now()
     WHERE id = $1`,
    [conversationId, K]
  );
}

export async function setTitleIfMissing(conversationId: number, title: string): Promise<void> {
  await pool.query(`UPDATE chatbot_conversation SET title = $2 WHERE id = $1 AND title IS NULL`, [
    conversationId,
    title,
  ]);
}

/** 마지막 문답이 끝난 시각을 지난 대화 목록의 실제 활동 시각으로 쓴다. */
export async function touchConversation(conversationId: number): Promise<void> {
  await pool.query(`UPDATE chatbot_conversation SET updated_at = now() WHERE id = $1`, [
    conversationId,
  ]);
}

export async function getMaxTurnNo(conversationId: number): Promise<number> {
  const result = await pool.query(
    `SELECT COALESCE(MAX(turn_no), 0) as max_turn_no
     FROM chatbot_conversation_turn
     WHERE conversation_id = $1`,
    [conversationId]
  );
  return Number(result.rows[0].max_turn_no);
}

export async function insertTurn(
  conversationId: number,
  turnNo: number,
  role: 'user' | 'assistant',
  text: string,
  cutoffPage: number
): Promise<void> {
  await pool.query(
    `INSERT INTO chatbot_conversation_turn (conversation_id, turn_no, role, text, cutoff_page)
     VALUES ($1, $2, $3, $4, $5)`,
    [conversationId, turnNo, role, text, cutoffPage]
  );
}

/**
 * 대화 목록 조회
 *
 * 봉인 규칙: cutoff_page <= K 인 대화만 반환한다. 현재 기준점보다 봉인 기준점이 큰
 * 대화(뒤로 페이지 이동 후)는 통째로 제외된다 — 005 마이그레이션 헤더 참조.
 */
export async function listConversations(
  deviceId: string,
  bookId: string,
  K: number
): Promise<ConversationRow[]> {
  const result = await pool.query(
    `SELECT id, device_id, book_id, conversation_date, cutoff_page, title, created_at, updated_at
     FROM chatbot_conversation
     WHERE device_id = $1 AND book_id = $2 AND cutoff_page <= $3
     ORDER BY updated_at DESC, created_at DESC`,
    [deviceId, bookId, K]
  );
  return result.rows;
}

/**
 * 대화 삭제(2026-08-25, 사용자 요청). device_id·book_id까지 같이 걸어 소유자 확인을
 * 겸한다 — 다른 디바이스의 conversationId를 넣어도 지워지지 않는다. turn들은
 * ON DELETE CASCADE(005 마이그레이션)로 같이 지워진다.
 *
 * 봉인(cutoff_page) 여부는 확인하지 않는다 — 그 규칙은 "아직 안 읽은 내용을 보여줄지"를
 * 가리는 노출 제어용이지 삭제 권한과는 무관하다. 삭제는 새 정보를 노출하지 않는다.
 */
export async function deleteConversation(
  deviceId: string,
  bookId: string,
  conversationId: number
): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM chatbot_conversation WHERE id = $1 AND device_id = $2 AND book_id = $3`,
    [conversationId, deviceId, bookId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function listTurns(conversationId: number): Promise<ConversationTurnRow[]> {
  const result = await pool.query(
    `SELECT id, conversation_id, turn_no, role, text, cutoff_page, created_at
     FROM chatbot_conversation_turn
     WHERE conversation_id = $1
     ORDER BY turn_no ASC`,
    [conversationId]
  );
  return result.rows;
}

/**
 * 맥락 재사용용 조회 — cutoff_page <= K 인 turn만 돌려준다.
 *
 * 대화를 이어가는 도중 사용자가 뒤로 페이지를 이동하면(resolveConversation은 이 경우를
 * 막지 않는다) 그보다 큰 K에서 생성된 예전 turn이 있을 수 있다. 그 turn을 다음 질문의
 * 프롬프트 맥락에 섞으면 현재 기준점을 넘는 내용이 새어 들어간다 — 그래서 listTurns(표시용)
 * 와 분리했다. 이 필터는 FR-QNA-006 계열과 같은 패턴(데이터 선택 단계의 K 필터)이다.
 */
export async function listTurnsForContext(
  conversationId: number,
  K: number
): Promise<ConversationTurnRow[]> {
  const result = await pool.query(
    `SELECT id, conversation_id, turn_no, role, text, cutoff_page, created_at
     FROM chatbot_conversation_turn
     WHERE conversation_id = $1 AND cutoff_page <= $2
     ORDER BY turn_no ASC`,
    [conversationId, K]
  );
  return result.rows;
}
