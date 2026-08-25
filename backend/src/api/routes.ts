/**
 * API 라우트
 *
 * R1, R2, R3, R4의 모든 엔드포인트
 *
 * @see API_CONTRACT.md
 */

import express, { Request, Response } from 'express';
import { checkRateLimit } from '../modules/llm-gateway/rate-limiter';
import { handleQuery as handleChatbotQuery } from '../modules/chatbot/service';
import {
  resolveConversation,
  listConversations as listChatConversations,
  getConversationDetail as getChatConversationDetail,
  deleteConversation as deleteChatConversation,
  parseConversationId,
} from '../modules/chatbot/conversation-service';
import { pool } from '../config/database';
import { createReadingStateServices } from '../modules/reading-state/composition';
import { BookNotReadyError } from '../modules/reading-state/session.service';
import { createContentServices } from '../modules/content/composition';
import { createSsabiServices } from '../modules/ssabi/composition';
import { ensureBookReady } from './book-ready.guard';
import { mockGetCutoffSnapshot } from '../modules/chatbot/__mocks__/mock-data';

const router = express.Router();
const MOCK_MODE = process.env.MOCK_MODE === 'true';

// R2 서비스 조립 — Postgres 어댑터를 통해 진도·세션·리캡을 다룬다 (composition.ts)
const readingState = createReadingStateServices(pool);
// R1 콘텐츠 조회 서비스 조립 — Round 1 전체의 선행(가드·ssabi 조립이 이 인스턴스를 참조한다)
const contentServices = createContentServices(pool, readingState);
// R3 싸비 조회 서비스 조립 — 관계도·인물 상세 (G1: 모든 메서드가 cutoff 인자)
const ssabiServices = createSsabiServices(pool);

function requireDeviceId(req: Request, res: Response): string | null {
  const deviceId = req.headers['x-device-id'] as string | undefined;
  if (!deviceId) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'X-Device-Id header is required' });
    return null;
  }
  return deviceId;
}

/**
 * Health Check
 */
router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================================================
// R3 제공 API - 챗봇
// ============================================================================

/**
 * POST /books/:bookId/chat
 *
 * 챗봇 질의 (SSE 스트리밍)
 *
 * SSE 프레임 형식 (R4 요청 - delta/done/error 통일):
 * - delta: data: {"type":"delta","text":"chunk"}\n\n
 * - done:  data: {"type":"done"}\n\n
 * - error: data: {"type":"error","message":"..."}\n\n
 *
 * @see API_CONTRACT.md - R3 제공 API
 */
