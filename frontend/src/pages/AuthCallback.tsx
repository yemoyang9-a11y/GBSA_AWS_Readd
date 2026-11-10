import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { exchangeLoginCode } from '../services/authService';
import { setAuthToken } from '../utils/storage';

export default function AuthCallback() {
  const navigate = useNavigate();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const goToMy = () => navigate('/my', { replace: true });
    const code = new URLSearchParams(window.location.hash.slice(1)).get('code');
    if (!code) {
      goToMy();
      return;
    }

    exchangeLoginCode(code)
      .then(({ token }) => setAuthToken(token))
      .catch(() => undefined)
      .finally(goToMy);
  }, [navigate]);

  return <p>로그인하는 중입니다</p>;
}
