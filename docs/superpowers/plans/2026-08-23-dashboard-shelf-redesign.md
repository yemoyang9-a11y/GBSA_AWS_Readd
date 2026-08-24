# 서재(대시보드) 화면 재설계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 서재(대시보드) 화면을 확정된 목업(통계 카드+필터+그리드) 구조에서 "이어읽기 히어로 + 책 목록" 구조로 재설계하고, 대시보드 전용 새 시각 시스템(Pretendard·Noto Serif KR·DM Mono, 흑백 단색 액센트)을 도입한다.

**Architecture:** 대시보드 전용 Tailwind 토큰(`dash-*` 네임스페이스)을 신설해 기존 `ink`/`muted`/`canvas`/`serif`/`sans` 등 다른 화면(브리핑·읽기·싸비)이 쓰는 공유 토큰을 건드리지 않는다. Dashboard.tsx는 새 컴포넌트 셋(WelcomeBanner·ContinueReadingHero·ShelfList)으로 조립되고, 기존 StatCard·BookGrid·BookCard는 대시보드 전용이었으므로 정리 태스크에서 삭제한다. TypographicCover·ProgressBar·FilterTabs는 이번에도 재사용하되 새 크기/톤 옵션을 추가한다.

**Tech Stack:** React 18 + TypeScript, Tailwind CSS, Vitest + Testing Library.

**Spec:** https://claude.ai/code/artifact/7cbdf443-c597-405c-b453-02d3d0a8c17f — `.dash-scr` 스코프 섹션. **Claude Artifact이며 저장소 파일이 아니다.** 원본은 사용자가 2026-08-22 11:40 세션에 참조 HTML을 직접 붙여넣어 만든 것이고, 이후 대시보드·브리핑·읽기 3화면을 한 창에 합친 최종본이 위 링크다. 이 계획은 그중 대시보드 섹션만 다룬다.

## Global Constraints

- **완독 판정 데이터가 없다.** `0`을 쓰지 않고 지어내지 않는다 — 이미 "완독 필터는 빈 목록 대신 이유를 말한다"로 반영돼 있고, 이번 재설계에서도 유지한다. (PRODUCT.md 원칙 4번, CLAUDE.md 6장)
- **`BookSummary`에 `total_pages`가 없다.** 엔드포인트 계획 D-1(2026-08-21 확정)이 의도적으로 뺐다 — 프론트가 분수를 계산하면 절대 규칙 2번(서버 파생값을 프론트가 만들지 않는다) 위반이다. 목업은 "72 / 285쪽"을 보여주지만 실제 계약엔 285(총 페이지)가 없으므로 **분수 표시를 하지 않는다** — `current_page`만 단독으로 표시한다.
- **미완비 도서(`ssabi_ready=false`)는 진입을 막는다** (FR-BRW-002 🚦). UI 비활성 + 이유 문구, 서버도 403으로 거절하는 이중 방어를 유지한다.
- **"도서 검색"에 대응하는 엔드포인트가 없다.** 비활성 상태를 유지한다 — 없는 API를 지어내지 않는다 (CLAUDE.md 6장).
- **다른 파트 소유 파일을 건드리지 않는다.**
- **이 브랜치(`feature/R4-query-endpoints`)는 `frontend/` 변경을 push하면 바로 라이브 배포된다.** 마지막 태스크의 완료 조건에 "push 전 사용자 확인" 체크포인트가 있다 — 임의로 push하지 않는다.
- 색·서체 값은 아래 각 태스크의 코드에 있는 값을 정확히 쓴다(임의 반올림 금지) — 시안 실측값이다.

---

### Task 1: 대시보드 전용 디자인 토큰 + 폰트 로드

**Files:**
- Modify: `frontend/tailwind.config.js`
- Modify: `frontend/index.html`
- Test: `frontend/src/pages/__tests__/dashTokens.test.ts` (신규)

**Interfaces:**
- Produces: Tailwind 클래스 `text-dash-ink`·`text-dash-muted`·`border-dash-line`·`bg-dash-paper`·`font-dashSerif`·`font-dashSans`·`font-dashMono`, 그리고 `height.hero-cover`(219px)·`height.row-cover`(118px)·`width.row-cover`(84px). 이후 모든 태스크가 이 이름을 그대로 쓴다.

**Ruling(계획에 포함):** 기존 `ink`/`muted`/`line`/`canvas`/`serif`/`sans` 토큰은 브리핑·읽기·싸비 화면이 공유해서 쓰고 있어 값을 바꾸면 그 화면들이 동시에 재스킨된다. 새 네임스페이스 `dash-*`를 만들어 대시보드에만 적용되게 격리한다 — Task 10이 `ssabi`/`ssabi-soft` 토큰을 accent와 분리 신설했던 것과 같은 이유다.

- [ ] **Step 1: 실패하는 토큰 테스트 작성**

```ts
// frontend/src/pages/__tests__/dashTokens.test.ts
import { describe, expect, it } from 'vitest';
import config from '../../../tailwind.config.js';

describe('대시보드 재설계 — 신규 토큰', () => {
  it('dash 색 토큰 4종이 시안 실측값과 일치한다', () => {
    const dash = (config.theme.extend.colors as Record<string, unknown>).dash as Record<
      string,
      string
    >;
    expect(dash.ink).toBe('#1f1f1f');
    expect(dash.muted).toBe('#777777');
    expect(dash.line).toBe('#dedede');
    expect(dash.paper).toBe('#fbf9f7');
  });

  it('dash 서체 토큰 3종이 있다', () => {
    const fonts = config.theme.extend.fontFamily as Record<string, string[]>;
    expect(fonts.dashSerif).toEqual(['"Noto Serif KR"', 'serif']);
    expect(fonts.dashSans).toEqual(['Pretendard', 'system-ui', 'sans-serif']);
    expect(fonts.dashMono).toEqual(['"DM Mono"', 'monospace']);
  });

  it('히어로·목록 표지 크기 토큰이 있다', () => {
    const height = config.theme.extend.height as Record<string, string>;
    const width = config.theme.extend.width as Record<string, string>;
    expect(height['hero-cover']).toBe('219px');
    expect(height['row-cover']).toBe('118px');
    expect(width['row-cover']).toBe('84px');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd frontend && npx vitest run src/pages/__tests__/dashTokens.test.ts`
Expected: FAIL — `config.theme.extend.colors.dash` is undefined.

- [ ] **Step 3: tailwind.config.js에 토큰 추가**

`frontend/tailwind.config.js`의 `colors` 블록 끝(`ssabi` 다음)에 추가:

