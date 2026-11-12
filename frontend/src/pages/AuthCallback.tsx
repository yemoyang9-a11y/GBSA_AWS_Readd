import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ConsentForm from '../components/Auth/ConsentForm';
import { exchangeLoginCode, submitConsent } from '../services/authService';
import { enterBook } from '../services/progressService';
import { takeLoginReturn } from '../utils/loginReturn';
import { bookPath, routePathFor } from '../utils/routes';
import { clearAuthToken, setAuthToken } from '../utils/storage';

type Phase = { kind: 'working' } | { kind: 'consent'; returnBookId: string | null };

export default function AuthCallback() {
  const navigate = useNavigate();
  const started = useRef(false);
  const [phase, setPhase] = useState<Phase>({ kind: 'working' });

  function leave(returnBookId: string | null) {
    navigate(returnBookId ? bookPath(returnBookId) : '/my', { replace: true });
  }

  // FR-BRF-001
  function proceed(returnBookId: string | null) {
    if (!returnBookId) {
      leave(null);
      return;
    }
    enterBook(returnBookId)
      .then((entry) => navigate(routePathFor(returnBookId, entry), { replace: true }))
      .catch(() => leave(returnBookId));
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const returnBookId = takeLoginReturn();
    const code = new URLSearchParams(window.location.hash.slice(1)).get('code');
    if (!code) {
      leave(returnBookId);
      return;
    }

    exchangeLoginCode(code)
      .then((session) => {
        setAuthToken(session.token);
        if (session.consent_required) setPhase({ kind: 'consent', returnBookId });
        else proceed(returnBookId);
      })
      .catch(() => leave(returnBookId));
  });

  if (phase.kind === 'consent') {
    const { returnBookId } = phase;
    return (
      <div className="min-h-dvh bg-dash-paper px-4 py-10 font-dashSans text-dash-ink mobile:px-0 mobile:py-0">
        <ConsentForm
          onAgree={async () => {
            await submitConsent();
            proceed(returnBookId);
          }}
          onCancel={() => {
            clearAuthToken();
            leave(returnBookId);
          }}
        />
      </div>
    );
  }

  return <p>로그인하는 중입니다</p>;
}
