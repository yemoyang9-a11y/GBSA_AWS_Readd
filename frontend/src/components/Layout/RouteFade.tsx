import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

// NFR-USE
export default function RouteFade({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <div key={pathname} data-testid="route-fade" className="motion-safe:animate-route-in">
      {children}
    </div>
  );
}