```js
        dash: {
          // 대시보드 재설계 전용(2026-08-23 시안 확정). 기존 ink/muted/line과 값이
          // 미세하게 다르고 브리핑·읽기·싸비는 여전히 옛 값을 쓰므로 섞지 않는다.
          ink: '#1f1f1f',
          muted: '#777777',
          line: '#dedede',
          paper: '#fbf9f7',
        },
```

`fontFamily` 블록 끝에 추가:

```js
      dashSerif: ['"Noto Serif KR"', 'serif'],
      dashSans: ['Pretendard', 'system-ui', 'sans-serif'],
      dashMono: ['"DM Mono"', 'monospace'],
```

`height` 블록에 추가(`navbar` 다음):

```js
        'hero-cover': '219px',
        'row-cover': '118px',
```

`width` 블록에 추가(`book-card` 다음):

```js
        'row-cover': '84px',
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd frontend && npx vitest run src/pages/__tests__/dashTokens.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: 구글 폰트 로드 추가**

`frontend/index.html`의 `<head>`에 다음을 추가(기존 태그가 있으면 유지하고 이어붙인다):

```html
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Noto+Serif+KR:wght@400;500;600;700&family=Pretendard:wght@400;500;600;700&display=swap"
    />
```

- [ ] **Step 6: 전체 테스트·빌드 확인**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: 0 tsc errors, 모든 기존 테스트 여전히 통과(토큰 추가만이라 회귀 없음).

- [ ] **Step 7: 커밋**

```bash
git add frontend/tailwind.config.js frontend/index.html frontend/src/pages/__tests__/dashTokens.test.ts
git commit -m "feat(R4): 대시보드 재설계용 dash-* 토큰·폰트 로드 추가"
```

---

### Task 2: TypographicCover에 크기 변형 추가 (hero·row)

**Files:**
- Modify: `frontend/src/components/common/TypographicCover.tsx`
- Modify: `frontend/src/components/common/TypographicCover.test.tsx`

**Interfaces:**
- Consumes: Task 1의 `h-hero-cover`·`h-row-cover`·`w-row-cover`·`font-dashSerif`·`font-dashSans` 클래스.
- Produces: `size?: 'card' | 'hero' | 'row'` prop (기본값 `'card'`, 기존 동작 100% 보존). Task 5·6이 `size="hero"`/`size="row"`로 소비한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/components/common/TypographicCover.test.tsx` 파일 끝에 추가:

```tsx
describe('size 변형', () => {
  it('size 기본값은 card — 기존 렌더와 동일하다', () => {
    render(<TypographicCover title="탁류" author="채만식" coverUrl="" />);
    const cover = screen.getByTestId('typographic-cover');
    expect(cover.className).toContain('h-cover');
    expect(cover.className).not.toContain('h-hero-cover');
  });

  it('size="hero"는 h-hero-cover를 쓰고 모서리를 두지 않는다', () => {
    render(<TypographicCover title="탁류" author="채만식" coverUrl="" size="hero" />);
    const cover = screen.getByTestId('typographic-cover');
    expect(cover.className).toContain('h-hero-cover');
    expect(cover.className).not.toContain('rounded-cover');
    expect(cover.className).toContain('font-dashSerif');
  });

  it('size="row"는 w-row-cover·h-row-cover 고정폭이고 글자가 작다', () => {
    render(<TypographicCover title="탁류" author="채만식" coverUrl="" size="row" />);
    const cover = screen.getByTestId('typographic-cover');
    expect(cover.className).toContain('w-row-cover');
    expect(cover.className).toContain('h-row-cover');
    expect(screen.getByText('탁류').className).toContain('text-xs');
  });

  it('size="hero"에 coverUrl이 있으면 이미지가 h-hero-cover를 쓴다', () => {
    render(
      <TypographicCover title="탁류" author="채만식" coverUrl="https://x/y.jpg" size="hero" />
    );
    expect(screen.getByRole('img').className).toContain('h-hero-cover');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd frontend && npx vitest run src/components/common/TypographicCover.test.tsx`
Expected: FAIL — `size` prop이 없어 항상 card 크기로 렌더됨.

- [ ] **Step 3: 최소 구현**

`frontend/src/components/common/TypographicCover.tsx` 전체를 다음으로 교체:

```tsx
/**
 * 표지 자리 — 시안의 book-cover 영역
 *
 * 「탁류」는 1937년 공개도메인 작품이라 정본 표지가 없고, mock fixture 와 R1 파이프라인
 * 모두 cover_url 을 채우지 않는다. 이미지가 없을 때 빈 사각형을 두는 대신 제목·저자를
 * 명조로 조판해 표지 구실을 하게 한다 (스펙 §7 #4).
 *
 * cover_url 이 채워지면 별도 수정 없이 이미지로 전환된다.
 *
 * size: 'card'(기존, 240px, 8px 모서리) · 'hero'(대시보드 재설계 히어로, 219px, 모서리 없음)
 * · 'row'(대시보드 재설계 목록 행, 84×118px, 모서리 없음). hero/row는 2026-08-23 시안이
 * 확정한 대시보드 전용 dash-* 톤을 쓴다.
 */
export default function TypographicCover({
  title,
  author,
  coverUrl,
  dimmed = false,
  size = 'card',
}: {
  title: string;
  author: string;
  coverUrl?: string | null;
  /**
   * 아직 열 수 없는 도서의 표지를 죽인다. 흐리게 하는 건 **표지뿐**이고 제목·저자 글자는
   * 건드리지 않는다 — 카드 전체에 opacity 를 걸면 본문 글자의 명도 대비까지 같이 떨어진다.
   */
  dimmed?: boolean;
  size?: 'card' | 'hero' | 'row';
}) {
  const dim = dimmed ? ' opacity-60' : '';
  const isDash = size !== 'card';
  const heightClass = size === 'hero' ? 'h-hero-cover' : size === 'row' ? 'h-row-cover' : 'h-cover';
  const widthClass = size === 'row' ? 'w-row-cover flex-none' : 'w-full';
  const roundedClass = size === 'card' ? ' rounded-cover' : '';
  const titleFont = isDash ? 'font-dashSerif' : 'font-serif';
  const titleSize = size === 'row' ? 'text-xs' : size === 'hero' ? 'text-xl' : 'text-2xl';
  const authorFont = isDash ? 'font-dashSans' : 'font-sans';
  const borderColor = isDash ? 'border-dash-line' : 'border-line';
  const bgColor = isDash ? 'bg-dash-paper' : 'bg-canvas';

  if (coverUrl) {
    return (
      <img
        src={coverUrl}
        alt={`${title} 표지`}
        className={`${heightClass} ${widthClass}${roundedClass} object-cover${dim}`}
      />
    );
  }

  return (
    <div
      className={`flex ${heightClass} ${widthClass} flex-col items-center justify-center gap-3${roundedClass} border ${borderColor} ${bgColor} px-6 text-center${dim}`}
      data-testid="typographic-cover"
      aria-hidden="true"
    >
      <span className={`${titleFont} ${titleSize} font-bold leading-snug text-ink`}>{title}</span>
      <span className="h-px w-8 bg-line" />
      <span className={`${authorFont} text-xs text-muted`}>{author}</span>
    </div>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd frontend && npx vitest run src/components/common/TypographicCover.test.tsx`
