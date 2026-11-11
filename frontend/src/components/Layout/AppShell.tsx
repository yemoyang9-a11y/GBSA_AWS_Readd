import { Outlet } from 'react-router-dom';
import Header from './Header';
import TabBar, { TAB_BAR_HEIGHT } from './TabBar';

// NFR-USE
export default function AppShell({ isMobile, nav }: { isMobile: boolean; nav?: boolean }) {
  const showNav = nav !== false;

  if (isMobile) {
    return (
      <div
        data-mobile="true"
        className="min-h-[100dvh] bg-dash-paper font-dashSans text-dash-ink"
        style={{ paddingTop: 'var(--safe-top)' }}
      >
        <main
          style={{
            paddingBottom: showNav
              ? `calc(${TAB_BAR_HEIGHT}px + var(--safe-bottom))`
              : 'var(--safe-bottom)',
          }}
        >
          <Outlet />
        </main>
        {showNav && <TabBar />}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dash-paper font-dashSans text-dash-ink">
      <Header nav={showNav} />
      <main>
        <Outlet />
      </main>
    </div>
  );
}
