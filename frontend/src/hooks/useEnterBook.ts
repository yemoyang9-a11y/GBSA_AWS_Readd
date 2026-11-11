import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { enterBook } from '../services/progressService';
import { routePathFor } from '../utils/routes';

interface EnterState {
  locationKey: string;
  busyId: string | null;
  failed: boolean;
}

// FR-BRF-001 FR-SPL-005
export function useEnterBook(): {
  enter: (bookId: string) => Promise<void>;
  busyId: string | null;
  failed: boolean;
} {
  const navigate = useNavigate();
  const { key: locationKey } = useLocation();
  const [state, setState] = useState<EnterState | null>(null);
  const latestRequest = useRef(0);
  const pendingBookId = useRef<string | null>(null);

  useEffect(
    () => () => {
      latestRequest.current += 1;
      pendingBookId.current = null;
    },
    [locationKey]
  );

  const enter = useCallback(
    async (bookId: string) => {
      if (pendingBookId.current === bookId) return;
      const request = ++latestRequest.current;
      pendingBookId.current = bookId;
      setState({ locationKey, busyId: bookId, failed: false });
      try {
        const entry = await enterBook(bookId);
        if (request !== latestRequest.current) return;
        navigate(routePathFor(bookId, entry), { viewTransition: true });
      } catch {
        if (request !== latestRequest.current) return;
        pendingBookId.current = null;
        setState({ locationKey, busyId: null, failed: true });
      }
    },
    [navigate, locationKey]
  );

  const current = state?.locationKey === locationKey ? state : null;
  return { enter, busyId: current?.busyId ?? null, failed: current?.failed ?? false };
}
