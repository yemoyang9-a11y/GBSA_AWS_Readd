import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import LoginGate from './LoginGate';
import { bookPath } from '../../utils/routes';
import { getAuthToken } from '../../utils/storage';

export default function RequireLogin({ children }: { children: ReactNode }) {
  const { bookId = '' } = useParams();
  const navigate = useNavigate();

  if (getAuthToken()) return <>{children}</>;

  return (
    <div className="min-h-dvh bg-dash-paper">
      <LoginGate bookId={bookId} onClose={() => navigate(bookPath(bookId), { replace: true })} />
    </div>
  );
}
