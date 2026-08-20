import { BrowserRouter, Routes, Route } from 'react-router-dom';
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
 */
export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path={BOOK_ROUTES.briefing} element={<Briefing />} />
          <Route path={BOOK_ROUTES.reader} element={<Reader />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