Expected: PASS, 기존 케이스 포함 전부 통과(회귀 없음).

- [ ] **Step 5: BookCard 회귀 확인**

Run: `cd frontend && npx vitest run src/components/common/BookCard.test.tsx`
Expected: PASS — `size` 미지정이므로 기본값 `'card'`로 기존과 동일하게 렌더된다.

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/components/common/TypographicCover.tsx frontend/src/components/common/TypographicCover.test.tsx
git commit -m "feat(R4): TypographicCover에 hero/row 크기 변형 추가 — 기존 card 회귀 없음"
```

---

### Task 3: Header 재단장 (워드마크·검색 버튼 폰트 교체)

**Files:**
- Modify: `frontend/src/components/Layout/Header.tsx`
- Modify: `frontend/src/components/Layout/Header.test.tsx`

**Interfaces:**
- Consumes: Task 1의 `font-dashMono`·`text-dash-ink`·`border-dash-line`.
- 기존 시그니처(`Header()` — props 없음) 그대로 유지. Dashboard.tsx 호출부 변경 불필요.

**확인된 사실:** `Header.tsx`는 `Dashboard.tsx`에서만 쓰인다(grep 확인, 2026-08-23) — 다른 화면은 각자 자기 상단바를 그린다. 재스킨해도 회귀 위험이 없다.

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/components/Layout/Header.test.tsx`에 추가:

```tsx
it('워드마크가 DM Mono 서체를 쓴다 (2026-08-23 재설계)', () => {
  render(<Header />);
  const brand = screen.getByText('RE:ADD');
  expect(brand.className).toContain('font-dashMono');
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd frontend && npx vitest run src/components/Layout/Header.test.tsx`
Expected: FAIL — 현재는 `font-serif`를 쓴다.

- [ ] **Step 3: 구현**

`frontend/src/components/Layout/Header.tsx` 전체를 다음으로 교체:

```tsx
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
 */
export default function Header() {
  return (
    <header className="h-14 border-b border-dash-line">
      <div className="mx-auto flex h-full w-full max-w-page items-center justify-between px-7">
        <span className="font-dashMono text-[22px] font-medium tracking-[-1px] text-dash-ink">
          RE:<b className="font-medium">ADD</b>
        </span>

        <button
          type="button"
          disabled
          className="font-dashSans text-[19px] text-dash-muted disabled:opacity-40"
        >
          도서 검색
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd frontend && npx vitest run src/components/Layout/Header.test.tsx`
Expected: PASS (기존 4개 + 신규 1개, 총 5개).

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/components/Layout/Header.tsx frontend/src/components/Layout/Header.test.tsx
git commit -m "feat(R4): Header 워드마크·검색 버튼을 대시보드 재설계 서체로 교체"
```

---

### Task 4: WelcomeBanner 컴포넌트 신설

**Files:**
- Create: `frontend/src/components/Dashboard/WelcomeBanner.tsx`
- Test: `frontend/src/components/Dashboard/WelcomeBanner.test.tsx`

**Interfaces:**
- Produces: `WelcomeBanner()` — props 없음. Task 7이 Dashboard.tsx에서 `<WelcomeBanner />`로 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
// frontend/src/components/Dashboard/WelcomeBanner.test.tsx
import { render, screen } from '@testing-library/react';
import WelcomeBanner from './WelcomeBanner';

describe('WelcomeBanner', () => {
  it('eyebrow와 인사말을 렌더한다', () => {
    render(<WelcomeBanner />);
    expect(screen.getByText('MY READING ROOM')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: '오늘도, 이야기 속으로.' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd frontend && npx vitest run src/components/Dashboard/WelcomeBanner.test.tsx`
Expected: FAIL — 파일이 없다.

- [ ] **Step 3: 구현**

```tsx
// frontend/src/components/Dashboard/WelcomeBanner.tsx
/**
 * 서재 인사말 — 대시보드 재설계 시안 (2026-08-23, `.dash-scr .welcome`)
 *
 * 2026-08-22 크리틱 라운드에서 헤더 안의 부제("오늘도 나만의 페이스로…")는 삭제됐다.
 * 이건 그것과 다른 요소다 — 헤더 밖, 본문 상단의 별도 인사 섹션으로 시안이 다시
 * 도입한 것이라 자리와 문구가 다르다.
 */
export default function WelcomeBanner() {
  return (
    <section className="flex items-end justify-between pb-7 pt-[53px]">
      <div>
        <p className="font-dashMono text-[11px] font-medium uppercase tracking-[.06em] text-dash-muted">
          MY READING ROOM
        </p>
        <h1 className="mt-[9px] font-dashSerif text-[clamp(28px,4vw,46px)] font-semibold tracking-[-.07em] text-dash-ink">
          오늘도, 이야기 속으로.
        </h1>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd frontend && npx vitest run src/components/Dashboard/WelcomeBanner.test.tsx`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/components/Dashboard/WelcomeBanner.tsx frontend/src/components/Dashboard/WelcomeBanner.test.tsx