router.post('/books/:bookId/chat', async (req: Request, res: Response) => {
  const { bookId } = req.params;
  const { query, quote, page, seq, conversationId: requestedConversationId } = req.body;
  const deviceId = req.headers['x-device-id'] as string;

  // 입력 검증
  if (!query || typeof query !== 'string') {
    return res.status(400).json({
      error: 'BAD_REQUEST',
      message: 'query is required',
    });
  }

  if (!deviceId) {
    return res.status(400).json({
      error: 'BAD_REQUEST',
      message: 'X-Device-Id header is required',
    });
  }

  try {
    // Rate Limit 체크 - SSE 열기 전에 (R4 요청)
    // NFR-AI-017, A1: 디바이스·도서당 분당 3회
    const rateLimitCheck = checkRateLimit(deviceId, bookId);
    if (!rateLimitCheck.allowed) {
      return res.status(429).json({
        error: 'RATE_LIMIT',
        message: '디바이스·도서당 분당 3회 제한을 초과했습니다',
        retry_after: rateLimitCheck.retryAfter,
      });
    }

    // 기준점 스냅샷 가져오기
    let K: number;
    // 대화 이력 기록 대상 — MOCK_MODE는 DB 없이 도는 화면 개발 경로라 이력 기록을 생략한다
    let conversationId: number | undefined;
    // 지금 보고 있는 페이지 본문 (2026-08-24, 사용자 요청) — K로 자르는 근거 조립과
    // 무관하게, 화면에 이미 떠 있는(R3: 본문 접근 무제한) 현재 페이지 전체를 매 질문마다
    // 자동으로 근거에 얹는다. 페이지 번호는 snapshot.current_page — 기준점 결정기가 확인한
    // 값이지 클라이언트가 보낸 page를 쓰지 않는다(절대 규칙 8번, 파생값 단일 원천).
    let currentPageText: { pageNo: number; content: string } | undefined;

    if (MOCK_MODE) {
      // Mock 모드: 테스트용 고정 K 값
      const mockSnapshot = await mockGetCutoffSnapshot(deviceId, bookId);
      K = mockSnapshot.cutoff;
      console.log('[Mock] Using mock cutoff:', K);
    } else {
      // 진도 이벤트 동봉 처리 (R4 요청)
      // 페이지 넘기고 바로 물으면 반영돼야 함
      // ⚠️ 호출 순서: recordProgressEvent → getCutoffSnapshot (R2 답신)
      if (typeof page === 'number' && typeof seq === 'number') {
        await readingState.progressService.acceptProgressEvent(deviceId, bookId, { page, seq });
      }
      await readingState.sessionService.touchActivity(deviceId, bookId);

      // 기준점 스냅샷 가져오기 (R2 연동)
      // UC-27 A5: 질의 시점 고정, 스트리밍 중 페이지 변경해도 시작 시점 K 유지
      // FR-PRG-003 🚦: 기준점 = current_page - 1
      const snapshot = await readingState.cutoffService.getCutoffSnapshot(deviceId, bookId);
      K = snapshot.cutoff;

      try {
        const pageRow = await contentServices.pageService.getPage(bookId, snapshot.current_page);
        if (pageRow) currentPageText = { pageNo: pageRow.page_no, content: pageRow.content };
      } catch (error) {
        // 실패해도 챗봇 응답 자체는 막지 않는다 — 이 섹션 없이 기존 K-bounded 근거로만 답한다
        console.error('[API] current page fetch for chat context failed', { bookId, error });
      }

      // 대화 이력 — 이어갈지/새로 열지는 여기서 정한다 (하루 롤오버·"새 채팅" 모두 이 경로)
      // conversationId는 문자열로 왕복할 수 있다 — parseConversationId 주석 참고.
      const resolved = await resolveConversation(
        deviceId,
        bookId,
        K,
        parseConversationId(requestedConversationId)
      );
      conversationId = resolved.conversationId;
    }

    // SSE 스트리밍 설정 (NFR-PERF-008)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Nginx 버퍼링 비활성화

    // 챗봇 처리 (스트리밍)
    try {
      const quoteText = typeof quote === 'string' && quote.trim() ? quote : undefined;
      for await (const chunk of handleChatbotQuery(
        bookId,
        query,
        K,
        deviceId,
        conversationId,
        quoteText,
        currentPageText
      )) {
        // SSE 프레임 통일 (R4 요청 - delta/done/error)
        // 근거 부재 거절도 일반 delta로 흘려보냄
        res.write(`data: ${JSON.stringify({ type: 'delta', text: chunk })}\n\n`);
      }

      // 스트림 정상 종료 (applied_cutoff 포함 - R4 요청, NFR-OBS-003 🚦)
      // conversation_id — 프론트가 다음 질문부터 이 대화에 이어붙이도록 돌려준다
      res.write(
        `data: ${JSON.stringify({ type: 'done', applied_cutoff: K, conversation_id: conversationId })}\n\n`
      );
      return res.end();
    } catch (streamError) {
      console.error('[API] Chatbot stream error', { bookId, query, error: streamError });
      // 에러도 통일된 형식으로
      res.write(
        `data: ${JSON.stringify({
          type: 'error',
          message: 'Stream processing failed',
        })}\n\n`
      );
      return res.end();
    }
  } catch (error) {
    console.error('[API] Chatbot error', { bookId, query, error });
    // SSE 열기 전 에러는 일반 JSON 응답
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  }
});

/**
 * GET /books/:bookId/chat/conversations
 *
 * 대화 이력 목록. 봉인 기준점이 현재 K를 넘는 대화(뒤로 페이지 이동 후)는 빠진다
 * (005 마이그레이션 헤더의 결정, 2026-08-24 사용자·R2 조율).
 */
