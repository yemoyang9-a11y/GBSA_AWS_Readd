# 브리핑 화면 재설계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 브리핑 화면(`BriefingView.tsx`)을 확정된 목업(`.brief-scr` 스코프)대로 정확히 구현한다 — 표지·인사·진도 패널·리캡·**접었다 펼 수 있는 목차**까지 전부.

**Architecture:** 대시보드 재설계 때 만든 `dash-*` 서체 토큰(Pretendard/Noto Serif KR/DM Mono)은 재사용하되, 색은 브리핑 전용 `brief-*` 네임스페이스로 새로 만든다(브리핑은 보라 액센트, 대시보드는 무채색 — 서로 다른 팔레트). `TypographicCover`·`ProgressBar`는 이미 대시보드에서 variant 패턴을 만들어 뒀으므로 같은 방식으로 `brief` 옵션을 추가한다. 표지 override는 대시보드 로컬 코드에 있던 것을 공용 유틸로 뽑아 두 화면이 같이 쓴다. 목차 접기/펼치기는 원본의 JS(scrollHeight 측정) 대신 React 선언적 트랜지션(`max-h-0` ↔ `max-h-[1000px]`)으로 단순화한다 — 항목 수가 적어 임의 상한으로 충분하다.

**Tech Stack:** React 18 + TypeScript, Tailwind CSS, Vitest + Testing Library.

**Spec:** https://claude.ai/code/artifact/7cbdf443-c597-405c-b453-02d3d0a8c17f — `.brief-scr` 스코프. Claude Artifact이며 저장소 파일이 아니다. 실측값은 이 계획의 Global Constraints와 각 태스크 코드에 그대로 옮겨져 있다.

## Global Constraints

- **색·모서리·그림자 실측값** (`.brief-scr` CSS 변수, 그대로 옮긴다):
  ```
  paper:#fbf8f2  ink:#2a2620  muted:#8c8473  line:#ece6d8  rule:#d3c6a8
  accent:#4b3fd6  accent-soft:#f1effc
  shadow: 0 10px 24px rgba(42,38,32,.07), 0 2px 6px rgba(42,38,32,.05)
  shadow-sm: 0 4px 10px rgba(42,38,32,.08)
  radius:14px  radius-sm:10px
  ```
- **서체는 새로 안 만든다.** 대시보드 재설계가 만든 `font-dashSerif`(Noto Serif KR)·`font-dashSans`(Pretendard)·`font-dashMono`(DM Mono)를 그대로 쓴다 — 값이 완전히 같다.
- **목차는 여전히 표시 전용이다** (FR-BRF-004, D12 🚦). 목차 `<ul>` 안에 `a`/`button`이 0개여야 한다 — 접기/펼치기 토글 버튼은 `<ul>` **밖의 형제 요소**로 둔다.
- **리캡 3분기 판정(`resolveBriefingView`)과 폴백 1회 호출 가드는 건드리지 않는다.** 이번 작업은 레이아웃·상호작용뿐이다.
- **`GET /books/:id/info`에 `cover_url`이 없다.** 실제 표지는 로컬 override(`takryu` → `/covers/takryu.jpg`)로 채운다 — 없는 API 필드를 지어내지 않는다.
- **"마저 읽기" → "이어서 읽기"** 로 문구를 바꾼다(2026-08-22 사용자 결정, 지금까지 코드에 반영된 적 없음). 관련 테스트 전부 함께 고친다.
- 목차 기본 상태는 **접힘**이다(2026-08-22 사용자 확정).

---

### Task 1: 표지 override 공용 유틸 추출 + 브리핑 전용 디자인 토큰

**Files:**
- Create: `frontend/src/utils/coverOverrides.ts`
- Modify: `frontend/src/pages/Dashboard.tsx` (로컬 `COVER_OVERRIDES` 제거, 공용 유틸로 교체)
- Test: `frontend/src/utils/coverOverrides.test.ts`
- Modify: `frontend/tailwind.config.js`
- Test: `frontend/src/pages/__tests__/briefTokens.test.ts`

**Interfaces:**
- Produces: `resolveCoverUrl(bookId: string, coverUrl: string | null | undefined): string | null`(값이 없고 override도 없으면 원래 값 그대로 반환). Task 4가 브리핑에서, `Dashboard.tsx`가 계속 대시보드에서 이 함수를 쓴다.
- Produces: Tailwind 클래스 `text-brief-ink`·`text-brief-muted`·`border-brief-line`·`bg-brief-paper`·`text-brief-accent`·`bg-brief-accent`·`bg-brief-accent-soft`·`bg-brief-rule`, `rounded-brief-panel`(14px)·`rounded-brief-card`(10px), `shadow-brief-soft`·`shadow-brief-soft-sm`, `height.brief-cover`(230px)·`width.brief-cover`(168px).

- [ ] **Step 1: 실패하는 테스트 작성 — coverOverrides**