git commit -m "feat(R4): WelcomeBanner 컴포넌트 신설 — 서재 인사 섹션"
```

---

### Task 5: ContinueReadingHero 컴포넌트 신설

**Files:**
- Create: `frontend/src/components/Dashboard/ContinueReadingHero.tsx`
- Test: `frontend/src/components/Dashboard/ContinueReadingHero.test.tsx`

**Interfaces:**
- Consumes: `TypographicCover`(size="hero"), `BookSummary` 타입.
- Produces:
  ```ts
  function ContinueReadingHero(props: {
    book: BookSummary;
    onResume: () => void;
    busy?: boolean;
  }): JSX.Element
  ```
  Task 7이 `<ContinueReadingHero book={selectedBook} onResume={handleResume} busy={enteringId === selectedBook.book_id} />`로 쓴다.

**Ruling(계획에 포함) — 페이지 분수 표시를 하지 않는다:** 시안은 "72 / 285쪽"을 보여주지만 `BookSummary.progress`엔 `current_page`만 있고 총 페이지가 없다(D-1, Global Constraints 참조). 분수를 만들면 프론트가 서버에 없는 값을 지어내는 것이라 절대 규칙 2번 위반이다. `현재 페이지`만 단독 표시한다 — `total_pages`가 계약에 들어오면 이 한 줄만 고치면 된다.

**Ruling(계획에 포함) — 진도 없는 책의 히어로:** 시안의 데모 데이터 3권은 전부 진도가 있어 이 경우를 다루지 않는다. 그러나 `BookSummary.progress`는 optional이고 기존 `BookCard`도 이 경우를 처리했다(진도 블록을 통째로 생략). 히어로도 같은 원칙으로 처리한다 — `progress`가 없으면 캡션을 "새로 시작하기"로, 진도 줄·바를 생략하고, 버튼 문구를 "읽기 시작"으로 바꾼다.

**Ruling(계획에 포함) — 미완비 도서(FR-BRW-002 🚦):** 시안엔 없는 상태지만 절대 지켜야 하는 게이트다. `ssabi_ready===false`면 캡션 "준비 중", 진도 블록 생략, 버튼은 "아직 준비 중입니다" 텍스트로 항상 비활성.

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
// frontend/src/components/Dashboard/ContinueReadingHero.test.tsx
import { render, screen } from '@testing-library/react';
import ContinueReadingHero from './ContinueReadingHero';
import type { BookSummary } from '../../types';

const reading: BookSummary = {
  book_id: 'takryu',
  title: '탁류',
  author: '채만식',
  cover_url: '',
  intro_summary: null,
  ssabi_ready: true,
  progress: { current_page: 72, percent: 25.3 },
};

describe('ContinueReadingHero', () => {
  it('진도 있는 책 — 제목·저자·진도·이어서 읽기 버튼을 보여준다', () => {
    const onResume = vi.fn();
    render(<ContinueReadingHero book={reading} onResume={onResume} />);

    expect(screen.getByText('CONTINUE READING')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: '탁류' })).toBeInTheDocument();
    expect(screen.getByText('채만식')).toBeInTheDocument();
    expect(screen.getByText('25.3% 완료')).toBeInTheDocument();
    expect(screen.getByText('72쪽')).toBeInTheDocument();
    // 총 페이지가 계약에 없으므로 분수를 만들지 않는다
    expect(screen.queryByText(/\/\s*\d+쪽/)).not.toBeInTheDocument();

    const button = screen.getByRole('button', { name: '이어서 읽기' });
    userEvent.setup();
    button.click();
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('진도 없는 책 — "새로 시작하기" 상태를 보여준다', () => {
    const unread: BookSummary = { ...reading, progress: undefined };
    render(<ContinueReadingHero book={unread} onResume={() => {}} />);

    expect(screen.getByText('새로 시작하기')).toBeInTheDocument();
    expect(screen.queryByText(/% 완료/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '읽기 시작' })).toBeInTheDocument();
  });

  it('진행 중(busy)이면 버튼이 잠기고 문구가 바뀐다', () => {
    render(<ContinueReadingHero book={reading} onResume={() => {}} busy />);
    expect(screen.getByRole('button', { name: '여는 중' })).toBeDisabled();
  });

  it('미완비 도서 — 버튼이 항상 비활성이고 이유를 말한다 (FR-BRW-002)', () => {
    const notReady: BookSummary = { ...reading, ssabi_ready: false };
    render(<ContinueReadingHero book={notReady} onResume={() => {}} />);

    expect(screen.getByText('준비 중')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '아직 준비 중입니다' })).toBeDisabled();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd frontend && npx vitest run src/components/Dashboard/ContinueReadingHero.test.tsx`
Expected: FAIL — 파일이 없다.

- [ ] **Step 3: 구현**

```tsx
// frontend/src/components/Dashboard/ContinueReadingHero.tsx
import ProgressBar from '../Reader/ProgressBar';
import TypographicCover from '../common/TypographicCover';
import type { BookSummary } from '../../types';

/**
 * 이어읽기 히어로 — 대시보드 재설계 시안 (2026-08-23, `.dash-scr .continue`)
 *
 * 시안은 진도(current/total)를 "72 / 285쪽"으로 보여주지만 `BookSummary.progress`엔
 * `current_page`만 있다 — 총 페이지는 계약 D-1(2026-08-21)이 의도적으로 뺐다. 분수를
 * 만들면 서버에 없는 값을 프론트가 지어내는 것이라 절대 규칙 2번 위반이다. 그래서
 * 여기는 현재 페이지만 단독 표시한다.
 *
 * 진도가 없는 책(아직 시작 안 함)과 미완비 도서(ssabi_ready=false, FR-BRW-002 🚦)는
 * 시안에 없는 상태지만 기존 BookCard 가 다루던 게이트라 여기서도 지킨다.
 */
export default function ContinueReadingHero({
  book,
  onResume,
  busy = false,
}: {
  book: BookSummary;
  onResume: () => void;
  busy?: boolean;
}) {
  const hasProgress = book.progress !== undefined;
  const ready = book.ssabi_ready;

  const caption = !ready ? '준비 중' : hasProgress ? 'CONTINUE READING' : '새로 시작하기';
  const buttonLabel = !ready
    ? '아직 준비 중입니다'
    : busy
      ? '여는 중'
      : hasProgress
        ? '이어서 읽기'
        : '읽기 시작';

  return (
    <section
      aria-live="polite"
      className="grid min-h-[265px] grid-cols-[182px_1fr_180px] items-center gap-[34px] border border-dash-line bg-white p-[23px]"
    >
      <TypographicCover size="hero" title={book.title} author={book.author} coverUrl={book.cover_url} dimmed={!ready} />

      <div>
        <p className="font-dashMono text-[11px] font-medium uppercase tracking-[.06em] text-dash-muted">
          {caption}
        </p>
        <h2 className="mt-[9px] font-dashSerif text-[27px] font-semibold tracking-[-.07em] text-dash-ink">
          {book.title}
        </h2>
        <p className="m-0 text-sm text-dash-muted">{book.author}</p>

        {ready && hasProgress ? (
          <div className="mt-[31px]">
            <div className="flex justify-between text-sm text-[#555]">
              <span>{book.progress!.percent}% 완료</span>
              <span>{book.progress!.current_page}쪽</span>
            </div>
            <div className="mt-[9px]">
              <ProgressBar percent={book.progress!.percent} tone="dash" />
            </div>
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onResume}
        disabled={!ready || busy}
        className="justify-self-end self-end rounded-full border border-dash-ink bg-transparent px-[14px] py-2 text-xs font-bold text-dash-ink transition-opacity disabled:opacity-40"
      >
        {buttonLabel}
      </button>
    </section>
  );
}
```

`frontend/src/components/Reader/ProgressBar.tsx`의 `tone` 유니온에 `'dash'`를 추가(기존 `'ink'`/`'accent'` 동작은 그대로 둔다):

