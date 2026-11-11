import { useState, type FormEvent } from 'react';
import { createSearchParams, NavLink, useNavigate } from 'react-router-dom';
import { APP_ROUTES } from '../../utils/routes';

/**
 * nav-bar — 대시보드 재설계 시안 (2026-08-23, `.dash-scr header`)
 *
 * 좌측 RE:ADD 워드마크(DM Mono) + 우측 도서 검색.
 * 하단 보더는 화면을 가로지르되 안쪽 내용은 `max-w-page` 컨테이너에 정렬한다 —
 * 대시보드 본문과 좌우 끝을 맞추기 위해서다.
 *
 * "도서 검색"은 대응 엔드포인트가 없어 자리만 두고 비활성으로 둔다 — 시안은 활성으로
 * 그렸지만 없는 API 를 지어내지 않는다 (CLAUDE.md 6장, 스펙 §7 #3). 재설계에서도 유지.
 *
 * 계정 개념이 없으므로 "OOO님의 서재" 같은 인칭 제목은 두지 않는다 (team-sync §4.8).
 *
 * 콜론 자리에 실제 로고 이미지(2026-08-26, 사용자 제공)를 넣었다 — 북마크 리본을
 * 반으로 접어 콜론처럼 쓴 마크다. 래스터 파일 없이 인라인 SVG로 재현했다 — 아모
 * 얼굴(ssabi-face.png)과 같은 북마크 실루엣이라 워드마크·캐릭터가 한 가족처럼 읽힌다.
 *
 * 오렌지/잉크 두 톤이 "색이 튄다"는 피드백으로, 시안 7종 비교 후 올리브 단색
 * (#6e6b42)으로 교체했다(2026-08-27) — RE/ADD 글자색(dash-ink)을 따라가던 currentColor
 * 연동은 이제 없고, 실루엣과 무관하게 고정된 색이다.
 */
export function ReaddMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="23"
      aria-hidden="true"
      className="mx-[1px] inline-block shrink-0 align-[-4px]"
    >
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" fill="#6e6b42" />
    </svg>
  );
}

export default function Header({ nav = true }: { nav?: boolean }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({ pathname: APP_ROUTES.search, search: `?${createSearchParams({ q: query })}` });
  }

  return (
    <header className="h-14 border-b border-dash-line">
      <div className="mx-auto flex h-full w-full max-w-page items-center gap-8 px-7">
        <span className="font-dashMono text-[22px] font-medium tracking-[-1px] text-dash-ink">
          RE<ReaddMark />
          <b className="font-medium">ADD</b>
        </span>

        {nav && (
          <>
            <nav aria-label="주 메뉴">
              <ul className="flex items-center gap-6">
                <li>
                  <NavLink to={APP_ROUTES.home} end className={headerLinkClass}>
                    홈
                  </NavLink>
                </li>
                <li>
                  <NavLink to={APP_ROUTES.shelf} className={headerLinkClass}>
                    서재
                  </NavLink>
                </li>
              </ul>
            </nav>

            <form role="search" onSubmit={submitSearch} className="ml-auto">
              <label className="flex h-9 w-56 items-center gap-2 rounded-pill border border-dash-line bg-dash-paper px-3 text-dash-muted focus-within:border-dash-ink">
                <svg
                  aria-hidden="true"
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="7" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  aria-label="작품, 작가 검색"
                  placeholder="작품, 작가 검색"
                  className="w-full bg-transparent font-dashSans text-[14px] text-dash-ink outline-none placeholder:text-dash-muted"
                />
              </label>
            </form>

            <NavLink to={APP_ROUTES.my} className={headerLinkClass}>
              MY
            </NavLink>
          </>
        )}
      </div>
    </header>
  );
}

function headerLinkClass({ isActive }: { isActive: boolean }) {
  return `border-b pb-0.5 font-dashSans text-[15px] transition-colors hover:text-dash-ink ${
    isActive ? 'border-dash-ink font-bold text-dash-ink' : 'border-transparent text-dash-muted'
  }`;
}
