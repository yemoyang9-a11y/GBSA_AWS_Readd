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
import { pool } from '../config/database';
import { createReadingStateServices } from '../modules/reading-state/composition';
import { BookNotReadyError } from '../modules/reading-state/session.service';

const router = express.Router();

// R2 서비스 조립 — Postgres 어댑터를 통해 진도·세션·리캡을 다룬다 (composition.ts)
const readingState = createReadingStateServices(pool);

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
router.get('/health', (req: Request, res: Response) => {
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
  const { query, page, seq } = req.body;
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

    // 진도 이벤트 동봉 처리 (R4 요청)
    // 페이지 넘기고 바로 물으면 반영돼야 함
    if (page && seq) {
      // TODO: R2 연동 - updateProgress(deviceId, bookId, page, seq);
      console.log('[API] Progress event with chatbot', { deviceId, bookId, page, seq });
    }

    // 기준점 스냅샷 가져오기 (R2 연동)
    // UC-27 A5: 질의 시점 고정, 스트리밍 중 페이지 변경해도 시작 시점 K 유지
    // TODO: const snapshot = await getCutoffSnapshot(deviceId, bookId);
    // TODO: const K = snapshot.cutoff;

    // 임시: 하드코딩된 K (R2 연동 전)
    const K = 80;

    // SSE 스트리밍 설정 (NFR-PERF-008)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Nginx 버퍼링 비활성화

    // 챗봇 처리 (스트리밍)
    try {
      for await (const chunk of handleChatbotQuery(bookId, query, K, deviceId)) {
        // SSE 프레임 통일 (R4 요청 - delta/done/error)
        // 근거 부재 거절도 일반 delta로 흘려보냄
        res.write(`data: ${JSON.stringify({ type: 'delta', text: chunk })}\n\n`);
      }

      // 스트림 정상 종료
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();

    } catch (streamError) {
      console.error('[API] Chatbot stream error', { bookId, query, error: streamError });
      // 에러도 통일된 형식으로
      res.write(`data: ${JSON.stringify({
        type: 'error',
        message: 'Stream processing failed'
      })}\n\n`);
      res.end();
    }

  } catch (error) {
    console.error('[API] Chatbot error', { bookId, query, error });
    // SSE 열기 전 에러는 일반 JSON 응답
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  }
});

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
      res.status(403).json({ error: 'BOOK_NOT_READY', message: '미완비 도서는 진입할 수 없습니다' });
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
    res.json({ success: true });
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
    const result = await readingState.recapService.getRecap(deviceId, bookId, snapshot.cutoff, 'realtime');

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
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Stream processing failed' })}\n\n`);
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
 * 카탈로그 조회
 *
 * TODO: R4 구현
 */
router.get('/books', (req: Request, res: Response) => {
  res.status(501).json({ error: 'NOT_IMPLEMENTED', message: 'R4 담당' });
});

/**
 * GET /books/:bookId/info
 *
 * 책 정보 (i 팝업)
 *
 * TODO: R4 구현
 */
router.get('/books/:bookId/info', (req: Request, res: Response) => {
  res.status(501).json({ error: 'NOT_IMPLEMENTED', message: 'R4 담당' });
});

/**
 * GET /books/:bookId/pages/:pageNo
 *
 * 본문 페이지 단건
 *
 * TODO: R4 구현
 */
router.get('/books/:bookId/pages/:pageNo', (req: Request, res: Response) => {
  res.status(501).json({ error: 'NOT_IMPLEMENTED', message: 'R4 담당' });
});

/**
 * GET /books/:bookId/ssabi/graph
 *
 * 관계도 JSON
 *
 * TODO: R4 구현
 */
router.get('/books/:bookId/ssabi/graph', (req: Request, res: Response) => {
  res.status(501).json({ error: 'NOT_IMPLEMENTED', message: 'R4 담당' });
});

/**
 * GET /books/:bookId/ssabi/characters/:characterId
 *
 * 인물 상세
 *
 * TODO: R4 구현
 */
router.get('/books/:bookId/ssabi/characters/:characterId', (req: Request, res: Response) => {
  res.status(501).json({ error: 'NOT_IMPLEMENTED', message: 'R4 담당' });
});

export default router;