```ts
// frontend/src/utils/coverOverrides.test.ts
import { describe, expect, it } from 'vitest';
import { resolveCoverUrl } from './coverOverrides';

describe('resolveCoverUrl', () => {
  it('override가 있고 cover_url이 비어 있으면 override를 쓴다', () => {
    expect(resolveCoverUrl('takryu', '')).toBe('/covers/takryu.jpg');
  });

  it('override가 있고 cover_url이 null이어도 override를 쓴다', () => {
    expect(resolveCoverUrl('takryu', null)).toBe('/covers/takryu.jpg');
  });

  it('실제 cover_url이 있으면 그대로 쓴다 — override로 덮지 않는다', () => {
    expect(resolveCoverUrl('takryu', 'https://real/cover.jpg')).toBe('https://real/cover.jpg');
  });

  it('override가 없는 book_id는 원래 값을 그대로 돌려준다', () => {
    expect(resolveCoverUrl('other-book', '')).toBe('');
    expect(resolveCoverUrl('other-book', null)).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && npx vitest run src/utils/coverOverrides.test.ts`
Expected: FAIL — 파일이 없다.

- [ ] **Step 3: 구현**

```ts
// frontend/src/utils/coverOverrides.ts
/**
 * 표지 override — 실제 API의 cover_url이 비어 있을 때만 화면에서 대신 채운다.
 * 서버 응답을 고치는 게 아니라 표시만 바꾸는 것이라 지어낸 데이터는 아니다.
 * R1 파이프라인이 실제 cover_url을 채워주면 이 표는 지운다.
 *
 * 대시보드 재설계(2026-08-23)에서 처음 만들었고, 브리핑 재설계에서 두 번째로 쓰게 되면서
 * 공용 유틸로 뽑았다(DRY) — `GET /books`(BookSummary)와 `GET /books/:id/info`
 * (BookInfoResponse.basic_info) 둘 다 cover_url이 없거나 비어 있을 수 있다.
 */
const COVER_OVERRIDES: Record<string, string> = {
  takryu: '/covers/takryu.jpg',
};

export function resolveCoverUrl(
  bookId: string,
  coverUrl: string | null | undefined
): string | null {
  if (!coverUrl && COVER_OVERRIDES[bookId]) return COVER_OVERRIDES[bookId];
  return coverUrl ?? null;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd frontend && npx vitest run src/utils/coverOverrides.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Dashboard.tsx를 공용 유틸로 교체**

`frontend/src/pages/Dashboard.tsx`에서 로컬 `COVER_OVERRIDES` 상수와 그 주석 블록을 전부 삭제하고, import를 추가한 뒤 `displayBooks` 계산부를 바꾼다.

삭제할 블록(정확히 이 문자열):
```ts
/**
 * 표지 override(2026-08-23, 사용자 제공) — `GET /books`의 cover_url이 비어 있을 때만
 * 화면에서 대신 채운다. 서버 응답을 고치는 게 아니라 표시만 바꾸는 것이라 지어낸 데이터는
 * 아니다 — R1 파이프라인이 실제 cover_url을 채워주면 이 표는 지운다.
 */
const COVER_OVERRIDES: Record<string, string> = {
  takryu: '/covers/takryu.jpg',
};
```

추가할 import (`DEMO_SHELF_BOOKS` import 바로 아래):
```ts
import { resolveCoverUrl } from '../utils/coverOverrides';
```

`displayBooks` 안의 `realBooksWithCover` 계산부를 바꾼다 — 기존:
```ts
    const realBooksWithCover = books.map((book) =>
      !book.cover_url && COVER_OVERRIDES[book.book_id]
        ? { ...book, cover_url: COVER_OVERRIDES[book.book_id] }
        : book
    );
```
다음으로 교체:
```ts
    const realBooksWithCover = books.map((book) => ({
      ...book,
      cover_url: resolveCoverUrl(book.book_id, book.cover_url) ?? '',
    }));
```

- [ ] **Step 6: Dashboard 회귀 확인**

Run: `cd frontend && npx vitest run src/pages/Dashboard.tsx src/pages/Dashboard.test.tsx`

(vitest가 `.tsx`를 테스트로 인식하지 않으므로 실제로는 아래를 실행한다)

Run: `cd frontend && npx vitest run src/pages/Dashboard.test.tsx`
Expected: PASS 전부 — 탁류 표지가 여전히 `/covers/takryu.jpg`로 뜬다(동작 동일, 값 출처만 유틸로 이동).

- [ ] **Step 7: 실패하는 토큰 테스트 작성**

```ts
// frontend/src/pages/__tests__/briefTokens.test.ts
import { describe, expect, it } from 'vitest';
import config from '../../../tailwind.config.js';

