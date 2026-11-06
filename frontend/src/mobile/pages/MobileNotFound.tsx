import { useNavigate } from 'react-router-dom';

// NFR-USE
export default function MobileNotFound() {
  const navigate = useNavigate();
  return (
    <main
      data-testid="mobile-not-found"
      data-mobile="true"
      className="flex min-h-[100dvh] flex-col items-center justify-center gap-5 bg-dash-paper px-6 text-center font-dashSans text-dash-ink"
      style={{ paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)' }}
    >
      <p className="font-dashMono text-[13px] tracking-[.06em] text-dash-muted">404</p>
      <h1 className="break-keep font-dashSerif text-[22px] font-semibold">페이지를 찾을 수 없습니다</h1>
      <button
        type="button"
        onClick={() => navigate('/')}
        className="min-h-11 rounded-full border border-dash-ink px-6 text-[15px] font-bold"
      >
        서재로
      </button>
    </main>
  );
}
