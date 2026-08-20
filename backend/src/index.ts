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

// CORS (개발용)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
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

// 서버 시작
app.listen(PORT, () => {
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
