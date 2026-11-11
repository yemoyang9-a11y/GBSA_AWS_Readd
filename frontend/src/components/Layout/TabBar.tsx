import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { APP_ROUTES } from '../../utils/routes';

export const TAB_BAR_HEIGHT = 56;

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

const TABS = [
  {
    to: APP_ROUTES.home,
    label: '홈',
    end: true,
    icon: (
      <Icon>
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V21h14V9.5" />
      </Icon>
    ),
  },
  {
    to: APP_ROUTES.search,
    label: '검색',
    end: false,
    icon: (
      <Icon>
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </Icon>
    ),
  },
  {
    to: APP_ROUTES.shelf,
    label: '서재',
    end: false,
    icon: (
      <Icon>
        <rect x="4" y="3" width="4" height="18" rx="1" />
        <rect x="10" y="3" width="4" height="18" rx="1" />
        <path d="m16.5 4.5 3.5-.9 2.5 16.5-3.5.9z" />
      </Icon>
    ),
  },
  {
    to: APP_ROUTES.my,
    label: 'MY',
    end: false,
    icon: (
      <Icon>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
      </Icon>
    ),
  },
] as const;

// NFR-USE
export default function TabBar() {
  return (
    <nav
      aria-label="주 메뉴"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-dash-line bg-dash-paper"
      style={{
        height: `calc(${TAB_BAR_HEIGHT}px + var(--safe-bottom))`,
        paddingBottom: 'var(--safe-bottom)',
      }}
    >
      <ul className="flex h-full">
        {TABS.map((tab) => (
          <li key={tab.to} className="flex flex-1">
            <NavLink
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 font-dashSans text-[11px] ${
                  isActive ? 'font-bold text-dash-ink' : 'text-dash-muted'
                }`
              }
            >
              {tab.icon}
              <span>{tab.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