```tsx
export default function ProgressBar({
  percent,
  tone = 'ink',
}: {
  percent: number;
  tone?: 'ink' | 'accent' | 'dash';
}) {
  const width = Math.min(Math.max(percent, 0), 100);
  const fillClass = tone === 'accent' ? 'bg-accent' : tone === 'dash' ? 'bg-dash-ink' : 'bg-ink';
  const trackClass = tone === 'dash' ? 'bg-dash-line' : 'bg-line';

  return (
    <div
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      className={`h-1 w-full overflow-hidden rounded-sm ${trackClass}`}
    >
      <div data-testid="progress-fill" className={`h-full ${fillClass}`} style={{ width: `${width}%` }} />
    </div>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd frontend && npx vitest run src/components/Dashboard/ContinueReadingHero.test.tsx src/components/Reader/ProgressBar.test.tsx`
Expected: PASS 전부(ProgressBar 기존 테스트는 tone 기본값 미변경이라 회귀 없음).

- [ ] **Step 5: 브리핑 화면 회귀 확인**

Run: `cd frontend && npx vitest run src/pages/BriefingView.test.tsx`
Expected: PASS — `tone="accent"` 경로는 건드리지 않았다.

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/components/Dashboard/ContinueReadingHero.tsx frontend/src/components/Dashboard/ContinueReadingHero.test.tsx frontend/src/components/Reader/ProgressBar.tsx
git commit -m "feat(R4): ContinueReadingHero 신설 — total_pages 없는 계약 반영, ProgressBar에 dash 톤 추가"
```

---

### Task 6: ShelfList 컴포넌트 신설 (필터 + 책 목록) + FilterTabs 재단장

**Files:**
- Create: `frontend/src/components/Dashboard/ShelfList.tsx`
- Test: `frontend/src/components/Dashboard/ShelfList.test.tsx`
- Modify: `frontend/src/components/common/FilterTabs.tsx`
- Modify: `frontend/src/components/common/FilterTabs.test.tsx`

**Interfaces:**
- Consumes: `TypographicCover`(size="row"), `FilterTabs`, `BookSummary`.
- Produces:
  ```ts
  type DashFilter = 'all' | 'reading' | 'done';

  function ShelfList(props: {
    books: BookSummary[];          // 필터 적용 전 전체 목록 — 개수 표시·1권 숨김 판단에 쓴다
    visibleBooks: BookSummary[];   // 필터 적용된 목록 — 실제 렌더 대상
    selectedId: string;
    onPreview: (book: BookSummary) => void;
    filter: DashFilter;
    onFilterChange: (filter: DashFilter) => void;
    emptyMessage?: string;
  }): JSX.Element | null
  ```
  Task 7이 이 시그니처로 호출한다.

**Ruling(계획에 포함) — 책이 1권뿐이면 목록 섹션 자체를 숨긴다:** 실제 카탈로그는 발표(8/28)까지 「탁류」 1권뿐이다(2026-08-22 크리틱 "실제 사용 장면 — 도서 1권 문제" 질문 1번 참조). 히어로가 이미 그 책을 보여주므로, 1권일 때 그 아래 "내 서재" 목록·필터를 또 두면 같은 책의 빈 반복이다. `books.length <= 1`이면 `ShelfList`는 `null`을 반환한다 — 필터도 함께 사라진다(필터링할 대상이 없으므로 의미가 없다). 책이 2권 이상 생기면 자동으로 나타난다.

**Ruling(계획에 포함) — 필터 순서는 시안이 아니라 기존 확정 결정을 따른다:** 이번 재설계의 원본 참조 HTML(사용자가 2026-08-22 11:40에 붙여넣은 것)엔 필터가 "전체·읽는 중·완독" 순으로 있다. 그러나 같은 날 늦게 사용자가 "필터 순서 전체 → 완독 → 읽는 중"으로 **별도로** 확정했고(현재 `Dashboard.tsx`의 `FILTERS` 상수, 주석 "2026-08-22 사용자 결정") 그게 마지막 결정이다. 재설계에서도 그 순서를 유지한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
// frontend/src/components/Dashboard/ShelfList.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ShelfList from './ShelfList';
import type { BookSummary } from '../../types';

const takryu: BookSummary = {
  book_id: 'takryu', title: '탁류', author: '채만식', cover_url: '',
  intro_summary: null, ssabi_ready: true, progress: { current_page: 72, percent: 25.3 },
};
const demian: BookSummary = {
  book_id: 'demian', title: '데미안', author: '헤르만 헤세', cover_url: '',
  intro_summary: null, ssabi_ready: true, progress: { current_page: 184, percent: 61.8 },
};

describe('ShelfList', () => {
  it('책이 1권이면 아무것도 렌더하지 않는다', () => {
    const { container } = render(
      <ShelfList
        books={[takryu]}
        visibleBooks={[takryu]}
        selectedId="takryu"
        onPreview={() => {}}
        filter="all"
        onFilterChange={() => {}}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('책이 2권 이상이면 개수·필터·행을 렌더한다', async () => {
    const onPreview = vi.fn();
    render(
      <ShelfList
        books={[takryu, demian]}
        visibleBooks={[takryu, demian]}
        selectedId="takryu"
        onPreview={onPreview}
        filter="all"
        onFilterChange={() => {}}
      />
    );

    expect(screen.getByText('내 서재')).toBeInTheDocument();
    expect(screen.getByText('(2)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '전체' })).toBeInTheDocument();

    const row = screen.getByRole('button', { name: /데미안 선택/ });
    await userEvent.click(row);
    expect(onPreview).toHaveBeenCalledWith(demian);
  });

  it('선택된 행에 selected 클래스가 붙는다', () => {
    render(
      <ShelfList
        books={[takryu, demian]}
        visibleBooks={[takryu, demian]}
        selectedId="demian"
        onPreview={() => {}}
        filter="all"
        onFilterChange={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: /데미안 선택/ }).className).toContain('selected');
    expect(screen.getByRole('button', { name: /탁류 선택/ }).className).not.toContain('selected');
  });

  it('빈 목록 문구를 전달받으면 보여준다', () => {
    render(
      <ShelfList
        books={[takryu, demian]}
        visibleBooks={[]}
        selectedId="takryu"
        onPreview={() => {}}
        filter="done"
        onFilterChange={() => {}}
        emptyMessage="완독 여부를 판정할 데이터가 아직 없습니다"
      />
    );
    expect(screen.getByText('완독 여부를 판정할 데이터가 아직 없습니다')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd frontend && npx vitest run src/components/Dashboard/ShelfList.test.tsx`
Expected: FAIL — 파일이 없다.

- [ ] **Step 3: FilterTabs 재단장**

`frontend/src/components/common/FilterTabs.tsx`를 다음으로 교체(제네릭 시그니처는 그대로 — 대시보드 외 소비자가 없음을 확인했으므로 값만 바꾼다):

