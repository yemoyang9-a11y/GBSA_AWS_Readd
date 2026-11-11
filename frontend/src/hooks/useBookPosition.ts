import { useEffect, useState } from 'react';
import { fetchPosition, type PositionResponse } from '../services/positionService';

interface PositionRequest {
  bookId: string;
  enabled: boolean;
  generation: number;
}

// FR-SPL-002 FR-SPL-005
export function useBookPosition(bookId: string, enabled: boolean): PositionResponse | null {
  const [request, setRequest] = useState<PositionRequest>({ bookId, enabled, generation: 0 });
  const [loaded, setLoaded] = useState<{ generation: number; position: PositionResponse } | null>(null);

  let current = request;
  if (request.bookId !== bookId || request.enabled !== enabled) {
    current = { bookId, enabled, generation: request.generation + 1 };
    setRequest(current);
  }
  const { generation } = current;

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    fetchPosition(bookId)
      .then((position) => {
        if (active) setLoaded({ generation, position });
      })
      .catch(() => {
        if (active) setLoaded(null);
      });
    return () => {
      active = false;
    };
  }, [bookId, enabled, generation]);

  return enabled && loaded?.generation === generation ? loaded.position : null;
}
