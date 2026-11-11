import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { enterBook } from '../services/progressService';
import { clearPendingJump, setPendingJump, takePendingJump } from '../utils/pendingJump';
import { routePathFor } from '../utils/routes';

interface EnterState {
  locationKey: string;
  busyId: string | null;
  failed: boolean;
}

// FR-PRG-003
function keepPendingJumpOnlyFor(bookId: string): void {
  const page = takePendingJump(bookId);
  if (page !== null) setPendingJump(bookId, page);
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
  const navigatedRequest = useRef(0);
  const pendingBookId = useRef<string | null>(null);

  useEffect(
    () => () => {
      // FR-PRG-003
      if (pendingBookId.current !== null && navigatedRequest.current !== latestRequest.current) {
        clearPendingJump();
      }
      latestRequest.current += 1;
      pendingBookId.current = null;
    },
    [locationKey]
  );

  const enter = useCallback(
    async (bookId: string) => {
      if (pendingBookId.current === bookId) return;
      // FR-PRG-003
      if (pendingBookId.current !== null) keepPendingJumpOnlyFor(bookId);
      const request = ++latestRequest.current;
      pendingBookId.current = bookId;
      setState({ locationKey, busyId: bookId, failed: false });
      try {
        const entry = await enterBook(bookId);
        if (request !== latestRequest.current) return;
        navigatedRequest.current = request;
        navigate(routePathFor(bookId, entry), { viewTransition: true });
      } catch {
        if (request !== latestRequest.current) return;
        pendingBookId.current = null;
        clearPendingJump();
        setState({ locationKey, busyId: null, failed: true });
      }
    },
    [navigate, locationKey]
  );

  const current = state?.locationKey === locationKey ? state : null;
  return { enter, busyId: current?.busyId ?? null, failed: current?.failed ?? false };
}