```tsx
/**
 * 알약형 필터 탭 — 대시보드 재설계 시안 (2026-08-23, `.dash-scr .filter`)
 *
 * 서버에 상태 필터 파라미터가 없으므로 이 탭은 **클라이언트 필터**다 (스펙 §7 #2).
 * 선택 상태는 호출부가 갖는다 — 이 컴포넌트는 렌더와 통지만 한다.
 * 현재 대시보드 외 소비자가 없어(2026-08-23 grep 확인) 값을 대시보드 톤으로 바로 바꾼다.
 */
export default function FilterTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex gap-1.5">
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(tab.id)}
            className={
              selected
                ? 'rounded-[18px] border border-dash-ink bg-dash-ink px-3 py-2 font-dashSans text-xs text-white'
                : 'rounded-[18px] border border-dash-line bg-transparent px-3 py-2 font-dashSans text-xs text-dash-muted'
            }
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
```

`frontend/src/components/common/FilterTabs.test.tsx`에서 클래스 문자열을 직접 단언하는 케이스가 있다면 `bg-active`/`text-faint` 등 옛 토큰 문자열 대신 `aria-pressed` 값으로 선택 상태를 확인하도록 고친다(이미 그렇게 돼 있다면 수정 불필요 — 실행해서 확인한다).

- [ ] **Step 4: FilterTabs 테스트 확인**

Run: `cd frontend && npx vitest run src/components/common/FilterTabs.test.tsx`
Expected: PASS. 실패하면 클래스 리터럴 단언을 `aria-pressed` 기반으로 바꾼 뒤 재실행.

- [ ] **Step 5: ShelfList 구현**

```tsx
// frontend/src/components/Dashboard/ShelfList.tsx
import FilterTabs from '../common/FilterTabs';
import TypographicCover from '../common/TypographicCover';
import type { BookSummary } from '../../types';

export type DashFilter = 'all' | 'reading' | 'done';

const FILTERS: { id: DashFilter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'done', label: '완독' },
  { id: 'reading', label: '읽는 중' },
];

/**
 * 서재 목록 — 대시보드 재설계 시안 (2026-08-23, `.dash-scr .library-head` + `.library`)
 *
 * 행을 클릭해도 이동하지 않는다 — 히어로의 미리보기 대상만 바뀐다(`onPreview`).
 * 실제 진입은 히어로의 "이어서 읽기" 버튼이 한다(`ContinueReadingHero`).
 *
 * 책이 1권뿐이면(발표 전 실제 카탈로그가 그렇다) 아무것도 렌더하지 않는다 — 히어로가
 * 이미 그 책이라 목록·필터가 같은 책의 빈 반복이 된다.
 */
export default function ShelfList({
  books,
  visibleBooks,
  selectedId,
  onPreview,
  filter,
  onFilterChange,
  emptyMessage,
}: {
  books: BookSummary[];
  visibleBooks: BookSummary[];
  selectedId: string;
  onPreview: (book: BookSummary) => void;
  filter: DashFilter;
  onFilterChange: (filter: DashFilter) => void;
  emptyMessage?: string;
}) {
  if (books.length <= 1) return null;

  return (
    <section className="mt-14">
      <div className="mb-[18px] flex items-center justify-between">
        <div>
          <p className="font-dashMono text-[11px] font-medium uppercase tracking-[.06em] text-dash-muted">
            YOUR SHELF
          </p>
          <h3 className="mt-0 font-dashSerif text-2xl font-semibold tracking-[-.07em] text-dash-ink">
            내 서재 <span className="text-[#89918a]">({books.length})</span>
          </h3>
        </div>
        <FilterTabs tabs={FILTERS} active={filter} onChange={onFilterChange} />
      </div>

      {visibleBooks.length === 0 ? (
        emptyMessage ? (
          <p className="py-16 text-center text-[13px] text-dash-muted">{emptyMessage}</p>
        ) : null
      ) : (
        <ul className="grid grid-cols-2 gap-[22px]">
          {visibleBooks.map((book) => {
            const selected = book.book_id === selectedId;
            return (
              <li key={book.book_id}>
                <button
                  type="button"
                  aria-label={`${book.title} 선택`}
                  onClick={() => onPreview(book)}
                  className={`flex h-[150px] w-full items-center gap-[17px] border bg-white p-4 text-left transition-transform ${
                    selected ? 'selected border-[#777] -translate-y-0.5' : 'border-dash-line'
                  }`}
                >
                  <TypographicCover size="row" title={book.title} author={book.author} coverUrl={book.cover_url} />
                  <div>
                    <h4 className="m-0 mb-1 font-dashSans text-[17px] text-dash-ink">{book.title}</h4>
                    <p className="m-0 font-dashSans text-[13px] text-dash-muted">{book.author}</p>
                    {book.progress ? (
                      <div className="mt-4 font-dashSans text-[13px] font-semibold text-[#555]">
                        {book.progress.percent}% 완료
                      </div>
                    ) : null}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `cd frontend && npx vitest run src/components/Dashboard/ShelfList.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 7: 커밋**

```bash
git add frontend/src/components/Dashboard/ShelfList.tsx frontend/src/components/Dashboard/ShelfList.test.tsx frontend/src/components/common/FilterTabs.tsx frontend/src/components/common/FilterTabs.test.tsx
git commit -m "feat(R4): ShelfList 신설 — 1권일 때 숨김, FilterTabs 대시보드 톤으로 재단장"
```

---

### Task 7: Dashboard.tsx 조립 + 기존 테스트 재작성 + 죽은 코드 정리

**Files:**
- Modify: `frontend/src/pages/Dashboard.tsx`
- Modify: `frontend/src/pages/Dashboard.test.tsx`
- Modify: `frontend/src/pages/Dashboard.entering.test.tsx`
- Modify: `frontend/src/pages/Dashboard.error.test.tsx`
- Delete: `frontend/src/components/common/StatCard.tsx`
- Delete: `frontend/src/components/common/StatCard.test.tsx`
- Delete: `frontend/src/components/common/BookGrid.tsx`
- Delete: `frontend/src/components/common/BookGrid.test.tsx`
- Delete: `frontend/src/components/common/BookCard.tsx`
- Delete: `frontend/src/components/common/BookCard.test.tsx`

**Interfaces:**
- Consumes: `WelcomeBanner`(Task 4), `ContinueReadingHero`(Task 5), `ShelfList`+`DashFilter`(Task 6), 기존 `fetchCatalog`/`enterBook`/`routePathFor`.

**확인된 사실(2026-08-23 grep):** `BookGrid`·`BookCard`·`StatCard`는 `Dashboard.tsx` 외 다른 소비자가 없다. 재설계로 전부 쓰이지 않게 되므로 삭제한다 — 죽은 코드를 남기지 않는다(이 저장소의 기존 관행, `handoff-r4-design-polish.md` "죽은 스텁 삭제" 참조).