router.get('/books/:bookId/chat/conversations', async (req: Request, res: Response) => {
  const { bookId } = req.params;
  const deviceId = requireDeviceId(req, res);
  if (!deviceId) return;

  try {
    const snapshot = await readingState.cutoffService.getCutoffSnapshot(deviceId, bookId);
    const conversations = await listChatConversations(deviceId, bookId, snapshot.cutoff);
    return res.json(conversations);
  } catch (error) {
    console.error('[API] Conversation list error', { bookId, error });
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

/**
 * GET /books/:bookId/chat/conversations/:conversationId
 *
 * 대화 상세(전체 문답). 존재하지 않는 것과 봉인되어 숨겨진 것을 구분하지 않고
 * 둘 다 404로 응답한다 — 어느 쪽이었는지 알려주는 것 자체가 우회 신호가 될 수 있어서다.
 */
router.get(
  '/books/:bookId/chat/conversations/:conversationId',
  async (req: Request, res: Response) => {
    const { bookId, conversationId } = req.params;
    const deviceId = requireDeviceId(req, res);
    if (!deviceId) return;

    const numericId = Number(conversationId);
    if (!Number.isInteger(numericId)) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'invalid conversationId' });
    }

    try {
      const snapshot = await readingState.cutoffService.getCutoffSnapshot(deviceId, bookId);
      const detail = await getChatConversationDetail(deviceId, bookId, numericId, snapshot.cutoff);
      if (!detail) {
        return res.status(404).json({ error: 'NOT_FOUND', message: 'conversation not found' });
      }
      return res.json(detail);
    } catch (error) {
      console.error('[API] Conversation detail error', { bookId, conversationId, error });
      return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
    }
  }
);

/**
 * DELETE /books/:bookId/chat/conversations/:conversationId (2026-08-25, 사용자 요청)
 *
 * device_id·book_id가 다르면 삭제되지 않는다(소유자 확인). 목록 조회의 봉인 규칙과
 * 달리 여기선 cutoff_page를 확인하지 않는다 — 삭제는 새 정보를 노출하지 않으므로
 * 절대 규칙 7번과 무관하다.
 */
router.delete(
  '/books/:bookId/chat/conversations/:conversationId',
  async (req: Request, res: Response) => {
    const { bookId, conversationId } = req.params;
    const deviceId = requireDeviceId(req, res);
    if (!deviceId) return;

    const numericId = Number(conversationId);
    if (!Number.isInteger(numericId)) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'invalid conversationId' });
    }

    try {
      const deleted = await deleteChatConversation(deviceId, bookId, numericId);
      if (!deleted) {
        return res.status(404).json({ error: 'NOT_FOUND', message: 'conversation not found' });
      }
      return res.status(204).send();
    } catch (error) {
      console.error('[API] Conversation delete error', { bookId, conversationId, error });
      return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
    }
  }
);

// ============================================================================
// R2 제공 API - 독서 상태 + 리캡
// ============================================================================

/**
 * POST /books/:bookId/entry
 *
 * 진입 판정 — 세션 30분 규칙을 서버가 last_activity_at에서 직접 평가한다(FR-BRF-001 AC).
 * 미완비 도서는 403 BOOK_NOT_READY로 거절한다(FR-BRW-002 🚦).
 *
 * @see dev-spec-R2-core.md S3
 */
