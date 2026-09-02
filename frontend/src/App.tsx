import { useState } from 'react';
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
export function createAppRouter() {
  return createBrowserRouter([
    { path: '/', element: <Dashboard /> },
    { path: BOOK_ROUTES.briefing, element: <Briefing /> },
    { path: BOOK_ROUTES.reader, element: <Reader /> },
    { path: '*', element: <NotFound /> },
  ]);
}

export default function App() {
  /**
   * ⚠️ 라우터를 모듈 최상위에서 만들면 안 된다 (2026-09-02 수정).
   *
   * `createBrowserRouter` 는 생성 시점의 `window.location` 으로 **자기 history 를
   * 초기화하고 그 뒤로는 다시 읽지 않는다.** 모듈 최상위에 두면 파일 로드 때 딱 한 번
   * 만들어져 인스턴스가 공유되므로, 테스트가 `window.history.pushState({}, '', '/')` 로
   * 주소를 되돌려도 **라우터 내부 위치는 앞 테스트가 이동한 화면에 그대로 남는다.**
   * 실제로 App 통합 테스트들이 파일의 첫 테스트만 통과하고 나머지가 전부 대시보드 대신
   * 읽기 화면에서 시작해 깨졌다.
   *
   * `<BrowserRouter>` 시절에는 매 마운트마다 `window.location` 을 읽어 이 문제가 없었다.
   * 데이터 라우터로 옮기면서(9b87d2e) 딸려 온 회귀다.
   *
   * `useState` 의 게으른 초기화로 **마운트당 한 번** 만든다 — 프로덕션에서는 App 이
   * 한 번만 마운트되므로 동작이 이전과 같고, 테스트에서는 `render()` 마다 그 시점
   * 주소에서 새로 시작한다.
   */
  const [router] = useState(createAppRouter);

  return (
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  );
}