- [ ] **Step 1: Dashboard.tsx 재작성**

```tsx
// frontend/src/pages/Dashboard.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/common/Button';
import ContinueReadingHero from '../components/Dashboard/ContinueReadingHero';
import ShelfList, { type DashFilter } from '../components/Dashboard/ShelfList';
import WelcomeBanner from '../components/Dashboard/WelcomeBanner';
import Loading from '../components/common/Loading';
import Header from '../components/Layout/Header';
import { fetchCatalog } from '../services/bookService';
import { enterBook } from '../services/progressService';
import { routePathFor } from '../utils/routes';
import type { BookSummary } from '../types';

/**
 * 대시보드(서재) — 대시보드 재설계 시안 (2026-08-23)
 *
 * "이어읽기 히어로 + 책 목록" 구조. 그리드+통계 카드 구조를 대체한다(2026-08-20 초판).
 * 히어로는 선택된 한 권을 보여주고, 목록 행을 클릭하면 히어로의 미리보기만 바뀐다 —
 * 실제 진입(POST /entry)은 히어로의 "이어서 읽기" 버튼만 한다.
 *
 * 실제 카탈로그가 1권뿐이면(발표 전) `ShelfList`가 스스로 숨는다 — 이 화면도 그 경우엔
 * 히어로 하나만 남는다(2026-08-22 크리틱 "도서 1권 문제"의 결론).
 */
export default function Dashboard() {
  const navigate = useNavigate();
  const [books, setBooks] = useState<BookSummary[] | null>(null);
  const [filter, setFilter] = useState<DashFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState(false);
  const [enteringId, setEnteringId] = useState<string | null>(null);

  const loadCatalog = useCallback(() => {
    setCatalogError(false);
    void fetchCatalog()
      .then((response) => setBooks(response.books))
      .catch(() => setCatalogError(true));
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const selectedBook = useMemo(() => {
    if (!books || books.length === 0) return null;
    return books.find((book) => book.book_id === selectedId) ?? books[0];
  }, [books, selectedId]);

  const visibleBooks = useMemo(() => {
    if (!books) return [];
    if (filter === 'reading') return books.filter((book) => book.progress);
    if (filter === 'done') return []; // 완독 판정 데이터 없음 (스펙 §7 #1)
    return books;
  }, [books, filter]);

  const emptyMessage =
    filter === 'done'
      ? '완독 여부를 판정할 데이터가 아직 없습니다'
      : filter === 'reading'
        ? '읽던 도서가 아직 없습니다'
        : '서재에 도서가 아직 없습니다';

  async function handleResume() {
    if (!selectedBook || enteringId) return;
    setEnteringId(selectedBook.book_id);
    try {
      const entry = await enterBook(selectedBook.book_id);
      navigate(routePathFor(selectedBook.book_id, entry), { state: { entry } });
    } catch {
      setEnteringId(null);
    }
  }

  if (catalogError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-dash-paper px-6 text-center">
        <p role="alert" className="text-[13px] text-dash-muted">
          서재를 불러오지 못했습니다
        </p>
        <Button onClick={loadCatalog}>다시 시도</Button>
      </div>
    );
  }

  if (!books) return <Loading message="서재를 여는 중" />;

  if (!selectedBook) {
    return (
      <div className="min-h-full bg-dash-paper">
        <Header />
        <main className="mx-auto w-full max-w-page px-[38px] py-6">
          <WelcomeBanner />
          <p className="py-16 text-center text-[13px] text-dash-muted">서재에 도서가 아직 없습니다</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-dash-paper font-dashSans">
      <Header />

      <main className="mx-auto w-full max-w-page px-[38px] py-6">
        <WelcomeBanner />

        <ContinueReadingHero
          book={selectedBook}
          onResume={handleResume}
          busy={enteringId === selectedBook.book_id}
        />

        <ShelfList
          books={books}
          visibleBooks={visibleBooks}
          selectedId={selectedBook.book_id}
          onPreview={(book) => setSelectedId(book.book_id)}
          filter={filter}
          onFilterChange={setFilter}
          emptyMessage={emptyMessage}
        />
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Dashboard.test.tsx 재작성**

```tsx
// frontend/src/pages/Dashboard.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './Dashboard';
import type { BookSummary } from '../types';

const reading: BookSummary = {
  book_id: 'takryu', title: '탁류', author: '채만식', cover_url: '',
  intro_summary: null, ssabi_ready: true, progress: { current_page: 72, percent: 25.3 },
};
const unread: BookSummary = {
  book_id: 'other', title: '다른 책', author: '아무개', cover_url: '',
  intro_summary: null, ssabi_ready: true,
};

vi.mock('../services/bookService', () => ({
  fetchCatalog: async () => ({ books: [reading, unread] }),
}));
vi.mock('../services/progressService', () => ({
  enterBook: async () => ({ route: 'briefing', page: 1, is_new_session: true, session_epoch: 1 }),
}));

function renderDashboard() {
  return render(<MemoryRouter><Dashboard /></MemoryRouter>);
}