describe('브리핑 재설계 — 신규 토큰', () => {
  it('brief 색 토큰이 시안 실측값과 일치한다', () => {
    const brief = (config.theme!.extend!.colors as Record<string, unknown>).brief as Record<
      string,
      string
    >;
    expect(brief.paper).toBe('#fbf8f2');
    expect(brief.ink).toBe('#2a2620');
    expect(brief.muted).toBe('#8c8473');
    expect(brief.line).toBe('#ece6d8');
    expect(brief.rule).toBe('#d3c6a8');
    expect(brief.accent).toBe('#4b3fd6');
    expect(brief['accent-soft']).toBe('#f1effc');
  });

  it('brief 라운드·그림자·표지 크기 토큰이 있다', () => {
    const radius = config.theme!.extend!.borderRadius as Record<string, string>;
    const shadow = config.theme!.extend!.boxShadow as Record<string, string>;
    const height = config.theme!.extend!.height as Record<string, string>;
    const width = config.theme!.extend!.width as Record<string, string>;
    expect(radius['brief-panel']).toBe('14px');
    expect(radius['brief-card']).toBe('10px');
    expect(shadow['brief-soft']).toBe('0 10px 24px rgba(42, 38, 32, 0.07), 0 2px 6px rgba(42, 38, 32, 0.05)');
    expect(shadow['brief-soft-sm']).toBe('0 4px 10px rgba(42, 38, 32, 0.08)');
    expect(height['brief-cover']).toBe('230px');
    expect(width['brief-cover']).toBe('168px');
  });
});
```

- [ ] **Step 8: 실패 확인**

Run: `cd frontend && npx vitest run src/pages/__tests__/briefTokens.test.ts`
Expected: FAIL — `colors.brief`가 없다.

- [ ] **Step 9: tailwind.config.js에 토큰 추가**

`colors` 블록의 `dash` 다음에 추가:
```js
        brief: {
          // 브리핑 재설계 전용(2026-08-23 시안 확정). 대시보드(dash-*, 무채색)와 달리
          // 보라 액센트를 쓴다 — 화면마다 팔레트가 다르므로 섞지 않는다.
          paper: '#fbf8f2',
          ink: '#2a2620',
          muted: '#8c8473',
          line: '#ece6d8',
          rule: '#d3c6a8',
          accent: '#4b3fd6',
          'accent-soft': '#f1effc',
        },
```

`borderRadius` 블록에 추가:
```js
        'brief-panel': '14px',
        'brief-card': '10px',
```

`boxShadow` 블록에 추가:
```js
        'brief-soft': '0 10px 24px rgba(42, 38, 32, 0.07), 0 2px 6px rgba(42, 38, 32, 0.05)',
        'brief-soft-sm': '0 4px 10px rgba(42, 38, 32, 0.08)',
```

`height` 블록에 추가: `'brief-cover': '230px',`
`width` 블록에 추가: `'brief-cover': '168px',`

- [ ] **Step 10: 테스트 통과 확인**

Run: `cd frontend && npx vitest run src/pages/__tests__/briefTokens.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 11: 전체 검증 및 커밋**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: tsc 0건, 전체 테스트 통과(회귀 없음).

```bash
git add frontend/src/utils/coverOverrides.ts frontend/src/utils/coverOverrides.test.ts frontend/src/pages/Dashboard.tsx frontend/tailwind.config.js frontend/src/pages/__tests__/briefTokens.test.ts
git commit -m "feat(R4): 표지 override 공용 유틸 추출 + 브리핑 재설계 토큰 추가"
```

---

### Task 2: TypographicCover에 'brief' 크기 변형 추가

**Files:**
- Modify: `frontend/src/components/common/TypographicCover.tsx`
- Modify: `frontend/src/components/common/TypographicCover.test.tsx`

**Interfaces:**
- Consumes: Task 1의 `h-brief-cover`·`w-brief-cover`·`rounded-brief-panel`·`shadow-brief-soft`·`font-dashSerif`·`font-dashSans` 클래스.
- Produces: `size` 유니온에 `'brief'` 추가(기존 `'card'|'hero'|'row'` 그대로 유지). Task 4가 `size="brief"`로 소비한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`TypographicCover.test.tsx`의 `size 변형` describe 블록 안에 추가:

```tsx
  it('size="brief"는 168×230 고정 크기에 14px 라운드와 그림자를 쓴다', () => {
    render(<TypographicCover title="탁류" author="채만식" coverUrl="" size="brief" />);
    const cover = screen.getByTestId('typographic-cover');
    expect(cover.className).toContain('w-brief-cover');
    expect(cover.className).toContain('h-brief-cover');
    expect(cover.className).toContain('rounded-brief-panel');
    expect(cover.className).toContain('shadow-brief-soft');
    expect(screen.getByText('탁류').className).toContain('font-dashSerif');
  });

  it('size="brief"에 coverUrl이 있으면 이미지가 같은 크기·라운드·그림자를 쓴다', () => {
    render(
      <TypographicCover title="탁류" author="채만식" coverUrl="/covers/takryu.jpg" size="brief" />
    );
    const img = screen.getByRole('img');
    expect(img.className).toContain('w-brief-cover');
    expect(img.className).toContain('h-brief-cover');
    expect(img.className).toContain('rounded-brief-panel');
    expect(img.className).toContain('shadow-brief-soft');
  });
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && npx vitest run src/components/common/TypographicCover.test.tsx`
Expected: FAIL — `size="brief"`가 아직 `'card'`처럼 처리되어 `h-cover`(240px)로 렌더된다.

- [ ] **Step 3: 구현**

`TypographicCover.tsx`를 다음 diff대로 고친다. `size` 유니온과 각 분기 변수를 갱신한다.

