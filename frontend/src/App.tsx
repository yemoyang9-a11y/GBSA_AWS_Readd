import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Briefing from './pages/Briefing';
import Reader from './pages/Reader';
import NotFound from './pages/NotFound';
import ErrorBoundary from './components/common/ErrorBoundary';
import { BOOK_ROUTES } from './utils/routes';
import './App.css';

/**
 * 라우팅.
 * 브리핑/읽기 분기는 화면이 정하지 않는다 — POST /books/:bookId/entry 응답의 route 를 따른다
 * (FR-BRF-001, 절대 규칙 8번). 경로 패턴은 utils/routes 한 곳에서만 정의한다.
 *
 * `<BrowserRouter>`(구식 라우터) → `createBrowserRouter`+`RouterProvider`(데이터
 * 라우터)로 교체(2026-08-26, 사용자 요청 — 화면 전환을 부드럽게). navigate() 호출부에
 * `viewTransition: true`를 넣어 뒀지만(Dashboard/Briefing/Reader.tsx), 그 옵션은 데이터
 * 라우터의 `RouterProvider`에서만 실제로 `document.startViewTransition`을 호출한다 —
 * `<BrowserRouter>`에서는 조용히 무시돼서 "안 된다"는 재보고를 받고서야 발견했다.
 * 라우트 트리 구조·화면 목록은 그대로이고, JSX `<Routes>` 대신 배열로만 옮겼다.
 */
const router = createBrowserRouter([
  { path: '/', element: <Dashboard /> },
  { path: BOOK_ROUTES.briefing, element: <Briefing /> },
  { path: BOOK_ROUTES.reader, element: <Reader /> },
  { path: '*', element: <NotFound /> },
]);

export default function App() {
  return (
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  );
}