describe('Dashboard', () => {
  it('첫 번째 책이 기본 히어로로 뜬다', async () => {
    renderDashboard();
    expect(await screen.findByRole('heading', { level: 2, name: '탁류' })).toBeInTheDocument();
    expect(screen.getByText('25.3% 완료')).toBeInTheDocument();
  });

  it('목록 행을 클릭하면 이동 없이 히어로 미리보기만 바뀐다', async () => {
    renderDashboard();
    await screen.findByRole('heading', { level: 2, name: '탁류' });

    await userEvent.click(screen.getByRole('button', { name: '다른 책 선택' }));

    expect(screen.getByRole('heading', { level: 2, name: '다른 책' })).toBeInTheDocument();
    expect(screen.getByText('새로 시작하기')).toBeInTheDocument();
    // 이동하지 않았다 — 진입 API 를 부르지 않았으므로 여전히 대시보드
    expect(screen.getByText('내 서재')).toBeInTheDocument();
  });

  it('필터 탭은 클라이언트 필터다 — 목록에만 적용되고 히어로는 그대로다 (스펙 §7 #2)', async () => {
    renderDashboard();
    await screen.findByRole('heading', { level: 2, name: '탁류' });

    await userEvent.click(screen.getByRole('button', { name: '읽는 중' }));
    expect(screen.getByRole('button', { name: /탁류 선택/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /다른 책 선택/ })).not.toBeInTheDocument();
    // 히어로는 필터와 무관 — 여전히 탁류
    expect(screen.getByRole('heading', { level: 2, name: '탁류' })).toBeInTheDocument();
  });

  it('완독 필터는 데이터가 없어 비지만, 백지 대신 그 이유를 말한다', async () => {
    renderDashboard();
    await screen.findByRole('heading', { level: 2, name: '탁류' });
    await userEvent.click(screen.getByRole('button', { name: '완독' }));
    expect(screen.getByText('완독 여부를 판정할 데이터가 아직 없습니다')).toBeInTheDocument();
  });

  it('책이 1권뿐이면 서재 목록 섹션이 아예 없다 (2026-08-22 크리틱 결론)', async () => {
    const { fetchCatalog } = await import('../services/bookService');
    (fetchCatalog as unknown as { mockResolvedValueOnce?: unknown }) && vi.mocked(fetchCatalog).mockResolvedValueOnce({ books: [reading] });
    renderDashboard();
    await screen.findByRole('heading', { level: 2, name: '탁류' });
    expect(screen.queryByText('내 서재')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '전체' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Dashboard.entering.test.tsx 재작성**

```tsx
// frontend/src/pages/Dashboard.entering.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './Dashboard';
import type { BookSummary } from '../types';

const book: BookSummary = {
  book_id: 'takryu', title: '탁류', author: '채만식', cover_url: '',
  intro_summary: null, ssabi_ready: true, progress: { current_page: 80, percent: 64 },
};

let enterCalls = 0;

vi.mock('../services/bookService', () => ({
  fetchCatalog: async () => ({ books: [book] }),
}));
vi.mock('../services/progressService', () => ({
  enterBook: () => {
    enterCalls += 1;
    return new Promise(() => {}); // 해소하지 않는다 — 진행 중 상태에 머문다
  },
}));

describe('Dashboard — 도서 선택 중', () => {
  beforeEach(() => {
    enterCalls = 0;
  });

  it('이어서 읽기 왕복 중에는 버튼이 잠기고, 연타해도 진입 요청이 한 번만 나간다', async () => {
    render(<MemoryRouter><Dashboard /></MemoryRouter>);

    const button = await screen.findByRole('button', { name: '이어서 읽기' });
    await userEvent.click(button);

    expect(enterCalls).toBe(1);
    expect(screen.getByRole('button', { name: '여는 중' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: '여는 중' }));
    expect(enterCalls).toBe(1);
  });
});
```

- [ ] **Step 4: Dashboard.error.test.tsx 확인**

`frontend/src/pages/Dashboard.error.test.tsx`는 `bg-dash-paper` 클래스 변경 외 마크업 구조(role="alert" + 재시도 버튼)가 그대로라 **수정 없이** 통과해야 한다 — 먼저 그대로 실행해서 확인하고, 실패하면 그때만 손댄다.

Run: `cd frontend && npx vitest run src/pages/Dashboard.error.test.tsx`
Expected: PASS (수정 불필요 확인)

- [ ] **Step 5: 죽은 코드 삭제**

```bash
git rm frontend/src/components/common/StatCard.tsx frontend/src/components/common/StatCard.test.tsx
git rm frontend/src/components/common/BookGrid.tsx frontend/src/components/common/BookGrid.test.tsx
git rm frontend/src/components/common/BookCard.tsx frontend/src/components/common/BookCard.test.tsx
```

- [ ] **Step 6: 전체 테스트 실행 및 실패 확인**

Run: `cd frontend && npx vitest run`
Expected: 처음엔 FAIL — Dashboard.tsx가 아직 이전 컴포넌트를 참조하거나 새 테스트가 새 구조를 요구하는 상태.

- [ ] **Step 7: 실패 원인 정리하며 통과할 때까지 반복**

Dashboard.tsx·각 테스트 파일을 Step 1~4의 내용과 정확히 맞춘 뒤 재실행. 특히 다음을 확인한다.
- `BookGrid`/`BookCard`/`StatCard`를 import하는 곳이 하나도 남지 않았는지 (`grep -rn "BookGrid\|BookCard\|StatCard" frontend/src`가 테스트 스냅샷·주석 외 0건이어야 한다)
- App 통합 테스트(`App.*.test.tsx`)가 대시보드 진입 지점에서 쓰던 셀렉터(`findByRole('button', {name: /탁류/})` 등)가 새 구조(목록 행 `aria-label="탁류 선택"` 또는 히어로 버튼 `이어서 읽기`)와 맞는지. 1권 카탈로그로 렌더되는 통합 테스트는 목록이 숨어 히어로만 남으므로 버튼 이름이 `이어서 읽기`로 바뀐다 — 깨지는 케이스가 있으면 셀렉터를 그에 맞게 고친다(단언을 약화하지 않는다).

Run: `cd frontend && npx vitest run`
Expected: PASS 전부.

- [ ] **Step 8: 전체 검증**

Run: `cd frontend && npx tsc --noEmit && npx eslint src --ext ts,tsx`
Expected: tsc 0건, eslint 0건.

- [ ] **Step 9: 커밋**

```bash
git add frontend/src/pages/Dashboard.tsx frontend/src/pages/Dashboard.test.tsx frontend/src/pages/Dashboard.entering.test.tsx frontend/src/pages/Dashboard.error.test.tsx
git commit -m "feat(R4): 대시보드를 이어읽기 히어로+서재 목록 구조로 재설계, 죽은 그리드/통계 컴포넌트 삭제"
```

- [ ] **Step 10: 사용자 확인 게이트 (push 전 필수)**

`feature/R4-query-endpoints`는 `frontend/` 변경을 push하면 바로 라이브 배포된다. 이 태스크까지 로컬 커밋만 하고, **사용자에게 실제 화면(로컬 dev 서버)을 보여주고 명시적으로 확인받기 전에는 push하지 않는다.** 확인 후 push는 별도 승인 단계로 취급한다.

---

## Self-Review 체크리스트 (계획 작성자가 실행함)

1. **스펙 커버리지** — 대시보드 히어로 구조✓(Task5) · 목록 구조✓(Task6) · 폰트/색 교체✓(Task1) · 워드마크✓(Task3) · 인사 섹션✓(Task4) · 1권 숨김 Ruling✓(Task6) · total_pages 미보유 반영✓(Task5) · 완독 데이터 없음 유지✓(Task6,7) · 미완비 도서 게이트✓(Task5) · push 전 확인 게이트✓(Task7 Step10). 갭 없음.
2. **플레이스홀더 스캔** — 전 태스크 코드 완전 작성, "TODO"·"나중에" 없음.
3. **타입 일관성** — `DashFilter`는 Task6에서 정의해 Task7이 그대로 import한다. `BookSummary.progress`는 전 태스크에서 `{ current_page: number; percent: number } | undefined`로 일관 사용. `ContinueReadingHero`/`ShelfList`/`WelcomeBanner`의 props 이름이 Task7 조립부와 정확히 일치한다.
