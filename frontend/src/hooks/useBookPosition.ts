import { useEffect, useState } from 'react';
import { fetchPosition, type PositionResponse } from '../services/positionService';

// FR-SPL-002 FR-SPL-005
export function useBookPosition(bookId: string, enabled: boolean): PositionResponse | null {
  const [loaded, setLoaded] = useState<{ bookId: string; position: PositionResponse } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    fetchPosition(bookId)
      .then((position) => {
        if (active) setLoaded({ bookId, position });
      })
      .catch(() => {
        if (active) setLoaded(null);
      });
    return () => {
      active = false;
    };
  }, [bookId, enabled]);

  return enabled && loaded?.bookId === bookId ? loaded.position : null;
}
