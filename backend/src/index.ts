/**
 * 싸비 Backend 진입점
 *
 * Express 앱 초기화 및 서버 실행
 */

import express from 'express';
import dotenv from 'dotenv';
import routes from './api/routes';

// 환경 변수 로드
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// 미들웨어
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS (개발용)
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-Device-Id');

  if (_req.method === 'OPTIONS') {
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
  console.log(`
┌─────────────────────────────────────────┐
│  싸비 (Reading Recap) Backend          │
│  Port: ${PORT}                           │
│  Environment: ${process.env.NODE_ENV || 'development'}             │
│  Node: ${process.version}                      │
└─────────────────────────────────────────┘

API Endpoints:
  GET  /health
  POST /books/:bookId/chat  (R3 ✅)

  R2 endpoints: /entry, /progress, /briefing, /recap/stream
  R4 endpoints: /books, /pages, /ssabi/graph

Ready for requests!
  `);
});

export default app;