```tsx
  size?: 'card' | 'hero' | 'row' | 'brief';
}) {
  const dim = dimmed ? ' opacity-60' : '';
  const isDash = size === 'hero' || size === 'row';
  const isBrief = size === 'brief';
  const heightClass =
    size === 'hero' ? 'h-hero-cover' : size === 'row' ? 'h-row-cover' : size === 'brief' ? 'h-brief-cover' : 'h-cover';
  const widthClass = size === 'row' || size === 'brief' ? `w-${size === 'row' ? 'row' : 'brief'}-cover flex-none` : 'w-full';
  const roundedClass =
    size === 'card'
      ? ' rounded-cover'
      : size === 'hero'
        ? ' rounded-dash-hero-cover'
        : size === 'row'
          ? ' rounded-dash-row-cover'
          : ' rounded-brief-panel';
  const shadowClass = isBrief ? ' shadow-brief-soft' : '';
  const titleFont = isDash ? 'font-dashSerif' : isBrief ? 'font-dashSerif' : 'font-serif';
  const titleSize = size === 'row' ? 'text-xs' : size === 'hero' || size === 'brief' ? 'text-xl' : 'text-2xl';
  const authorFont = isDash || isBrief ? 'font-dashSans' : 'font-sans';
  const borderColor = isBrief ? '' : isDash ? 'border-dash-line' : 'border-line';
  const bgColor = isBrief ? 'bg-white' : isDash ? 'bg-dash-paper' : 'bg-canvas';
```

**주의:** `widthClass`의 템플릿 리터럴(`` `w-${...}-cover flex-none` ``)은 Tailwind의 정적 스캐너가 문자열을 그대로 스캔하지 못해 CSS가 생성되지 않는다 — **이렇게 쓰면 안 된다.** 아래처럼 완전한 리터럴로 분기한다:

```tsx
  const widthClass = size === 'row' ? 'w-row-cover flex-none' : size === 'brief' ? 'w-brief-cover flex-none' : 'w-full';
```

이미지 분기(`coverUrl` 있을 때)와 폴백 분기(`div`) 둘 다 `shadowClass`를 이어붙인다:

```tsx
  if (coverUrl) {
    return (
      <img
        src={coverUrl}
        alt={`${title} 표지`}
        className={`${heightClass} ${widthClass}${roundedClass}${shadowClass} object-cover${dim}`}
      />
    );
  }

  return (
    <div
      className={`flex ${heightClass} ${widthClass} flex-col items-center justify-center gap-3${roundedClass}${shadowClass}${borderColor ? ` border ${borderColor}` : ''} ${bgColor} px-6 text-center${dim}`}
      data-testid="typographic-cover"
      aria-hidden="true"
    >
      <span className={`${titleFont} ${titleSize} font-bold leading-snug text-ink`}>{title}</span>
      <span className="h-px w-8 bg-line" />
      <span className={`${authorFont} text-xs text-muted`}>{author}</span>
    </div>
  );
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd frontend && npx vitest run src/components/common/TypographicCover.test.tsx`
Expected: PASS 전부(기존 8개 + 신규 2개 = 10개).

- [ ] **Step 5: 회귀 확인 (card/hero/row 소비자)**