router.post('/books/:bookId/entry', async (req: Request, res: Response) => {
  const { bookId } = req.params;
  const deviceId = requireDeviceId(req, res);
  if (!deviceId) return;

  try {
    const decision = await readingState.sessionService.decideEntry(deviceId, bookId);
    res.json({
      route: decision.route,
      page: decision.page,
      is_new_session: decision.is_new_session,
      session_epoch: decision.session_epoch,
    });
  } catch (error) {
    if (error instanceof BookNotReadyError) {
      res
        .status(403)
        .json({ error: 'BOOK_NOT_READY', message: '미완비 도서는 진입할 수 없습니다' });
      return;
    }
    console.error('[API] entry error', { bookId, error });
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

/**
 * POST /books/:bookId/progress
 *
 * 진도 이벤트 — 더 새로운 seq일 때만 수용한다(FR-PRG-002). 수신 즉시 동기 커밋하고
 * (NFR-REL-007), 세션 활성 시각을 함께 갱신한다(A2 — 조작 이벤트 4종 중 하나).
 *
 * applied_cutoff — 커밋 직후의 기준점 결정기 값을 그대로 실어 준다(2026-08-24, 사용자
 * 요청: "Np까지 확인" 배지를 리캡·챗봇을 열지 않아도 페이지 넘길 때마다 갱신하고 싶음).
 * 프론트는 이 값을 계산하지 않고 받은 그대로 쓴다 — 절대 규칙 2번은 그대로 지킨다.
 * fire-and-forget 성격(NFR-PERF-005)은 그대로 유지된다 — 프론트가 이 응답을 기다려야
 * 페이지가 넘어가는 게 아니라, 넘어간 뒤 배지만 뒤늦게 갱신하는 용도로 쓴다.
 *
 * @see dev-spec-R2-core.md S2
 */
router.post('/books/:bookId/progress', async (req: Request, res: Response) => {
  const { bookId } = req.params;
  const deviceId = requireDeviceId(req, res);
  if (!deviceId) return;

  const { page, seq } = req.body;
  if (typeof page !== 'number' || typeof seq !== 'number') {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'page, seq는 숫자여야 합니다' });
    return;
  }

  try {
    await readingState.progressService.acceptProgressEvent(deviceId, bookId, { page, seq });
    await readingState.sessionService.touchActivity(deviceId, bookId);
    const snapshot = await readingState.cutoffService.getCutoffSnapshot(deviceId, bookId);
    res.json({ success: true, applied_cutoff: snapshot.cutoff });
  } catch (error) {
    console.error('[API] progress error', { bookId, error });
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

/**
 * POST /books/:bookId/heartbeat
 *
 * 화면 가시 상태의 5분 주기 하트비트. last_activity_at만 갱신하고 진도·기준점에는
 * 관여하지 않는다(A2).
 *
 * @see dev-spec-R2-core.md S3
 */
router.post('/books/:bookId/heartbeat', async (req: Request, res: Response) => {
  const { bookId } = req.params;
  const deviceId = requireDeviceId(req, res);
  if (!deviceId) return;

  try {
    await readingState.sessionService.acceptHeartbeat(deviceId, bookId);
    res.json({ success: true });
  } catch (error) {
    console.error('[API] heartbeat error', { bookId, error });
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

/**
 * GET /books/:bookId/briefing
 *
 * 브리핑 조회 — 저장 리캡(기준점 일치 검증) + 목차 위치 + 진도 파생값. 첫 진입
 * (applied_cutoff === 0)은 폴백 대상이 아니다(❓Q1).
 *
 * @see dev-spec-R2-core.md S6
 */
router.get('/books/:bookId/briefing', async (req: Request, res: Response) => {
  const { bookId } = req.params;
  const deviceId = requireDeviceId(req, res);
  if (!deviceId) return;

  try {
    const briefing = await readingState.briefingService.getBriefing(deviceId, bookId);
    res.json(briefing);
  } catch (error) {
    console.error('[API] briefing error', { bookId, error });
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

/**
 * POST /books/:bookId/recap/stream
 *
 * 리캡 스트리밍 (SSE) — 재사용 판정(저장 리캡 일치 → R8, 세션 캐시 적중 → UC-09 A7)을
 * 서버가 수행해 재사용 시 LLM 호출 0회. SSE 프레임은 R3와 통일한 delta/done/error
 * 형식을 쓰고, done 프레임에 applied_cutoff를 싣는다(R4 CP0 회신 항목 3).
 *
 * @see dev-spec-R2-core.md S5
 */
router.post('/books/:bookId/recap/stream', async (req: Request, res: Response) => {
  const { bookId } = req.params;
  const deviceId = requireDeviceId(req, res);
  if (!deviceId) return;

  const { page, seq } = req.body ?? {};

  try {
    if (typeof page === 'number' && typeof seq === 'number') {
      // 3.3절 — 조회 요청에 동봉된 (page, seq)는 진도 이벤트와 동일하게 처리한다
      await readingState.progressService.acceptProgressEvent(deviceId, bookId, { page, seq });
    }
    await readingState.sessionService.touchActivity(deviceId, bookId); // A2 — 리캡 요청도 조작 이벤트

    // 요청당 스냅샷 1회 (2.1절) — 스트리밍 도중 페이지가 바뀌어도 이 K를 유지한다(UC-27 A5)
    const snapshot = await readingState.cutoffService.getCutoffSnapshot(deviceId, bookId);
    const result = await readingState.recapService.getRecap(
      deviceId,
      bookId,
      snapshot.cutoff,
      'realtime'
    );

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    if (result.kind === 'empty') {
      // ❓Q1 — K=0. 생성 대상 자체가 없다. 클라이언트가 빈 상태 문구를 렌더한다
      res.write(`data: ${JSON.stringify({ type: 'done', applied_cutoff: snapshot.cutoff })}\n\n`);
      res.end();
      return;
    }

    if (result.kind === 'reused') {
      // 저장 리캡·세션 캐시 재사용 — LLM 호출 0회, 완성된 텍스트를 단일 delta로 흘린다
      res.write(`data: ${JSON.stringify({ type: 'delta', text: result.text })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'done', applied_cutoff: snapshot.cutoff })}\n\n`);
      res.end();
      return;
    }

    try {
      for await (const chunk of result.chunks) {
        res.write(`data: ${JSON.stringify({ type: 'delta', text: chunk })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ type: 'done', applied_cutoff: snapshot.cutoff })}\n\n`);
      res.end();
    } catch (streamError) {
      console.error('[API] recap stream error', { bookId, error: streamError });
      res.write(
        `data: ${JSON.stringify({ type: 'error', message: 'Stream processing failed' })}\n\n`
      );
      res.end();
    }
  } catch (error) {
    console.error('[API] recap error', { bookId, error });
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

// ============================================================================
// R4 제공 API - 조회
// ============================================================================

/**
 * GET /books
 *
 * 카탈로그 조회 — FR-BRW-001, FR-BRW-002 🚦, FR-BRF-005 🚦 (R4)
 *
 * 미완비 도서도 목록에 담는다 — 대시보드가 표지를 띄우고 잠그려면 목록에 있어야 한다.
 * 그래서 이 핸들러에는 ensureBookReady 를 걸지 않는다. 차단은 개별 도서 조회에서 한다.
 */
router.get('/books', async (req: Request, res: Response) => {
  // 읽던 도서 판정에 디바이스가 필요하다 (진도는 디바이스별로 저장된다)
  const deviceId = requireDeviceId(req, res);
  if (!deviceId) return;

  try {
    return res.json(await contentServices.catalogService.getCatalog(deviceId));
  } catch (error) {
    console.error('[API] Catalog error', { error });
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

/**
 * GET /books/:bookId/info
 *
 * 책 정보 (i 팝업) — FR-BRW-003, FR-NAV-001, R5 (R1)
 */
router.get('/books/:bookId/info', async (req: Request, res: Response) => {
  const { bookId } = req.params;

  try {
    // FR-BRW-002 🚦 — UI 차단만으로는 부족하다. API를 직접 호출해도 서버가 거절한다
    if (!(await ensureBookReady(contentServices.content, bookId, res))) return;

    const info = await contentServices.bookInfoService.getInfo(bookId);
    if (info === null) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Book not found' });
    }
    return res.json(info);
  } catch (error) {
    console.error('[API] Book info error', { bookId, error });
    // 조립 실패는 5xx — 부분 응답을 내지 않는다 (team-sync §4.2, R11)
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

/**
 * GET /books/:bookId/pages/:pageNo
 *
 * 본문 페이지 단건 — FR-PRG-001, R3 (R4)
 *
 * 진도를 받지 않는다. (page, seq)를 동봉받지 않으므로 프리페치가 기준점을 밀 수 없다
 * (team-sync §1.1·§4.3). 진도는 POST /books/{b}/progress 하나로만 올라간다.
 * 본문 접근 자체는 상한 대상이 아니다 (R3, FR-SPL-001).
 */
router.get('/books/:bookId/pages/:pageNo', async (req: Request, res: Response) => {
  const { bookId } = req.params;
  const pageNo = Number(req.params.pageNo);

  // 페이지 번호는 1-based 정수 (API_CONTRACT.md 공통 규칙)
  if (!Number.isInteger(pageNo) || pageNo < 1) {
    return res
      .status(400)
      .json({ error: 'BAD_REQUEST', message: 'pageNo must be a positive integer' });
  }

  try {
    // FR-BRW-002 🚦 — UI 차단만으로는 부족하다. API를 직접 호출해도 서버가 거절한다
    if (!(await ensureBookReady(contentServices.content, bookId, res))) return;

    const page = await contentServices.pageService.getPage(bookId, pageNo);
    if (page === null) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Page not found' });
    }
    return res.json(page);
  } catch (error) {
    console.error('[API] Page error', { bookId, pageNo, error });
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

/**
 * GET /books/:bookId/ssabi/graph
 *
 * 관계도 JSON (R3, Task 7)
 *
 * FR-SPL-002 🚦: cutoff 기준 필터링
 * A6: 관계는 최신 라벨만 표시
 *
 * ⚠️ 버그 수정(2026-08-25, 사용자 제보 — 관계도 탭을 켜둔 채 페이지를 계속 넘겨도
 *    화면이 갱신되지 않음) — 이 라우트가 프론트가 동봉하는 (page, seq)를 그동안
 *    완전히 무시하고 DB에 저장된 진도(reading_position.current_page)만 봤다. 그
 *    저장은 별도 POST /progress 요청이 하는데, 두 요청은 서로 다른 HTTP 왕복이라
 *    순서가 보장되지 않는다 — 방금 넘긴 페이지의 progress 쓰기가 아직 커밋되기
 *    전에 이 조회가 먼저 도착하면 옛 K로 응답했다. recap/stream 라우트(3.3절,
 *    00-shared §2.5)와 같은 패턴으로 고쳤다 — 동봉된 (page, seq)를 진도 이벤트와
 *    동일하게 먼저 반영한 뒤 스냅샷을 뜬다. ssabiService.ts의 프론트 주석·mock
 *    서버(mockGraphResponse)는 이미 이 처리를 전제하고 있었다 — 실 라우트만 빠져
 *    있었다.
 */
router.get('/books/:bookId/ssabi/graph', async (req: Request, res: Response) => {
  const { bookId } = req.params;
  const deviceId = requireDeviceId(req, res);
  if (!deviceId) return;

  // FR-BRW-002 🚦: 미완비 도서 거절
  const isReady = await ensureBookReady(contentServices.content, bookId, res);
  if (!isReady) return;

  try {
    const page = Number(req.query.page);
    const seq = Number(req.query.seq);
    if (Number.isFinite(page) && Number.isFinite(seq)) {
      // 3.3절 — 조회 요청에 동봉된 (page, seq)는 진도 이벤트와 동일하게 처리한다
      await readingState.progressService.acceptProgressEvent(deviceId, bookId, { page, seq });
    }
    await readingState.sessionService.touchActivity(deviceId, bookId); // A2 — 조회도 조작 이벤트

    // 기준점 스냅샷 가져오기 (R2 연동) — 방금 반영한 진도 기준으로 최신 K를 얻는다
    const snapshot = await readingState.cutoffService.getCutoffSnapshot(deviceId, bookId);
    const K = snapshot.cutoff;

    // 관계도 조회 (FR-SPL-002 🚦: cutoff 적용)
    const graph = await ssabiServices.graph.getGraph(bookId, K);

    res.json(graph);
  } catch (error) {
    console.error('[API] ssabi/graph error', { bookId, error });
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  }
});

/**
 * GET /books/:bookId/ssabi/characters/:characterId
 *
 * 인물 상세
 *
 * ⚠️ /ssabi/graph와 같은 이유로 (page, seq) 처리를 추가했다(2026-08-25, 사용자 제보 —
 *    관계도 참조).
 */
router.get('/books/:bookId/ssabi/characters/:characterId', async (req: Request, res: Response) => {
  const { bookId, characterId } = req.params;
  const deviceId = requireDeviceId(req, res);
  if (!deviceId) return;

  // FR-BRW-002 🚦: 미완비 도서 거절
  if (!(await ensureBookReady(contentServices.content, bookId, res))) return;

  try {
    const page = Number(req.query.page);
    const seq = Number(req.query.seq);
    if (Number.isFinite(page) && Number.isFinite(seq)) {
      // 3.3절 — 조회 요청에 동봉된 (page, seq)는 진도 이벤트와 동일하게 처리한다
      await readingState.progressService.acceptProgressEvent(deviceId, bookId, { page, seq });
    }
    await readingState.sessionService.touchActivity(deviceId, bookId); // A2 — 조회도 조작 이벤트

    // 기준점 스냅샷 1회 (00-shared §2.1) — 요청 내 모든 조회가 같은 K 를 쓴다
    const snapshot = await readingState.cutoffService.getCutoffSnapshot(deviceId, bookId);

    const detail = await ssabiServices.character.getCharacter(bookId, characterId, snapshot.cutoff);

    // 기준점 이하에서 아직 등장하지 않은 인물은 "없는 인물"과 같게 응답한다.
    // 이유를 구분해 알리면 그 차이가 곧 미등장 인물의 존재를 알려준다 (절대 규칙 7번)
    if (detail === null) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Character not found' });
    }
    return res.json(detail);
  } catch (error) {
    console.error('[API] ssabi/characters error', { bookId, characterId, error });
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

export default router;
