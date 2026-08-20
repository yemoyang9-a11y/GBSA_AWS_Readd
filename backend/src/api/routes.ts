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
    // Rate Limit 체크 (NFR-AI-017, A1: 디바이스·도서당 분당 3회)
    const rateLimitCheck = checkRateLimit(deviceId, bookId);
    if (!rateLimitCheck.allowed) {
      return res.status(429).json({
        error: 'RATE_LIMIT',
        message: '디바이스·도서당 분당 3회 제한을 초과했습니다',
        retry_after: rateLimitCheck.retryAfter,
      });
    }

    // TODO: 진도 이벤트 동봉 처리 (page, seq가 있으면)
    // if (page && seq) {
    //   await updateProgress(deviceId, bookId, page, seq);
    // }

    // TODO: 기준점 스냅샷 가져오기 (R2 연동)
    // const snapshot = await getCutoffSnapshot(deviceId, bookId);
    // const K = snapshot.cutoff;

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
        res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
      }

      // 스트림 종료
      res.write('data: [DONE]\n\n');
      res.end();

    } catch (streamError) {
      console.error('[API] Chatbot stream error', { bookId, query, error: streamError });
      res.write(`data: ${JSON.stringify({ error: 'STREAM_ERROR' })}\n\n`);
      res.end();
    }

  } catch (error) {
    console.error('[API] Chatbot error', { bookId, query, error });
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
