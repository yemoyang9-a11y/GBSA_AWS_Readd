import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { enterBook } from '../services/progressService';
import { routePathFor } from '../utils/routes';

// FR-BRF-001 FR-SPL-005
export function useEnterBook(): {
  enter: (bookId: string) => Promise<void>;
  busyId: string | null;
  failed: boolean;
} {
  const navigate = useNavigate();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);

  const enter = useCallback(
    async (bookId: string) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusyId(bookId);
      setFailed(false);
      try {
        const entry = await enterBook(bookId);
        navigate(routePathFor(bookId, entry), { viewTransition: true });
      } catch {
        inFlight.current = false;
        setBusyId(null);
        setFailed(true);
      }
    },
    [navigate]
  );

  return { enter, busyId, failed };
}
