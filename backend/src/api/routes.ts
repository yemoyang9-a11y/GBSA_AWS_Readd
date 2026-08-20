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

const router = express.Router();

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
    // ⚠️ 호출 순서: recordProgressEvent → getCutoffSnapshot (R2 답신)
    if (page && seq) {
      // TODO: R2 연동 - await recordProgressEvent(deviceId, bookId, { page, seq });
      // 반환값은 기다리지 않음 (fire-and-forget, NFR-PERF-005)
      console.log('[API] Progress event with chatbot', { deviceId, bookId, page, seq });
    }

    // 기준점 스냅샷 가져오기 (R2 연동)
    // UC-27 A5: 질의 시점 고정, 스트리밍 중 페이지 변경해도 시작 시점 K 유지
    // TODO: const snapshot = await getCutoffSnapshot(deviceId, bookId);
    // TODO: const K = snapshot.cutoff;
    // getCutoffSnapshot은 비동기 (R2 통지 ①)

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

      // 스트림 정상 종료 (applied_cutoff 포함 - R4 요청, NFR-OBS-003 🚦)
      res.write(`data: ${JSON.stringify({ type: 'done', applied_cutoff: K })}\n\n`);
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
 * 진입 판정
 *
 * TODO: R2 구현
 */
router.post('/books/:bookId/entry', (req: Request, res: Response) => {
  res.status(501).json({ error: 'NOT_IMPLEMENTED', message: 'R2 담당' });
});

/**
 * POST /books/:bookId/progress
 *
 * 진도 이벤트
 *
 * TODO: R2 구현
 */
router.post('/books/:bookId/progress', (req: Request, res: Response) => {
  res.status(501).json({ error: 'NOT_IMPLEMENTED', message: 'R2 담당' });
});

/**
 * POST /books/:bookId/heartbeat
 *
 * 하트비트
 *
 * TODO: R2 구현
 */
router.post('/books/:bookId/heartbeat', (req: Request, res: Response) => {
  res.status(501).json({ error: 'NOT_IMPLEMENTED', message: 'R2 담당' });
});

/**
 * GET /books/:bookId/briefing
 *
 * 브리핑 조회
 *
 * TODO: R2 구현
 */
router.get('/books/:bookId/briefing', (req: Request, res: Response) => {
  res.status(501).json({ error: 'NOT_IMPLEMENTED', message: 'R2 담당' });
});

/**
 * POST /books/:bookId/recap/stream
 *
 * 리캡 스트리밍
 *
 * TODO: R2 구현
 */
router.post('/books/:bookId/recap/stream', (req: Request, res: Response) => {
  res.status(501).json({ error: 'NOT_IMPLEMENTED', message: 'R2 담당' });
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
