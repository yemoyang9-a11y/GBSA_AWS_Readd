import { useNavigate } from 'react-router-dom';

// NFR-USE
export default function MobileNotFound() {
  const navigate = useNavigate();
  return (
    <main
      data-testid="mobile-not-found"
      data-mobile="true"
      className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-6 text-center"
      style={{ paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)' }}
    >
      <p>페이지를 찾을 수 없습니다</p>
      <button
        type="button"
        onClick={() => navigate('/')}
        className="min-h-11 rounded-lg bg-ink px-5 py-2.5 text-[13px] font-bold text-white transition-opacity disabled:opacity-40"
      >
        서재로
      </button>
    </main>
  );
}
