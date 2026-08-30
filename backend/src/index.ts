/**
 * 싸비 Backend 진입점
 *
 * Express 앱 초기화 및 서버 실행
 */

// 환경 변수 로드 - 다른 모듈 임포트 전에 실행 필요 (DATABASE_URL 등)
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import path from 'path';
import routes from './api/routes';

const app = express();
const PORT = process.env.PORT || 3000;

// 미들웨어
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files (테스트 페이지)
app.use('/test', express.static(path.join(__dirname, '../public')));

/**
 * CORS
 *
 * 2026-08-29 (Fly.io + Cloudflare Pages 이전) — 프론트와 백엔드가 **다른 오리진**이
 * 됐다. 예전에는 CloudFront 하나가 `/`(S3)와 `/api`(ALB)를 함께 서빙해 같은 오리진이라
 * CORS 가 사실상 무의미했고, 그래서 `*` 로 열어둔 채 "개발용"이라고만 적혀 있었다.
 * 이제는 실제로 동작하는 설정이라 오리진을 좁힌다.
 *
 * ⚠️ `CORS_ORIGIN` 은 프로덕션 `.env` 에 값이 있었는데 **코드가 읽지 않고 있었다.**
 *    SESSION_TIMEOUT_MS 와 같은 패턴이다(선언은 있는데 사용처가 없음). 이번에 실제로
 *    배선한다.
 *
 * 값이 없으면 `*` 로 둔다 — 로컬 개발(localhost:5173)과 배포 초기 설정 누락 때
 * 화면이 통째로 안 뜨는 것보다는 낫다. 다만 배포에서는 반드시 설정할 것.
 * 쉼표로 여러 오리진을 줄 수 있다(Pages 프리뷰 도메인 등).
 */
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter((o) => o.length > 0);

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (ALLOWED_ORIGINS.length === 0) {
    res.header('Access-Control-Allow-Origin', '*');
  } else if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    // 허용 목록을 쓸 때는 캐시가 오리진별로 갈리도록 알린다 — 없으면 CDN·브라우저가
    // 한 오리진의 응답을 다른 오리진에 재사용해 CORS 가 산발적으로 깨진다
    res.header('Vary', 'Origin');
  }
  // 목록이 있는데 매칭 안 되면 CORS 헤더를 아예 안 붙인다 → 브라우저가 차단한다

  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-Device-Id');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  return next();
});

// 라우트
app.use('/', routes);

// 404 핸들러
app.use((req, res) => {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// 에러 핸들러
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Server Error]', err);
  return res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
  });
});

/**
 * 서버 시작
 *
 * 0.0.0.0 을 명시한다 (2026-08-29) — Fly 는 컨테이너 **밖**에서 프록시가 들어오므로
 * 루프백에만 붙으면 요청이 도달하지 못한다. Node 기본값도 전 인터페이스지만, 컨테이너
 * 배포에서 이건 조용히 깨지는 종류의 실수라(헬스체크만 계속 실패한다) 명시해 둔다.
 */
app.listen(Number(PORT), '0.0.0.0', () => {
  const mockMode = process.env.MOCK_MODE === 'true';

  console.log(`
┌─────────────────────────────────────────┐
│  싸비 (Reading Recap) Backend          │
│  Port: ${PORT}                           │
│  Environment: ${process.env.NODE_ENV || 'development'}             │
│  Mock Mode: ${mockMode ? '✅ ENABLED' : '❌ DISABLED'}           │
│  Node: ${process.version}                      │
└─────────────────────────────────────────┘

API Endpoints:
  GET  /health
  POST /books/:bookId/chat  (R3 ✅)

  R2 endpoints: /entry, /progress, /briefing, /recap/stream
  R4 endpoints: /books, /pages, /ssabi/graph

${mockMode ? '🧪 Test Page: http://localhost:' + PORT + '/test/test-chatbot.html\n' : ''}Ready for requests!
  `);
});

export default app;
