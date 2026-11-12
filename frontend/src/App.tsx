import { useState } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import Home from './pages/Home';
import Search from './pages/Search';
import Shelf from './pages/Shelf';
import My from './pages/My';
import BookDetail from './pages/BookDetail';
import Briefing from './pages/Briefing';
import Reader from './pages/Reader';
import NotFound from './pages/NotFound';
import AuthCallback from './pages/AuthCallback';
import MobileReader from './mobile/pages/MobileReader';
import MobileBriefing from './mobile/pages/MobileBriefing';
import MobileNotFound from './mobile/pages/MobileNotFound';
import { isMobileDevice } from './mobile/device';
import ErrorBoundary from './components/common/ErrorBoundary';
import AppShell from './components/Layout/AppShell';
import RouteFade from './components/Layout/RouteFade';
import RequireLogin from './components/Auth/RequireLogin';
import { APP_ROUTES, BOOK_ROUTES } from './utils/routes';

/**
 * 라우팅.
 * 브리핑/읽기 분기는 화면이 정하지 않는다 — POST /books/:bookId/entry 응답의 route 를 따른다
 * (FR-BRF-001, 절대 규칙 8번). 경로 패턴은 utils/routes 한 곳에서만 정의한다.
 */
export function createAppRouter(isMobile = isMobileDevice(window.screen)) {
  return createBrowserRouter([
    // NFR-USE
    {
      element: <AppShell isMobile={isMobile} />,
      children: [
        { path: APP_ROUTES.home, element: <Home /> },
        { path: APP_ROUTES.search, element: <Search /> },
        { path: APP_ROUTES.shelf, element: <Shelf /> },
        { path: APP_ROUTES.my, element: <My /> },
      ],
    },
    {
      element: <AppShell isMobile={isMobile} nav={!isMobile} />,
      children: [{ path: APP_ROUTES.book, element: <BookDetail /> }],
    },
    {
      path: BOOK_ROUTES.briefing,
      element: (
        <RequireLogin>
          <RouteFade>{isMobile ? <MobileBriefing /> : <Briefing />}</RouteFade>
        </RequireLogin>
      ),
    },
    {
      path: BOOK_ROUTES.reader,
      element: (
        <RequireLogin>
          <RouteFade>{isMobile ? <MobileReader /> : <Reader />}</RouteFade>
        </RequireLogin>
      ),
    },
    { path: '/auth/callback', element: <AuthCallback /> },
    { path: '*', element: <RouteFade>{isMobile ? <MobileNotFound /> : <NotFound />}</RouteFade> },
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
