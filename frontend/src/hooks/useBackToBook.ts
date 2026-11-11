import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isMobileDevice } from '../mobile/device';
import { bookPath } from '../utils/routes';

export function cameFromBook(state: unknown): boolean {
  return (state as { fromBook?: unknown } | null)?.fromBook === true;
}

// FR-BRW-003
export function useBackToBook(bookId: string): () => void {
  const navigate = useNavigate();
  const { state } = useLocation();
  const fromBook = cameFromBook(state);

  return useCallback(() => {
    if (fromBook) {
      navigate(-1);
      return;
    }
    navigate(
      bookPath(bookId),
      isMobileDevice(window.screen) ? { replace: true } : { replace: true, viewTransition: true }
    );
  }, [navigate, bookId, fromBook]);
}