Run: `cd frontend && npx vitest run src/pages/Dashboard.test.tsx src/components/Dashboard/`
Expected: PASS — `brief` 분기 추가가 기존 `card`/`hero`/`row` 로직을 건드리지 않는다.

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/components/common/TypographicCover.tsx frontend/src/components/common/TypographicCover.test.tsx
git commit -m "feat(R4): TypographicCover에 brief 크기 변형 추가 — 168×230, 14px 라운드+그림자"
```

---

### Task 3: ProgressBar에 'brief' 톤 + 6px 크기 변형 추가

**Files:**
- Modify: `frontend/src/components/Reader/ProgressBar.tsx`
- Modify: `frontend/src/components/Reader/ProgressBar.test.tsx`

**Interfaces:**
- Consumes: Task 1의 `bg-brief-accent`·`bg-brief-line` 클래스.
- Produces: `tone` 유니온에 `'brief'` 추가, `size?: 'sm' | 'md'` 신규(기본 `'sm'`=기존 4px 그대로). Task 4가 `tone="brief" size="md"`로 소비한다.

**확인된 사실:** 기존 트랙 라운드는 `rounded-sm`(2px)인데 4px 높이 바에서는 이미 시각적으로 완전한 pill과 동일하다(반지름=높이/2). 6px 높이에서 같은 시각 효과를 내려면 `rounded-full`이 더 안전하다 — 높이에 무관하게 항상 완전한 pill이 되므로 이번에 `rounded-sm`을 `rounded-full`로 통일한다(4px 바의 렌더 결과는 바뀌지 않는다).

- [ ] **Step 1: 실패하는 테스트 작성**

`ProgressBar.test.tsx` 끝에 추가:

```tsx
describe('brief 톤·size (2026-08-23 브리핑 재설계)', () => {
  it('tone="brief"는 brief-accent 채움·brief-line 트랙을 쓴다', () => {
    render(<ProgressBar percent={50} tone="brief" />);
    expect(screen.getByTestId('progress-fill').className).toContain('bg-brief-accent');
    expect(screen.getByRole('progressbar').className).toContain('bg-brief-line');
  });

  it('size="md"는 6px 높이(h-1.5)를 쓴다 — 기본은 4px(h-1) 그대로', () => {
    render(<ProgressBar percent={50} />);
    expect(screen.getByRole('progressbar').className).toContain('h-1 ');

    render(<ProgressBar percent={50} size="md" />);
    expect(screen.getAllByRole('progressbar')[1].className).toContain('h-1.5');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && npx vitest run src/components/Reader/ProgressBar.test.tsx`
Expected: FAIL — `tone="brief"`가 타입 에러거나 무시되고, `size` prop이 없다.

- [ ] **Step 3: 구현**

`ProgressBar.tsx` 전체를 다음으로 교체:

```tsx
/**
 * 진도 바 — 브리핑·대시보드 전용이다.
 * 읽기 화면에는 두지 않는다. 읽기 화면은 페이지 번호만 표시한다 (FR-PRG-004).
 * percent 는 서버가 내려준 값을 그대로 받는다 (FR-BRF-005 🚦).
 *
 * 시안: 트랙 4px(#ebe6e0) / 채움(#1c1b1a). tone="accent"는 브리핑 옛 버전이 accent(#3b3db2)
 * 채움을 쓰던 것 — brief 재설계(2026-08-23) 이후 브리핑은 tone="brief"(보라 #4b3fd6,
 * size="md" 6px)를 쓴다. 대시보드 도서 카드는 tone 기본값(ink)을 유지한다.
 *
 * ⚠️ 막대 폭은 표시상 0~100으로 자르되 `aria-valuenow` 는 **서버 값 그대로** 둔다.
 *    값을 보정해서 내보내면 그 순간 프론트가 파생값을 만든 게 된다 (절대 규칙 2번).
 */
export default function ProgressBar({
  percent,
  tone = 'ink',
  size = 'sm',
}: {
  percent: number;
  tone?: 'ink' | 'accent' | 'dash' | 'brief';
  size?: 'sm' | 'md';
}) {
  const width = Math.min(Math.max(percent, 0), 100);
  const fillClass =
    tone === 'accent'
      ? 'bg-accent'
      : tone === 'dash'
        ? 'bg-dash-ink'
        : tone === 'brief'
          ? 'bg-brief-accent'
          : 'bg-ink';
  const trackClass = tone === 'dash' ? 'bg-dash-line' : tone === 'brief' ? 'bg-brief-line' : 'bg-line';
  const heightClass = size === 'md' ? 'h-1.5' : 'h-1';

  return (
    <div
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      className={`${heightClass} w-full overflow-hidden rounded-full ${trackClass}`}
    >
      <div
        data-testid="progress-fill"
        className={`h-full ${fillClass}`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd frontend && npx vitest run src/components/Reader/ProgressBar.test.tsx`
Expected: PASS 전부.

- [ ] **Step 5: 회귀 확인 (기존 tone 소비자 — 대시보드·기존 브리핑 accent 경로)**

Run: `cd frontend && npx vitest run src/pages/Dashboard.test.tsx src/components/Dashboard/ContinueReadingHero.test.tsx src/pages/BriefingView.test.tsx`
Expected: PASS — `rounded-sm`→`rounded-full` 변경이 시각적으로 동일해 회귀 없음. `tone="accent"` 경로(아직 Task 4 전이라 BriefingView가 이걸 씀)는 그대로 유지된다.

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/components/Reader/ProgressBar.tsx frontend/src/components/Reader/ProgressBar.test.tsx
git commit -m "feat(R4): ProgressBar에 brief 톤 + md(6px) 크기 추가, 트랙 라운드를 rounded-full로 통일"
```

---

### Task 4: BriefingView.tsx 재조립 (표지·구분선·진도 패널·리캡·접이식 목차) + Briefing.tsx 표지 연결

**Files:**
- Modify: `frontend/src/pages/BriefingView.tsx`
- Modify: `frontend/src/pages/Briefing.tsx`

**Interfaces:**
- Consumes: `TypographicCover`(size="brief"), `ProgressBar`(tone="brief" size="md"), `resolveCoverUrl`(Task 1).
- `BriefingView`에 `coverUrl?: string | null` prop 신규 추가. `Briefing.tsx`가 `resolveCoverUrl(bookId, info.basic_info로부터는 없으므로 undefined)`을 계산해 넘긴다 — `BookInfoResponse.basic_info`에 `cover_url` 필드 자체가 없으므로 항상 `resolveCoverUrl(bookId, null)`을 호출하는 형태가 된다(override map에 있으면 나오고 없으면 null).

**Ruling(계획에 포함) — 목차 접기/펼치기는 선언적으로 단순화한다:** 원본 JS는 `scrollHeight`를 측정해 `max-height`를 정확히 맞춘 뒤 트랜지션이 끝나면 `none`으로 푸는 방식이다(콘텐츠가 나중에 커져도 안전하게 하려는 목적). 이 화면의 목차는 도서 1권당 장 수가 많아야 20~30개 수준으로 유한하고 늘어나지 않으므로, React에서는 `useState(false)` + Tailwind `max-h-0 opacity-0` ↔ `max-h-[1000px] opacity-100` 트랜지션으로 충분하다 — `scrollHeight` DOM 측정과 `transitionend` 리스너를 안 써도 같은 체감 애니메이션이 나온다. **틀렸을 때 비용**: 장이 1000px 분량(대략 60줄 이상)을 넘는 예외적인 책이 생기면 그 책에서만 펼침 트랜지션이 스냅되듯 보인다 — 그때 실제 `scrollHeight` 측정 방식으로 바꾼다.

- [ ] **Step 1: 실패하는 테스트 작성 — 문구 변경 + 접이식 목차**

`BriefingView.test.tsx`에서 기존 "자가 검증 22" 테스트의 버튼 이름을 바꾸고, 목차 접기/펼치기 테스트 2개를 추가한다.

기존(파일 92~109줄)을 찾아 버튼 이름만 교체:
```tsx
  it("자가 검증 22 / UC-28 E1: 리캡이 실패해도 '이어서 읽기'는 동작한다", async () => {
    const onContinue = vi.fn();
    render(
      <BriefingView
        {...baseProps}
        briefing={briefing({ recap: null })}
        recapFailed={true}
        onContinue={onContinue}
      />
    );

    const button = screen.getByRole('button', { name: '이어서 읽기' });
    expect(button).toBeEnabled();

    // 눌리는 것까지 확인한다 — 활성 상태만으로는 동작을 보장하지 못한다
    await userEvent.click(button);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
```

파일 끝(`});` 직전, 마지막 `it` 다음)에 추가:
```tsx
  it('목차는 기본이 접힘이다 — 펼치기 전에는 화면에서 안 보인다(max-h-0)', () => {
    render(<BriefingView {...baseProps} briefing={briefing()} />);
    const panel = screen.getByRole('list', { name: '목차' }).closest('div')!;
    expect(panel.className).toContain('max-h-0');
  });

  it('목차 토글을 누르면 펼쳐지고, 다시 누르면 접힌다', async () => {
    render(<BriefingView {...baseProps} briefing={briefing()} />);

    const toggle = screen.getByRole('button', { name: /목차/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const panel = screen.getByRole('list', { name: '목차' }).closest('div')!;
    expect(panel.className).toContain('max-h-[1000px]');

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('현재 장 행만 강조된다', () => {
    render(<BriefingView {...baseProps} briefing={briefing()} />);
    const current = screen.getByText('제3장 신판 흥부전').closest('li')!;
    const other = screen.getByText('제1장 인간기념물').closest('li')!;
    expect(current.className).toContain('bg-brief-accent-soft');
    expect(other.className).not.toContain('bg-brief-accent-soft');
  });
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && npx vitest run src/pages/BriefingView.test.tsx`
Expected: FAIL — 여러 건(버튼 이름 "마저 읽기"만 존재, 목차 토글 버튼 없음, `bg-brief-accent-soft` 없음).

- [ ] **Step 3: BriefingView.tsx 재작성**

전체를 다음으로 교체:

```tsx
import { useEffect, useRef, useState } from 'react';
import type { BriefingResponse, ChapterSummary } from '../types';
import { resolveBriefingView } from '../utils/briefingView';
import { EMPTY_RECAP_MESSAGE } from '../utils/constants';
import ProgressBar from '../components/Reader/ProgressBar';
import TypographicCover from '../components/common/TypographicCover';

/**
 * 브리핑 화면 — S6 (FR-BRF-002~005, D12, D13 ①) — 재설계 2026-08-23
 *
 * 분기 판정은 utils/briefingView 가 한다 — 첫 진입(cutoff = 0)과 저장분 부재(recap: null)를
 * 같은 분기로 묶으면 첫 진입에서 LLM 이 호출된다 (자가 검증 20·21번).
 * 목차는 표시 전용이라 이동 요소를 만들지 않는다 (FR-BRF-004, D12) — 읽기 화면의 목차만
 * 이동 가능하다. '이어서 읽기'는 리캡 상태와 무관하게 항상 동작한다 (UC-28 E1, FR-SPL-005 🚦).
 */

/**
 * TODO(mock): 마지막 방문 시각을 주는 엔드포인트가 없어 고정값이다.
 *   `BriefingResponse` 에 마지막 방문 시각 필드가 생기면 그 값으로 계산해 교체한다.
 *   사용자 결정(2026-08-20): 시안의 자리를 만들어 두고 지금은 mock 으로 채운다.
 */
const MOCK_DAYS_SINCE_LABEL = '3일 만이에요';

const GREETING_LINES = ['다시 오셨네요.', '여기서부터 기억을 맞춰볼게요.'];

export default function BriefingView({
  briefing,
  chapters,
  title,
  author,
  coverUrl,
  onContinue,
  onRequestFallback,
  onBack,
  streamedRecap,
  recapFailed,
}: {
  briefing: BriefingResponse;
  chapters: ChapterSummary[];
  title: string;
  author: string;
  coverUrl?: string | null;
  onContinue: () => void;
  onRequestFallback: () => void;
  onBack: () => void;
  streamedRecap?: string;
  recapFailed?: boolean;
}) {
  const view = resolveBriefingView(briefing);
  const requested = useRef(false);
  const [tocOpen, setTocOpen] = useState(false);

  useEffect(() => {
    // 첫 진입(empty)에서는 호출하지 않는다 — 이 화면의 LLM 호출 0회 조건 (D13 ①)
    if (view.kind !== 'fallback' || requested.current) return;

    // 화면당 1회로 고정한다. 스트리밍이 들어오며 다시 그려질 때 재호출되면 그대로 LLM
    // 재호출이고, 디바이스·도서당 분당 3회 상한에 걸린다 (NFR-AI-017).
    requested.current = true;
    onRequestFallback();
  }, [view.kind, onRequestFallback]);

  return (
    <main className="mx-auto max-w-[760px] bg-brief-paper px-[38px] py-8 font-dashSans text-brief-ink">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 rounded-md p-1 font-dashSans text-[15px] font-semibold text-brief-ink transition-opacity hover:opacity-65"
      >
        <span aria-hidden="true">‹</span>
        돌아가기
      </button>

      <div className="my-5 h-[2px] w-full rounded-[1px] bg-brief-rule" />

      <div className="flex items-start gap-[30px]">
        <TypographicCover size="brief" title={title} author={author} coverUrl={coverUrl} />
        <div>
          <p className="m-0 font-dashSans text-base font-bold text-brief-accent">
            {MOCK_DAYS_SINCE_LABEL}
          </p>
          <h2 className="mt-3 font-dashSerif text-[28px] font-semibold leading-[1.35] tracking-[-.03em] text-brief-ink">
            {GREETING_LINES.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </h2>
          <p className="mt-3.5 font-dashSans text-sm text-brief-muted">
            {title} · {author}
          </p>
        </div>
      </div>

      <section
        aria-label="진도"
        className="mt-6 rounded-brief-panel bg-white p-5 shadow-brief-soft-sm"
      >
        <div className="mb-3 flex items-center justify-between font-dashSans text-sm">
          <b className="font-semibold text-brief-ink">{briefing.current_chapter.title}</b>
          <span className="font-semibold text-brief-accent">{briefing.progress.percent}%</span>
        </div>
        <ProgressBar percent={briefing.progress.percent} tone="brief" size="md" />
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onContinue}
            className="rounded-full border border-brief-ink bg-transparent px-3.5 py-2 font-dashSans text-xs font-bold text-brief-ink transition-colors hover:bg-[rgba(31,31,31,0.05)] active:bg-[rgba(31,31,31,0.1)]"
          >
            이어서 읽기
          </button>
        </div>
      </section>

      <div className="my-7 h-[2px] w-full rounded-[1px] bg-brief-rule" />

      <h3 className="mb-3.5 font-dashSerif text-lg font-semibold tracking-[-.02em] text-brief-ink">
        그동안 이런 이야기였어요
      </h3>
      <div className="rounded-brief-panel bg-white p-6 font-dashSans text-[15px] leading-[1.75] text-[#3a352c] shadow-brief-soft-sm">
        {view.kind === 'empty' ? <p className="m-0">{EMPTY_RECAP_MESSAGE}</p> : null}
        {view.kind === 'recap' ? <p className="m-0">{briefing.recap}</p> : null}
        {view.kind === 'fallback' ? (
          <p className="m-0">{recapFailed ? '리캡을 불러오지 못했습니다' : (streamedRecap ?? '')}</p>
        ) : null}
      </div>

      <div className="my-7 h-[2px] w-full rounded-[1px] bg-brief-rule" />

      <button
        type="button"
        id="tocToggle"
        aria-expanded={tocOpen}
        aria-controls="tocPanel"
        onClick={() => setTocOpen((open) => !open)}
        className="mb-3.5 flex w-full items-center justify-between rounded-lg py-4"
      >
        <h3 className="m-0 font-dashSerif text-lg font-semibold tracking-[-.02em] text-brief-ink">
          목차
        </h3>
        <span className="flex size-9 items-center justify-center rounded-full bg-white shadow-brief-soft-sm">
          <span
            aria-hidden="true"
            className={`block text-[17px] leading-none text-brief-ink transition-transform duration-200 ${tocOpen ? 'rotate-180' : ''}`}
          >
            ▾
          </span>
        </span>
      </button>

      <div
        id="tocPanel"
        aria-hidden={!tocOpen}
        className={`flex flex-col gap-2.5 overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out ${
          tocOpen ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        {/* 표시 전용 목차 — 이동 요소(a·button)를 만들지 않는다 (FR-BRF-004, D12) */}
        <ul aria-label="목차" className="flex flex-col gap-2.5">
          {chapters.map((chapter) => {
            const isNow = chapter.chapter_no === briefing.current_chapter.chapter_no;
            return (
              <li
                key={chapter.chapter_no}
                aria-current={isNow ? 'true' : undefined}
                className={`flex items-center gap-3.5 rounded-brief-card px-[18px] py-3.5 shadow-[0_1px_2px_rgba(42,38,32,0.05)] ${
                  isNow ? 'bg-brief-accent-soft shadow-brief-soft-sm' : 'bg-white'
                }`}
              >
                <span
                  className={`flex size-[26px] shrink-0 items-center justify-center rounded-full font-dashMono text-xs font-semibold ${
                    isNow ? 'bg-brief-accent text-white' : 'bg-brief-paper text-brief-muted'
                  }`}
                >
                  {chapter.chapter_no}
                </span>
                <span
                  className={`font-dashSans text-[14.5px] ${isNow ? 'font-semibold text-brief-accent' : 'text-brief-ink'}`}
                >
                  {chapter.title}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Briefing.tsx에 표지 연결**

`frontend/src/pages/Briefing.tsx`에서 import 추가:
```ts
import { resolveCoverUrl } from '../utils/coverOverrides';
```

`<BriefingView ... />` 호출에 `coverUrl` prop 추가:
```tsx
    <BriefingView
      briefing={briefing}
      chapters={chapters}
      title={book?.title ?? ''}
      author={book?.author ?? ''}
      coverUrl={resolveCoverUrl(bookId, null)}
      onContinue={handleContinue}
      onRequestFallback={handleFallback}
      onBack={() => navigate('/')}
      streamedRecap={streamedRecap}
      recapFailed={recapError !== null}
    />
```

(`BookInfoResponse.basic_info`에 `cover_url` 필드 자체가 없으므로 두 번째 인자는 항상 `null` — override map에 있는 book_id면 그 경로가, 없으면 `null`이 그대로 `TypographicCover`로 흘러가 폴백 조판이 뜬다.)

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd frontend && npx vitest run src/pages/BriefingView.test.tsx`
Expected: PASS 전부(기존 11개 + 신규 3개 = 14개).

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/pages/BriefingView.tsx frontend/src/pages/Briefing.tsx frontend/src/pages/BriefingView.test.tsx
git commit -m "feat(R4): 브리핑 화면 재설계 — 표지·구분선·진도 패널·접이식 목차, 마저읽기→이어서읽기"
```

---

### Task 5: 문구 변경 리플 정리 (App 통합 테스트) + 전체 검증

**Files:**
- Modify: `frontend/src/App.continue.test.tsx`
- Modify: `frontend/src/App.fallback.test.tsx`
- Modify: `frontend/src/App.ssabi.test.tsx`
- Modify: `frontend/src/App.flow.test.tsx`

**확인된 사실(2026-08-23 grep 예정):** 대시보드 재설계 때 이 네 파일에 "탁류 → 이어서 읽기" 진입 흐름을 이미 심어 뒀다. 그 흐름이 브리핑에 도착한 뒤 `screen.getByRole('button', { name: '마저 읽기' })`로 다음 단계(읽기 화면)로 넘어가던 지점이 전부 "이어서 읽기"로 바뀌어야 한다 — 브리핑 화면 자체의 버튼 문구가 바뀌었기 때문이다(기능은 동일, 라벨만 변경).

- [ ] **Step 1: 깨지는 지점 찾기**

Run: `cd frontend && grep -rn "마저 읽기" src/App.*.test.tsx`
Expected: 4개 파일에서 총 4곳 이상 매치(각 파일당 1곳, `App.fallback.test.tsx`는 2곳).

- [ ] **Step 2: 전부 "이어서 읽기"로 치환**

각 매치를 다음처럼 바꾼다(문자열 리터럴 `'마저 읽기'` → `'이어서 읽기'`, 셀렉터·로직 변경 없음):

```tsx
await screen.findByRole('button', { name: '이어서 읽기' }, { timeout: 5000 });
await userEvent.click(screen.getByRole('button', { name: '이어서 읽기' }));
```

`App.flow.test.tsx`도 동일 패턴으로 찾아 바꾼다.

- [ ] **Step 3: 재확인**

Run: `cd frontend && grep -rn "마저 읽기" src/App.*.test.tsx`
Expected: 0건.

- [ ] **Step 4: 전체 테스트·타입·린트**

Run: `cd frontend && npx tsc --noEmit && npx vitest run && npx eslint src --ext ts,tsx`
Expected: tsc 0건, 전체 테스트 통과, eslint 0건.

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/App.continue.test.tsx frontend/src/App.fallback.test.tsx frontend/src/App.ssabi.test.tsx frontend/src/App.flow.test.tsx
git commit -m "test(R4): App 통합 테스트의 브리핑 진입 버튼 문구를 이어서 읽기로 갱신"
```

- [ ] **Step 6: 실 브라우저 대조 (사용자 확인용, 커밋 아님)**

로컬 dev 서버가 이미 떠 있다면 새 토큰 반영을 위해 재시작(`tailwind.config.js`를 이번에도 건드렸다 — 이 세션에서 반복 확인된 함정). 브리핑 화면(`/books/takryu/briefing`)을 스크린샷으로 찍어 목업(`https://claude.ai/code/artifact/7cbdf443-...`의 `.brief-scr`)과 나란히 대조한다. 특히:
- 목차가 기본 접힘 상태인지
- "목차" 버튼을 누르면 부드럽게 펼쳐지고 화살표가 180도 도는지
- 현재 장(3장) 행만 보라 워시 배경으로 강조되는지
- "이어서 읽기" 버튼이 진도 패널 안 우측에 알약형으로 있는지

불일치가 있으면 그 자리에서 고치고 재확인한다.

---

## Self-Review 체크리스트

1. **스펙 커버리지** — 표지 override✓(Task1,4) · brief 토큰✓(Task1) · TypographicCover brief✓(Task2) · ProgressBar brief/md✓(Task3) · 구분선 3개✓(Task4) · 진도 패널+이어서읽기 버튼 위치✓(Task4) · 리캡 패널 스타일✓(Task4) · 목차 접기/펼치기+현재장 강조✓(Task4) · 문구 변경 리플✓(Task5). 갭 없음.
2. **플레이스홀더 스캔** — 전 태스크 코드 완전 작성.
3. **타입 일관성** — `resolveCoverUrl(bookId, coverUrl)` 시그니처가 Task1 정의·Task4 소비 지점에서 동일. `TypographicCover`의 `size` 유니온에 `'brief'`가 Task2에서 추가되고 Task4가 그대로 쓴다. `ProgressBar`의 `tone`/`size` prop이 Task3 정의·Task4 소비에서 일치.
