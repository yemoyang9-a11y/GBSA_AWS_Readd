# Figma 디자인 적용 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로직만 동작하는 프론트엔드에 Figma 시안의 시각 디자인을 입혀, 데모 동선 4화면(대시보드·브리핑·읽기·싸비 3탭)이 시안대로 보이게 한다.

**Architecture:** 토큰 → 공용 컴포넌트 → 화면 조립 순서로 쌓는다. 시안 실측값을 `tailwind.config.js`의 `theme.extend`에 심어 컴포넌트가 임의 색상값(`text-[#1c1b1a]`) 대신 토큰 이름(`text-ink`)을 쓰게 하고, 4화면이 공유하는 단위(표지·카드·진도 바·탭·버튼)를 React 컴포넌트로 먼저 만든 뒤 화면이 그것들을 조립한다. 데이터 배선·라우팅·상태 관리는 이미 동작하므로 **건드리지 않는다** — 이 계획은 시각 계층만 다룬다.

**Tech Stack:** React 18 · TypeScript 5.5 · Vite 5 · Tailwind CSS 3.4 (설치·작동 중) · React Flow(`@xyflow/react` 12, 설치됨) · Vitest 4 + Testing Library

**Spec:** `docs/superpowers/specs/2026-08-20-figma-design-system-design.md`

---

## Global Constraints

모든 태스크의 요구사항에 아래가 암묵적으로 포함된다.

| # | 제약 | 근거 |
| --- | --- | --- |
| G1 | 프론트에서 `page - 1`·`percent`를 계산하지 않는다. 서버가 내려준 값을 그대로 렌더한다 | 절대 규칙 2번, FR-BRF-005 🚦 |
| G2 | 읽기 화면에 **진도 바를 두지 않는다.** 페이지 번호만 표시한다 | FR-PRG-004 |
| G3 | 페이지를 재분할하지 않는다. 폰트·화면 크기 변화는 **본문 영역의 스크롤 길이만** 바꾼다 | FR-PRG-001, 절대 규칙 10번 |
| G4 | 관계 라벨은 **글자로 병기**한다. 색상만으로 구분하지 않는다 | NFR-USE-006 |
| G5 | 기준점 초과 여부를 판별하는 코드를 만들지 않는다. 서버가 이미 걸러 내려준 것을 그대로 그린다 | 절대 규칙 7번 |
| G6 | 미완비 도서 카드는 `disabled`로 클릭을 막는다 (서버 차단과 병행) | FR-BRW-002 🚦 |
| G7 | 브리핑 목차에 **이동 가능한 요소를 만들지 않는다** | FR-BRF-004, D12 |
| G8 | 싸비 탭은 **3개**다(리캡·인물 관계도·챗봇). 시안의 타임라인 탭은 만들지 않는다 | 00-shared §2.5 "[이후 확장]" |
| G9 | 기존 테스트 77개가 계속 통과해야 한다. 마크업이 바뀌면 쿼리를 옮기되 **검증의 의미를 유지**한다. 테스트를 느슨하게 바꾸지 않는다 | CLAUDE.md 7장 |
| G10 | 컴포넌트는 데이터 조회·상태 판단을 하지 않는다. props로 받은 것만 렌더한다 | 스펙 §4 |
| G11 | **색은 반드시 토큰 이름으로 쓴다** — `text-[#1c1b1a]` 같은 색 리터럴을 새로 만들지 않는다. 글자 크기·일회성 간격은 토큰이 없으므로 Tailwind 기본 유틸리티나 임의 값(`text-[13px]`)을 써도 된다 | 스펙 §3 |
| G12 | 커밋 형식 `{type}(R4): {요약} — {조항 ID}`, **작업 단위 1개 = 커밋 1개** | CLAUDE.md 10장 |

### 실측 토큰 값 (스펙 §3에서 verbatim)

```
canvas #faf8f5 · surface #ffffff · line #ebe6e0 · line-subtle #edeae6
ink #1c1b1a · muted #6e6a66 · faint #76726e · accent #3b3db2 · active #111111
serif "Nanum Myeongjo" · sans "Gothic A1"
radius card 16px / cover 8px / pill 20px · shadow card 0 8px 8px rgba(28,27,26,0.03)
카드 폭 312px · 카드 패딩 18px · 그리드 간격 24px · 표지 높이 240px · nav 높이 80px
진도 바 높이 4px · 탭 pill px16/py8
```

### 검증 명령 (모든 태스크 공통)

```bash
cd frontend && npx tsc --noEmit && npm test
```

---

## 스펙 정정 1건

스펙 §4.2가 `ProgressBar`를 `common/ProgressBar`로 적었으나 **실제 경로는 `src/components/Reader/ProgressBar.tsx`**다. 기존 import를 깨지 않도록 **파일을 옮기지 않는다.** 이 계획은 실제 경로를 쓴다.

## 손대지 않는 미사용 스텁 3개

`Layout/Sidebar.tsx`(`<aside />`) · `Reader/PageContent.tsx`(`<article />`) · `Reader/PageNavigation.tsx`(`<nav />`) — 어디서도 import되지 않는다. `ReaderView`가 본문과 내비게이션을 직접 그리고 있어 역할이 겹친다. **이번 범위에서 제거도 구현도 하지 않는다**(요청 범위 밖의 정리 작업이므로).

---

## File Structure

| 파일 | 책임 | 태스크 |
| --- | --- | --- |
| `frontend/tailwind.config.js` | 디자인 토큰 정의 — 색·서체·모서리·그림자·치수 | 1 |
| `frontend/index.html` | 웹폰트 `<link>` | 1 |
| `frontend/src/assets/styles/index.css` | 전역 base — 페이지 배경·기본 서체 | 1 |
| `frontend/src/design-tokens.test.ts` | 토큰 값이 스펙과 일치하는지 고정 | 1 |
| `frontend/src/components/common/TypographicCover.tsx` | 표지 자리. 이미지 없으면 제목·저자 조판 | 2 |
| `frontend/src/components/Reader/ProgressBar.tsx` | 4px 진도 바 (스텁 채우기) | 3 |
| `frontend/src/components/common/BookCard.tsx` | 도서 카드 1칸 | 4 |
| `frontend/src/components/common/BookGrid.tsx` | 카드 그리드 (BookCard로 교체) | 4 |
| `frontend/src/components/common/StatCard.tsx` | 통계 카드 | 5 |
| `frontend/src/components/common/FilterTabs.tsx` | 알약형 탭 그룹 | 5 |
| `frontend/src/components/common/Button.tsx` | 버튼 2변형 (스텁 채우기) | 5 |
| `frontend/src/components/Layout/Header.tsx` | nav-bar (스텁 채우기) | 6 |
| `frontend/src/pages/Dashboard.tsx` | 대시보드 조립 + 통계·필터 집계 | 7 |
| `frontend/src/pages/BriefingView.tsx` | 브리핑 조립 | 8 |
| `frontend/src/components/Reader/ReaderView.tsx` | 읽기 셸 — 본문·하단 내비 | 9 |
| `frontend/src/pages/Reader.tsx` | top-bar + 좌우 분할 | 9 |
| `frontend/src/components/Ssabi/SsabiPanel.tsx` | 패널 헤더 + 탭 바 | 10 |
| `frontend/src/components/Ssabi/RelationshipGraph.tsx` | React Flow 원형 배치 (스텁 채우기) | 11 |
| `frontend/src/components/Ssabi/RelationshipTab.tsx` | 그래프 + 인물 카드 목록 | 11 |
| `frontend/src/components/Ssabi/RecapTab.tsx`·`ChatbotTab.tsx` | 리캡·챗봇 탭 스타일 | 12 |

---

## Task 1: 디자인 토큰 · 웹폰트 · 전역 base

**Files:**
- Modify: `frontend/tailwind.config.js`
- Modify: `frontend/index.html`
- Modify: `frontend/src/assets/styles/index.css`
- Test: `frontend/src/design-tokens.test.ts`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces: Tailwind 토큰 클래스 — 색 `bg-canvas`·`bg-surface`·`text-ink`·`text-muted`·`text-faint`·`text-accent`·`bg-active`·`border-line`·`border-line-subtle`, 서체 `font-serif`·`font-sans`, 모서리 `rounded-card`·`rounded-cover`·`rounded-pill`, 그림자 `shadow-card`, 치수 `w-book-card`·`h-cover`·`h-navbar`·`p-card`·`gap-gutter`. Task 2~12가 전부 이 이름을 쓴다.

- [ ] **Step 1: 토큰을 고정하는 실패하는 테스트를 쓴다**

`frontend/src/design-tokens.test.ts`:

```ts
/**
 * 디자인 토큰 — 스펙 §3의 시안 실측값을 고정한다.
 *
 * 색 하나가 오타로 바뀌면 화면 전체 톤이 어긋나는데 눈으로는 잘 안 잡힌다.
 * 이 테스트가 스펙과 config 사이의 유일한 기계적 연결이다.
 */

import config from '../tailwind.config.js';

const colors = (config.theme?.extend?.colors ?? {}) as Record<string, any>;

describe('디자인 토큰 (스펙 §3)', () => {
  it('색 팔레트가 시안 실측값과 일치한다', () => {
    expect(colors.canvas).toBe('#faf8f5');
    expect(colors.surface).toBe('#ffffff');
    expect(colors.line.DEFAULT).toBe('#ebe6e0');
    expect(colors.line.subtle).toBe('#edeae6');
    expect(colors.ink).toBe('#1c1b1a');
    expect(colors.muted).toBe('#6e6a66');
    expect(colors.faint).toBe('#76726e');
    expect(colors.accent).toBe('#3b3db2');
    expect(colors.active).toBe('#111111');
  });

  it('서체는 명조·고딕 두 종이며 폴백을 갖는다', () => {
    const fonts = config.theme?.extend?.fontFamily as Record<string, string[]>;
    expect(fonts.serif[0]).toBe('"Nanum Myeongjo"');
    expect(fonts.serif).toContain('serif');
    expect(fonts.sans[0]).toBe('"Gothic A1"');
    expect(fonts.sans).toContain('sans-serif');
  });

  it('형태 토큰이 시안 실측값과 일치한다', () => {
    const t = config.theme?.extend as Record<string, any>;
    expect(t.borderRadius.card).toBe('16px');
    expect(t.borderRadius.cover).toBe('8px');
    expect(t.borderRadius.pill).toBe('20px');
    expect(t.boxShadow.card).toBe('0 8px 8px rgba(28, 27, 26, 0.03)');
    expect(t.width['book-card']).toBe('312px');
    expect(t.height.cover).toBe('240px');
    expect(t.height.navbar).toBe('80px');
    expect(t.spacing.card).toBe('18px');
    expect(t.spacing.gutter).toBe('24px');
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd frontend && npx vitest run src/design-tokens.test.ts`
Expected: FAIL — `colors.canvas`가 `undefined`

- [ ] **Step 3: 토큰을 심는다**

`frontend/tailwind.config.js` 전체를 교체한다:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#faf8f5', // 페이지 배경 — 따뜻한 오프화이트
        surface: '#ffffff', // 카드·패널 배경
        line: {
          DEFAULT: '#ebe6e0', // nav 하단선, 진도 트랙, 구분선
          subtle: '#edeae6', // 통계 카드·비활성 탭 테두리
        },
        ink: '#1c1b1a', // 본문·제목·진도 채움
        muted: '#6e6a66', // 저자·소개·보조 설명
        faint: '#76726e', // 비활성 탭 라벨
        accent: '#3b3db2', // 통계 숫자 강조
        active: '#111111', // 활성 탭 배경
      },
      fontFamily: {
        serif: ['"Nanum Myeongjo"', 'serif'],
        sans: ['"Gothic A1"', 'system-ui', 'sans-serif'],
      },
      borderRadius: { card: '16px', cover: '8px', pill: '20px' },
      boxShadow: { card: '0 8px 8px rgba(28, 27, 26, 0.03)' },
      spacing: { card: '18px', gutter: '24px' },
      width: { 'book-card': '312px' },
      height: { cover: '240px', navbar: '80px' },
    },
  },
  plugins: [],
};
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd frontend && npx vitest run src/design-tokens.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: 웹폰트를 링크한다**

`frontend/index.html`의 `</head>` 앞에 넣는다:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@400;700;800&family=Gothic+A1:wght@400;700&display=swap"
  rel="stylesheet"
/>
```

`display=swap`이라 폰트가 늦게 와도 텍스트가 먼저 보인다. 발표장 네트워크가 막히면 `fontFamily`의 폴백(`serif`/`sans-serif`)으로 떨어지고 레이아웃은 유지된다.

- [ ] **Step 6: 전역 base를 넣는다**

`frontend/src/assets/styles/index.css`를 교체한다:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  /* 태블릿 PC 우선 반응형 (NFR-USE) */
  html,
  body,
  #root {
    height: 100%;
  }

  body {
    @apply bg-canvas font-sans text-ink;
  }
}
```

- [ ] **Step 7: 전체 검증**

Run: `cd frontend && npx tsc --noEmit && npm test`
Expected: 타입 에러 0건, 기존 77개 + 신규 3개 = 80개 통과

- [ ] **Step 8: 커밋**

```bash
git add frontend/tailwind.config.js frontend/index.html frontend/src/assets/styles/index.css frontend/src/design-tokens.test.ts
git commit -m "feat(R4): 디자인 토큰·웹폰트·전역 base — 시안 실측값 고정"
```

---

## Task 2: TypographicCover — 표지 자리

**Files:**
- Create: `frontend/src/components/common/TypographicCover.tsx`
- Test: `frontend/src/components/common/TypographicCover.test.tsx`

**Interfaces:**
- Consumes: Task 1의 토큰 클래스
- Produces: `TypographicCover({ title, author, coverUrl }: { title: string; author: string; coverUrl?: string | null })` — 높이 `h-cover`(240px)·모서리 `rounded-cover`(8px) 고정. Task 4(BookCard)와 Task 8(브리핑)이 쓴다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`frontend/src/components/common/TypographicCover.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import TypographicCover from './TypographicCover';

describe('TypographicCover', () => {
  it('cover_url 이 있으면 이미지를 쓴다', () => {
    render(<TypographicCover title="탁류" author="채만식" coverUrl="/covers/takryu.jpg" />);
    const img = screen.getByRole('img', { name: '탁류 표지' });
    expect(img).toHaveAttribute('src', '/covers/takryu.jpg');
  });

  it('cover_url 이 없으면 제목·저자를 조판한 표지를 그린다', () => {
    render(<TypographicCover title="탁류" author="채만식" coverUrl={null} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('탁류')).toBeInTheDocument();
    expect(screen.getByText('채만식')).toBeInTheDocument();
  });

  it('cover_url 이 빈 문자열이어도 조판 표지로 떨어진다 — mock·실데이터 모두 빈 값이다', () => {
    render(<TypographicCover title="탁류" author="채만식" coverUrl="" />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('탁류')).toBeInTheDocument();
  });

  it('coverUrl 을 아예 넘기지 않아도 동작한다', () => {
    render(<TypographicCover title="탁류" author="채만식" />);
    expect(screen.getByText('탁류')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd frontend && npx vitest run src/components/common/TypographicCover.test.tsx`
Expected: FAIL — `Failed to resolve import "./TypographicCover"`

- [ ] **Step 3: 구현한다**

`frontend/src/components/common/TypographicCover.tsx`:

```tsx
/**
 * 표지 자리 — 시안의 book-cover 영역 (높이 240px, 모서리 8px)
 *
 * 「탁류」는 1937년 공개도메인 작품이라 정본 표지가 없고, mock fixture 와 R1 파이프라인
 * 모두 cover_url 을 채우지 않는다. 이미지가 없을 때 빈 사각형을 두는 대신 제목·저자를
 * 명조로 조판해 표지 구실을 하게 한다 (스펙 §7 #4).
 *
 * cover_url 이 채워지면 별도 수정 없이 이미지로 전환된다.
 */
export default function TypographicCover({
  title,
  author,
  coverUrl,
}: {
  title: string;
  author: string;
  coverUrl?: string | null;
}) {
  if (coverUrl) {
    return (
      <img
        src={coverUrl}
        alt={`${title} 표지`}
        className="h-cover w-full rounded-cover object-cover"
      />
    );
  }

  return (
    <div
      className="flex h-cover w-full flex-col items-center justify-center gap-3 rounded-cover border border-line bg-canvas px-6 text-center"
      data-testid="typographic-cover"
    >
      <span className="font-serif text-2xl font-bold leading-snug text-ink">{title}</span>
      <span className="h-px w-8 bg-line" />
      <span className="font-sans text-xs text-muted">{author}</span>
    </div>
  );
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd frontend && npx vitest run src/components/common/TypographicCover.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/components/common/TypographicCover.tsx frontend/src/components/common/TypographicCover.test.tsx
git commit -m "feat(R4): 타이포그래픽 표지 컴포넌트 — 표지 에셋 부재 대응"
```

---

## Task 3: ProgressBar 채우기

**Files:**
- Modify: `frontend/src/components/Reader/ProgressBar.tsx`
- Modify: `frontend/src/components/Reader/ProgressBar.test.tsx`

**Interfaces:**
- Consumes: Task 1의 토큰
- Produces: `ProgressBar({ percent }: { percent: number })` — `role="progressbar"`·`aria-valuenow`를 **유지**한다(기존 테스트와 `BookGrid.test.tsx`가 이 쿼리를 쓴다). Task 4·8이 쓴다.

- [ ] **Step 1: 시각 요소를 요구하는 테스트를 추가한다**

`frontend/src/components/Reader/ProgressBar.test.tsx`를 교체한다:

```tsx
import { render, screen } from '@testing-library/react';
import ProgressBar from './ProgressBar';

describe('ProgressBar', () => {
  it('FR-BRF-005 🚦: 서버가 내려준 percent 를 그대로 노출한다', () => {
    render(<ProgressBar percent={23.5} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '23.5');
  });

  it('채움 폭이 percent 와 일치한다 — 프론트가 값을 다시 계산하지 않는다', () => {
    render(<ProgressBar percent={64} />);
    const fill = screen.getByTestId('progress-fill');
    expect(fill).toHaveStyle({ width: '64%' });
  });

  it('접근성 범위(0~100)와 이름을 갖는다', () => {
    render(<ProgressBar percent={0} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });

  it('percent 가 100을 넘어도 막대가 넘치지 않는다', () => {
    render(<ProgressBar percent={130} />);
    expect(screen.getByTestId('progress-fill')).toHaveStyle({ width: '100%' });
    // 표시만 자른다 — aria 값은 서버가 준 값 그대로다 (절대 규칙 2번)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '130');
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd frontend && npx vitest run src/components/Reader/ProgressBar.test.tsx`
Expected: FAIL — `Unable to find an element by: [data-testid="progress-fill"]`

- [ ] **Step 3: 구현한다**

`frontend/src/components/Reader/ProgressBar.tsx`:

```tsx
/**
 * 진도 바 — 브리핑·대시보드 전용이다.
 * 읽기 화면에는 두지 않는다. 읽기 화면은 페이지 번호만 표시한다 (FR-PRG-004).
 * percent 는 서버가 내려준 값을 그대로 받는다 (FR-BRF-005 🚦).
 *
 * 시안: 트랙 4px(#ebe6e0) / 채움(#1c1b1a), 모서리 2px.
 *
 * ⚠️ 막대 폭은 표시상 0~100으로 자르되 `aria-valuenow` 는 **서버 값 그대로** 둔다.
 *    값을 보정해서 내보내면 그 순간 프론트가 파생값을 만든 게 된다 (절대 규칙 2번).
 */
export default function ProgressBar({ percent }: { percent: number }) {
  const width = Math.min(Math.max(percent, 0), 100);

  return (
    <div
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-1 w-full overflow-hidden rounded-sm bg-line"
    >
      <div
        data-testid="progress-fill"
        className="h-full bg-ink"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd frontend && npx vitest run src/components/Reader/ProgressBar.test.tsx && npx vitest run src/components/common/BookGrid.test.tsx`
Expected: 둘 다 PASS — `BookGrid.test.tsx`의 `aria-valuenow` 쿼리가 그대로 살아 있어야 한다

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/components/Reader/ProgressBar.tsx frontend/src/components/Reader/ProgressBar.test.tsx
git commit -m "feat(R4): 진도 바 시각 구현 — FR-BRF-005"
```

---

## Task 4: BookCard · BookGrid 교체

**Files:**
- Create: `frontend/src/components/common/BookCard.tsx`
- Modify: `frontend/src/components/common/BookGrid.tsx`
- Test: `frontend/src/components/common/BookCard.test.tsx`
- Modify: `frontend/src/components/common/BookGrid.test.tsx` (필요 시 쿼리 조정)

**Interfaces:**
- Consumes: Task 2 `TypographicCover`, Task 3 `ProgressBar`
- Produces: `BookCard({ book, onSelect }: { book: BookSummary; onSelect: (book: BookSummary) => void })`. `BookGrid`의 시그니처는 **바꾸지 않는다** — `{ books, onSelect }` 그대로다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`frontend/src/components/common/BookCard.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BookCard from './BookCard';
import type { BookSummary } from '../../types';

const book: BookSummary = {
  book_id: 'takryu',
  title: '탁류',
  author: '채만식',
  cover_url: '',
  total_pages: 411,
  ssabi_ready: true,
};

describe('BookCard', () => {
  it('제목·저자를 렌더하고 버튼 이름에 제목이 들어간다', async () => {
    render(<BookCard book={book} onSelect={() => {}} />);
    // 조판 표지와 정보 영역 양쪽에 제목이 나온다
    expect(screen.getAllByText('탁류').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /탁류/ })).toBeInTheDocument();
  });

  it('클릭하면 onSelect 가 그 도서로 호출된다', async () => {
    const onSelect = vi.fn();
    render(<BookCard book={book} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('button', { name: /탁류/ }));
    expect(onSelect).toHaveBeenCalledWith(book);
  });

  it('FR-BRW-002 🚦: 미완비 도서는 버튼이 disabled 이고 onSelect 가 호출되지 않는다', async () => {
    const onSelect = vi.fn();
    render(<BookCard book={{ ...book, ssabi_ready: false }} onSelect={onSelect} />);
    const button = screen.getByRole('button', { name: /탁류/ });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('진도가 있으면 서버 percent 를 그대로 표시하고 "n% 완료" 라벨을 붙인다', () => {
    render(<BookCard book={{ ...book, progress: { current_page: 80, percent: 64 } }} onSelect={() => {}} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '64');
    expect(screen.getByText('64% 완료')).toBeInTheDocument();
    expect(screen.getByText('읽는 중')).toBeInTheDocument();
  });

  it('진도가 없으면 진도 영역을 그리지 않는다', () => {
    render(<BookCard book={book} onSelect={() => {}} />);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('intro_summary 가 없으면 소개 영역을 비운다 — 계약 미확정 필드다 (스펙 §7 #5)', () => {
    render(<BookCard book={book} onSelect={() => {}} />);
    expect(screen.queryByTestId('book-intro')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd frontend && npx vitest run src/components/common/BookCard.test.tsx`
Expected: FAIL — `Failed to resolve import "./BookCard"`

- [ ] **Step 3: BookCard 를 구현한다**

`frontend/src/components/common/BookCard.tsx`:

```tsx
import type { BookSummary } from '../../types';
import ProgressBar from '../Reader/ProgressBar';
import TypographicCover from './TypographicCover';

/**
 * 도서 카드 — 시안 book-card (폭 312px, 모서리 16px, 패딩 18px)
 *
 * 미완비 도서는 버튼을 disabled 로 둬 클릭 자체를 막는다. 이건 UI 조치일 뿐이고
 * 서버도 진입을 거절한다 — 둘 다 있어야 한다 (FR-BRW-002 🚦, R2 403 BOOK_NOT_READY).
 * 진도 percent 는 서버가 내려준 값을 그대로 넘긴다 (FR-BRF-005 🚦, 절대 규칙 2번).
 *
 * `intro_summary` 는 아직 계약에 없다(엔드포인트 계획 D-3). 필드가 오면 소개 2줄이
 * 그려지고, 없으면 그 영역을 통째로 비운다 — 자리표시 문구를 지어내지 않는다.
 */
export default function BookCard({
  book,
  onSelect,
}: {
  book: BookSummary;
  onSelect: (book: BookSummary) => void;
}) {
  const intro = (book as BookSummary & { intro_summary?: string | null }).intro_summary;

  return (
    <div className="w-book-card rounded-card bg-surface p-card shadow-card">
      <button
        type="button"
        disabled={!book.ssabi_ready}
        onClick={() => onSelect(book)}
        className="w-full text-left disabled:opacity-50"
      >
        <TypographicCover title={book.title} author={book.author} coverUrl={book.cover_url} />

        <span className="mt-4 block truncate font-serif text-lg font-bold text-ink">
          {book.title}
        </span>
        <span className="mt-0.5 block text-xs text-muted">{book.author}</span>

        {intro ? (
          <span data-testid="book-intro" className="mt-2 block line-clamp-2 text-xs leading-normal text-muted">
            {intro}
          </span>
        ) : null}
      </button>

      {book.progress ? (
        <div className="mt-4 border-t border-line pt-4">
          <div className="mb-1.5 flex items-center justify-between text-[11px]">
            <span className="text-muted">읽는 중</span>
            <span className="font-bold text-ink">{book.progress.percent}% 완료</span>
          </div>
          <ProgressBar percent={book.progress.percent} />
        </div>
      ) : null}
    </div>
  );
}
```

> `percent` 를 그대로 문자열에 넣는다. `Math.round` 를 쓰지 않는다 — 표시 반올림은 `utils/format.ts` 의 `formatPercent()` 소관이고, 여기서 또 반올림하면 계산 지점이 둘로 갈린다(team-sync §4.9).

- [ ] **Step 4: BookGrid 를 BookCard 로 교체한다**

`frontend/src/components/common/BookGrid.tsx`:

```tsx
import type { BookSummary } from '../../types';
import BookCard from './BookCard';

/**
 * 대시보드 표지 그리드 — S2 (FR-BRW-001·002 🚦)
 *
 * 카드 한 칸의 책임은 BookCard 가 갖는다. 여기는 배치만 한다 — 시안의 간격 24px.
 */
export default function BookGrid({
  books,
  onSelect,
}: {
  books: BookSummary[];
  onSelect: (book: BookSummary) => void;
}) {
  return (
    <ul className="flex flex-wrap gap-gutter">
      {books.map((book) => (
        <li key={book.book_id}>
          <BookCard book={book} onSelect={onSelect} />
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `cd frontend && npx vitest run src/components/common/`
Expected: `BookCard.test.tsx` 6개 PASS, **`BookGrid.test.tsx` 5개도 수정 없이 PASS**

`BookGrid.test.tsx`가 깨지면 쿼리만 옮기고 **검증의 의미는 유지한다**(G9). 특히 아래 세 가지는 형태가 바뀌어도 살아 있어야 한다 — 미완비 도서 `disabled`, `aria-valuenow`가 서버 값과 일치, 진도 없으면 `progressbar` 부재.

- [ ] **Step 6: 전체 검증**

Run: `cd frontend && npx tsc --noEmit && npm test`
Expected: 타입 에러 0건, 전체 통과

- [ ] **Step 7: 커밋**

```bash
git add frontend/src/components/common/BookCard.tsx frontend/src/components/common/BookCard.test.tsx frontend/src/components/common/BookGrid.tsx frontend/src/components/common/BookGrid.test.tsx
git commit -m "feat(R4): 도서 카드 · 그리드 시안 적용 — FR-BRW-001·002, FR-BRF-005"
```

---

## Task 5: StatCard · FilterTabs · Button

**Files:**
- Create: `frontend/src/components/common/StatCard.tsx`
- Create: `frontend/src/components/common/FilterTabs.tsx`
- Modify: `frontend/src/components/common/Button.tsx`
- Test: `frontend/src/components/common/StatCard.test.tsx`
- Test: `frontend/src/components/common/FilterTabs.test.tsx`

**Interfaces:**
- Consumes: Task 1의 토큰
- Produces:
  - `StatCard({ value, label }: { value: number; label: string })`
  - `FilterTabs<T extends string>({ tabs, active, onChange }: { tabs: { id: T; label: string }[]; active: T; onChange: (id: T) => void })`
  - `Button({ children, onClick, variant, disabled }: { children: ReactNode; onClick?: () => void; variant?: 'solid' | 'pill'; disabled?: boolean })`
  - Task 7(대시보드)·8(브리핑)이 쓴다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`frontend/src/components/common/StatCard.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import StatCard from './StatCard';

describe('StatCard', () => {
  it('숫자와 라벨을 렌더한다', () => {
    render(<StatCard value={3} label="읽는 중" />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('읽는 중')).toBeInTheDocument();
  });

  it('0도 그대로 표시한다 — 완독 판정 데이터가 없어 0이 정상값이다 (스펙 §7 #1)', () => {
    render(<StatCard value={0} label="완독" />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});
```

`frontend/src/components/common/FilterTabs.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FilterTabs from './FilterTabs';

const TABS = [
  { id: 'reading', label: '읽는 중' },
  { id: 'done', label: '완독' },
  { id: 'all', label: '전체' },
] as const;

describe('FilterTabs', () => {
  it('탭을 전부 렌더하고 활성 탭을 aria-pressed 로 표시한다', () => {
    render(<FilterTabs tabs={[...TABS]} active="reading" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: '읽는 중' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '완독' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: '전체' })).toBeInTheDocument();
  });

  it('탭을 누르면 그 id 로 onChange 가 호출된다', async () => {
    const onChange = vi.fn();
    render(<FilterTabs tabs={[...TABS]} active="reading" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: '전체' }));
    expect(onChange).toHaveBeenCalledWith('all');
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd frontend && npx vitest run src/components/common/StatCard.test.tsx src/components/common/FilterTabs.test.tsx`
Expected: FAIL — 두 모듈 모두 resolve 실패

- [ ] **Step 3: 구현한다**

`frontend/src/components/common/StatCard.tsx`:

```tsx
/** 통계 카드 — 시안 stat-card (모서리 16px, 패딩 16px, subtle 테두리) */
export default function StatCard({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-1 flex-col gap-2 rounded-card border border-line-subtle bg-surface p-4">
      <span className="font-serif text-2xl font-bold text-accent">{value}</span>
      <span className="text-xs font-medium text-faint">{label}</span>
    </div>
  );
}
```

`frontend/src/components/common/FilterTabs.tsx`:

```tsx
/**
 * 알약형 필터 탭 — 시안 tabs-row (모서리 20px, 패딩 16/8)
 *
 * 서버에 상태 필터 파라미터가 없으므로 이 탭은 **클라이언트 필터**다 (스펙 §7 #2).
 * 선택 상태는 호출부가 갖는다 — 이 컴포넌트는 렌더와 통지만 한다.
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
    <div className="flex gap-2">
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
                ? 'rounded-pill bg-active px-4 py-2 text-[13px] font-bold text-white'
                : 'rounded-pill border border-line-subtle bg-surface px-4 py-2 text-[13px] text-faint'
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

`frontend/src/components/common/Button.tsx`:

```tsx
import type { ReactNode } from 'react';

/**
 * 공용 버튼 2변형.
 *   solid — 시안의 강조 동작('마저 읽기' 등). ink 배경 + 흰 글씨
 *   pill  — 알약형 보조 동작
 */
export default function Button({
  children,
  onClick,
  variant = 'solid',
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'solid' | 'pill';
  disabled?: boolean;
}) {
  const base = 'text-[13px] transition-opacity disabled:opacity-40';
  const shape =
    variant === 'solid'
      ? 'rounded-lg bg-ink px-5 py-2.5 font-bold text-white'
      : 'rounded-pill border border-line-subtle bg-surface px-4 py-2 text-faint';

  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${base} ${shape}`}>
      {children}
    </button>
  );
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd frontend && npx tsc --noEmit && npm test`
Expected: 신규 4개 포함 전체 통과

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/components/common/StatCard.tsx frontend/src/components/common/StatCard.test.tsx frontend/src/components/common/FilterTabs.tsx frontend/src/components/common/FilterTabs.test.tsx frontend/src/components/common/Button.tsx
git commit -m "feat(R4): 통계 카드 · 필터 탭 · 버튼 시안 적용"
```

---

## Task 6: Header — nav-bar

**Files:**
- Modify: `frontend/src/components/Layout/Header.tsx`
- Test: `frontend/src/components/Layout/Header.test.tsx`

**Interfaces:**
- Consumes: Task 1의 토큰
- Produces: `Header({ subtitle }: { subtitle: string })`. Task 7(대시보드)이 쓴다.

> **시안의 "수진님의 서재" 제목 줄은 만들지 않는다.** 이 앱에는 계정 개념이 없고 디바이스 식별자만 있어서(team-sync §4.8) 사람 이름을 띄울 근거가 없다. 좌측 블록은 시안의 부제 한 줄만 쓴다. `title` prop을 만들지 않는다 — 쓰지 않을 인자를 열어두지 않는다(YAGNI).

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`frontend/src/components/Layout/Header.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import Header from './Header';

describe('Header', () => {
  it('부제를 렌더한다', () => {
    render(<Header subtitle="오늘도 나만의 페이스로 활자를 마주합니다." />);
    expect(screen.getByText('오늘도 나만의 페이스로 활자를 마주합니다.')).toBeInTheDocument();
  });

  it('사람 이름이 들어간 서재 제목을 렌더하지 않는다 — 계정 개념이 없다 (team-sync §4.8)', () => {
    const { container } = render(<Header subtitle="부제" />);
    expect(container.textContent).not.toMatch(/님의 서재/);
  });

  it('RE:ADD 로고를 표시한다', () => {
    render(<Header subtitle="부제" />);
    expect(screen.getByText('RE:ADD')).toBeInTheDocument();
  });

  it('도서 검색은 대응 엔드포인트가 없어 비활성이다 (스펙 §7 #3)', () => {
    render(<Header subtitle="부제" />);
    expect(screen.getByRole('button', { name: '도서 검색' })).toBeDisabled();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd frontend && npx vitest run src/components/Layout/Header.test.tsx`
Expected: FAIL — `Unable to find an element with the text: 오늘도 나만의 페이스로 활자를 마주합니다.`

- [ ] **Step 3: 구현한다**

`frontend/src/components/Layout/Header.tsx`:

```tsx
/**
 * nav-bar — 시안 1:102 (높이 80px, 하단 line 보더)
 *
 * 좌측 부제 + 우측 도서 검색·RE:ADD 로고.
 * "도서 검색"은 대응 엔드포인트가 없어 자리만 두고 비활성으로 둔다 — 없는 API를
 * 지어내지 않는다 (CLAUDE.md 6장, 스펙 §7 #3).
 *
 * ⚠️ 시안의 "수진님의 서재" 제목 줄은 만들지 않는다. 이 앱에는 계정 개념이 없고
 *    디바이스 식별자만 있어(team-sync §4.8) 사람 이름을 띄울 근거가 없다.
 */
export default function Header({ subtitle }: { subtitle: string }) {
  return (
    <header className="flex h-navbar items-center justify-between border-b border-line px-7">
      <div className="flex flex-col justify-center">
        <p className="text-[13px] text-muted">{subtitle}</p>
      </div>

      <div className="flex items-center gap-7">
        <button type="button" disabled className="text-sm text-ink disabled:opacity-40">
          도서 검색
        </button>
        <span className="font-serif text-xl font-bold tracking-widest text-ink">RE:ADD</span>
      </div>
    </header>
  );
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd frontend && npx vitest run src/components/Layout/Header.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/components/Layout/Header.tsx frontend/src/components/Layout/Header.test.tsx
git commit -m "feat(R4): nav-bar 헤더 시안 적용"
```

---

## Task 7: 대시보드 조립

**Files:**
- Modify: `frontend/src/pages/Dashboard.tsx`
- Test: `frontend/src/pages/Dashboard.test.tsx`

**Interfaces:**
- Consumes: Task 4 `BookGrid`, Task 5 `StatCard`·`FilterTabs`, Task 6 `Header`
- Produces: 없음 (최상위 페이지)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`frontend/src/pages/Dashboard.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './Dashboard';
import type { BookSummary } from '../types';

const reading: BookSummary = {
  book_id: 'takryu', title: '탁류', author: '채만식', cover_url: '',
  total_pages: 411, ssabi_ready: true, progress: { current_page: 80, percent: 64 },
};
const unread: BookSummary = {
  book_id: 'other', title: '다른 책', author: '아무개', cover_url: '',
  total_pages: 100, ssabi_ready: true,
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
  it('통계는 카탈로그에서 센다 — 진도가 있으면 읽는 중 (스펙 §7 #1)', async () => {
    renderDashboard();
    expect(await screen.findByText('탁류')).toBeInTheDocument();
    // ⚠️ "읽는 중"은 통계 라벨·필터 탭·카드 진도 라벨 세 곳에 나온다.
    //    getByText 로 찾으면 다중 매치로 실패하므로 testid 로 범위를 좁힌다.
    // 읽는 중 1권, 완독은 판정 데이터가 없어 0
    expect(screen.getByTestId('stat-reading')).toHaveTextContent('1');
    expect(screen.getByTestId('stat-reading')).toHaveTextContent('읽는 중');
    expect(screen.getByTestId('stat-done')).toHaveTextContent('0');
  });

  it('필터 탭은 클라이언트 필터다 — "읽는 중"은 진도 있는 책만 남긴다 (스펙 §7 #2)', async () => {
    renderDashboard();
    expect(await screen.findByText('탁류')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '읽는 중' }));
    expect(screen.getByText('탁류')).toBeInTheDocument();
    expect(screen.queryByText('다른 책')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '전체' }));
    expect(screen.getByText('다른 책')).toBeInTheDocument();
  });

  it('완독 필터는 데이터가 없어 빈 목록이 된다', async () => {
    renderDashboard();
    expect(await screen.findByText('탁류')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '완독' }));
    expect(screen.queryByText('탁류')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd frontend && npx vitest run src/pages/Dashboard.test.tsx`
Expected: FAIL — `Unable to find an element by: [data-testid="stat-reading"]`

- [ ] **Step 3: 구현한다**

`frontend/src/pages/Dashboard.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BookGrid from '../components/common/BookGrid';
import FilterTabs from '../components/common/FilterTabs';
import Loading from '../components/common/Loading';
import StatCard from '../components/common/StatCard';
import Header from '../components/Layout/Header';
import { fetchCatalog } from '../services/bookService';
import { enterBook } from '../services/progressService';
import { routePathFor } from '../utils/routes';
import type { BookSummary } from '../types';

type Filter = 'reading' | 'done' | 'all';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'reading', label: '읽는 중' },
  { id: 'done', label: '완독' },
  { id: 'all', label: '전체' },
];

/**
 * 대시보드 (카탈로그) — S2
 *
 * 표지 그리드 · 읽던 도서만 진도 바 + % · 미완비 도서는 클릭 불가 (FR-BRW-001·002 🚦).
 * 도서를 고르면 POST /entry 응답의 route 를 그대로 따라 이동한다 — 브리핑/읽기 판정을
 * 클라이언트가 하지 않는다 (FR-BRF-001, 자가 검증 17번).
 *
 * ⚠️ 통계·필터는 시안에 있으나 API 에 대응 필드가 없다 (스펙 §7 #1·#2).
 *    카탈로그 응답에서 프론트가 센다 — `progress` 유무로 "읽는 중"을 가른다.
 *    이건 **목록 길이 세기**이지 기준점 파생 계산이 아니므로 절대 규칙 2번과 무관하다.
 *    "완독"은 판정 데이터 자체가 없어 항상 0이며, 그 사실을 숨기지 않는다.
 */
export default function Dashboard() {
  const navigate = useNavigate();
  const [books, setBooks] = useState<BookSummary[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    void fetchCatalog().then((response) => setBooks(response.books));
  }, []);

  const readingCount = useMemo(
    () => (books ?? []).filter((book) => book.progress).length,
    [books]
  );

  const visible = useMemo(() => {
    if (!books) return [];
    if (filter === 'reading') return books.filter((book) => book.progress);
    if (filter === 'done') return []; // 완독 판정 데이터 없음 (스펙 §7 #1)
    return books;
  }, [books, filter]);

  async function handleSelect(book: BookSummary) {
    const entry = await enterBook(book.book_id);
    navigate(routePathFor(book.book_id, entry), { state: { entry } });
  }

  if (!books) return <Loading />;

  return (
    <div className="min-h-full bg-canvas">
      <Header subtitle="오늘도 나만의 페이스로 활자를 마주합니다." />

      <main className="px-7 py-6">
        <div className="mb-6 flex gap-3">
          <div data-testid="stat-reading" className="flex flex-1">
            <StatCard value={readingCount} label="읽는 중" />
          </div>
          <div data-testid="stat-done" className="flex flex-1">
            <StatCard value={0} label="완독" />
          </div>
        </div>

        <div className="mb-6">
          <FilterTabs tabs={FILTERS} active={filter} onChange={setFilter} />
        </div>

        <BookGrid books={visible} onSelect={handleSelect} />
      </main>
    </div>
  );
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd frontend && npx tsc --noEmit && npm test`
Expected: 전체 통과

- [ ] **Step 5: 브라우저로 눈으로 확인한다**

```bash
cd frontend && npm run dev
```

`http://localhost:5173/`(포트가 쓰이면 다음 번호)를 열어 **스크린샷을 본다.** 확인 항목 — 배경이 오프화이트(`#faf8f5`), 카드가 흰 배경·둥근 모서리·옅은 그림자, 표지 자리에 「탁류」가 명조로 조판, 진도 바가 보임, 통계 카드 2개와 필터 탭 3개가 시안 순서대로. **빈 화면이면 실패다.**

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/pages/Dashboard.tsx frontend/src/pages/Dashboard.test.tsx
git commit -m "feat(R4): 대시보드 시안 적용 — FR-BRW-001·002, FR-BRF-005"
```

---

## Task 8: 브리핑 화면

**Files:**
- Modify: `frontend/src/pages/BriefingView.tsx`
- Modify: `frontend/src/pages/BriefingView.test.tsx` (필요 시 쿼리 조정)

**Interfaces:**
- Consumes: Task 2 `TypographicCover`, Task 3 `ProgressBar`, Task 5 `Button`
- Produces: 없음

- [ ] **Step 1: 현재 구현과 테스트를 읽는다**

```bash
cd frontend && cat src/pages/BriefingView.tsx src/pages/BriefingView.test.tsx
```

기존 props 시그니처를 **바꾸지 않는다.** 이 태스크는 마크업과 클래스만 다룬다.

- [ ] **Step 2: 목차에 이동 요소가 없음을 고정하는 테스트를 추가한다**

`frontend/src/pages/BriefingView.test.tsx`에 추가한다(기존 케이스는 지우지 않는다):

```tsx
it('FR-BRF-004, D12: 목차 항목에 이동 가능한 요소가 없다', () => {
  // 렌더 인자는 기존 테스트의 헬퍼를 그대로 쓴다
  renderBriefing();

  const toc = screen.getByTestId('briefing-toc');
  expect(within(toc).queryAllByRole('button')).toHaveLength(0);
  expect(within(toc).queryAllByRole('link')).toHaveLength(0);
});
```

`within`을 `@testing-library/react`에서 import한다. `renderBriefing()`은 기존 테스트 파일의 헬퍼를 재사용하고, 없으면 기존 `render(...)` 호출을 그대로 복사해 쓴다.

- [ ] **Step 3: 테스트가 실패하는지 확인한다**

Run: `cd frontend && npx vitest run src/pages/BriefingView.test.tsx`
Expected: FAIL — `Unable to find an element by: [data-testid="briefing-toc"]`

- [ ] **Step 4: 시안대로 마크업·스타일을 입힌다**

구조는 시안 `1:477` 순서를 따른다.

```
표지(TypographicCover, 폭 축소) | "N일 만이에요" · 인사 2줄 · 제목·저자
현재 장 + percent  →  ProgressBar
"그동안 이런 이야기였어요"  →  리캡 본문 카드 (rounded-card, border-line)
"목차"  →  data-testid="briefing-toc" 리스트 (표시 전용)
'마저 읽기'  →  Button variant="solid"
```

핵심 클래스: 페이지 `bg-canvas px-7 py-6`, 리캡 카드 `rounded-card border border-line bg-surface p-6 text-sm leading-relaxed text-muted`, 목차 행 `flex items-center gap-3 rounded-card border border-line bg-surface px-5 py-4`, 장 번호 뱃지 `flex size-7 items-center justify-center rounded-full bg-canvas font-serif text-xs text-accent`.

**목차 행을 `<li>`로만 만든다.** `<button>`·`<a>`·`onClick`을 넣지 않는다 — 이동하면 기준점이 갱신되어 방금 표시한 리캡이 무효가 되고(R8), 브리핑에서 LLM 호출을 없앤 설계가 깨진다(FR-BRF-004, D12).

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `cd frontend && npx tsc --noEmit && npm test`
Expected: 전체 통과. 기존 브리핑 테스트(빈 상태 분기·폴백 호출·'마저 읽기' 독립 동작)가 **그대로** 통과해야 한다

- [ ] **Step 6: 브라우저로 확인한다**

`http://localhost:5173/` → 도서 카드 클릭 → 브리핑. 스크린샷을 보고 리캡 카드·목차·'마저 읽기'가 시안 형태인지, 목차에 버튼이 없는지 확인한다.

- [ ] **Step 7: 커밋**

```bash
git add frontend/src/pages/BriefingView.tsx frontend/src/pages/BriefingView.test.tsx
git commit -m "feat(R4): 브리핑 화면 시안 적용 — FR-BRF-003·004, D12"
```

---

## Task 9: 읽기 화면 셸

**Files:**
- Modify: `frontend/src/components/Reader/ReaderView.tsx`
- Modify: `frontend/src/pages/Reader.tsx`
- Modify: `frontend/src/components/Reader/ReaderView.test.tsx`

**Interfaces:**
- Consumes: Task 1의 토큰
- Produces: 없음. `ReaderView`의 props 시그니처는 **바꾸지 않는다** (`content`, `currentPage`, `totalPages`, `prevPage`, `nextPage`, `onMove`).

- [ ] **Step 1: 진도 바 부재를 고정하는 테스트를 추가한다**

`frontend/src/components/Reader/ReaderView.test.tsx`에 추가한다:

```tsx
it('FR-PRG-004: 읽기 화면에는 진도 바가 없다 — 페이지 번호만 표시한다', () => {
  render(
    <ReaderView
      content="본문"
      currentPage={21}
      totalPages={30}
      prevPage={20}
      nextPage={22}
      onMove={() => {}}
    />
  );

  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  expect(screen.getByText('21 / 30')).toBeInTheDocument();
});

it('FR-PRG-001: 본문 영역이 스크롤 컨테이너다 — 재분할 없이 길이만 늘어난다', () => {
  render(
    <ReaderView content="본문" currentPage={1} totalPages={30} prevPage={null} nextPage={2} onMove={() => {}} />
  );
  expect(screen.getByRole('article').className).toMatch(/overflow-y-auto/);
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd frontend && npx vitest run src/components/Reader/ReaderView.test.tsx`
Expected: 첫 케이스는 이미 통과할 수 있다(진도 바가 원래 없다). 두 번째가 실패하면 구현 후 통과시킨다. **둘 다 통과하면 그대로 두고 Step 3으로 간다** — 이 두 케이스는 회귀 방지용 고정이다.

- [ ] **Step 3: 시안대로 스타일을 입힌다**

`frontend/src/components/Reader/ReaderView.tsx` — 주석 블록은 그대로 두고 JSX만 바꾼다:

```tsx
  return (
    <main className="flex h-full flex-col bg-canvas">
      <article
        role="article"
        className="mx-auto w-full max-w-[640px] flex-1 overflow-y-auto whitespace-pre-wrap px-8 py-10 font-serif text-[17px] leading-[2] text-ink"
      >
        {content}
      </article>

      <nav className="flex items-center justify-between border-t border-line px-8 py-4 text-[13px] text-muted">
        <button
          type="button"
          disabled={prevPage === null}
          onClick={() => prevPage !== null && onMove(prevPage)}
          className="disabled:opacity-40"
        >
          이전 페이지
        </button>

        <span className="font-sans text-ink">{formatPageIndicator(currentPage, totalPages)}</span>

        <button
          type="button"
          disabled={nextPage === null}
          onClick={() => nextPage !== null && onMove(nextPage)}
          className="disabled:opacity-40"
        >
          다음 페이지
        </button>
      </nav>
    </main>
  );
```

> `leading-[2]`·`max-w-[640px]`는 **읽기 조판**이지 페이지 분할이 아니다. 폰트나 창 크기가 바뀌면 이 영역의 스크롤 길이만 변하고 페이지 번호는 그대로다 (FR-PRG-001, 절대 규칙 10번).

- [ ] **Step 4: top-bar 를 붙인다**

`frontend/src/pages/Reader.tsx`의 좌우 분할 컨테이너 위에 시안 `top-bar`를 넣는다.

```tsx
<div className="flex h-navbar shrink-0 items-center justify-between border-b border-line bg-surface px-8">
  <div className="flex items-center gap-4">
    <span className="font-serif text-lg font-bold tracking-widest text-ink">RE:ADD</span>
    <span className="text-xs text-muted">탁류</span>
  </div>
  <span className="text-sm font-bold text-ink">{chapterTitle}</span>
</div>
```

`chapterTitle`은 이미 페이지가 갖고 있는 값을 쓴다. **없으면 이 span 자체를 렌더하지 않는다** — 없는 값을 지어내지 않는다. 좌우 분할은 기존 구조를 유지하되 컨테이너에 `flex h-full`, 본문 쪽에 `flex-1`, 패널 쪽에 `w-[420px] shrink-0`를 준다(시안 ssabi-panel 폭 420px).

- [ ] **Step 5: 검증**

Run: `cd frontend && npx tsc --noEmit && npm test`
Expected: 전체 통과

- [ ] **Step 6: 브라우저로 확인한다**

브리핑 → '마저 읽기' → 읽기 화면. **본문이 명조로 넉넉한 행간에 조판되고, 하단에 진도 바 없이 "21 / 30"만 있는지** 스크린샷으로 확인한다.

- [ ] **Step 7: 커밋**

```bash
git add frontend/src/components/Reader/ReaderView.tsx frontend/src/components/Reader/ReaderView.test.tsx frontend/src/pages/Reader.tsx
git commit -m "feat(R4): 읽기 화면 셸 시안 적용 — FR-PRG-001·004"
```

---

## Task 10: 싸비 패널 셸 — 헤더 + 탭 바

**Files:**
- Modify: `frontend/src/components/Ssabi/SsabiPanel.tsx`
- Modify: `frontend/src/components/Ssabi/SsabiPanel.test.tsx`

**Interfaces:**
- Consumes: Task 1의 토큰
- Produces: 없음. props 시그니처와 탭 상태 로직(`resolveSsabiTab`, `sessionEpoch` 처리)을 **바꾸지 않는다.**

- [ ] **Step 1: 탭이 3개임을 고정하는 테스트를 추가한다**

`frontend/src/components/Ssabi/SsabiPanel.test.tsx`에 추가한다:

```tsx
it('G8: 탭은 3개다 — 시안의 타임라인 탭은 만들지 않는다 (00-shared §2.5 "[이후 확장]")', () => {
  renderPanel(); // 기존 테스트 헬퍼 재사용
  const tabs = screen.getAllByRole('tab');
  expect(tabs).toHaveLength(3);
  expect(tabs.map((t) => t.textContent)).toEqual(['리캡', '인물 관계도', '챗봇']);
  expect(screen.queryByRole('tab', { name: '타임라인' })).not.toBeInTheDocument();
});
```

`renderPanel()`이 기존 파일에 없으면 그 파일의 기존 `render(<SsabiPanel ... />)` 호출을 그대로 복사해 쓴다.

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd frontend && npx vitest run src/components/Ssabi/SsabiPanel.test.tsx`
Expected: PASS 가능 — `TAB_ORDER`가 이미 3개다. 통과하면 그대로 두고 다음으로 간다(회귀 방지 고정).

- [ ] **Step 3: 패널 헤더와 탭 바에 스타일을 입힌다**

`SsabiPanel.tsx`의 `return` 부분만 바꾼다. **상태 로직(`lastTab`, `previousEpoch`, `resolveSsabiTab`)은 손대지 않는다.**

```tsx
  return (
    <section className="flex h-full flex-col border-l border-line bg-surface">
      <div className="flex items-center gap-2 px-6 pb-4 pt-6">
        <span className="font-serif text-base font-bold text-ink">싸비의 가이드북</span>
      </div>

      <div role="tablist" aria-label="싸비" className="flex gap-1 border-b border-line px-6">
        {TAB_ORDER.map((it) => (
          <button
            key={it}
            role="tab"
            type="button"
            aria-selected={tab === it}
            onClick={() => setLastTab(it)}
            className={
              tab === it
                ? '-mb-px border-b-2 border-ink px-3 py-2 text-[13px] font-bold text-ink'
                : 'px-3 py-2 text-[13px] text-faint'
            }
          >
            {TAB_LABELS[it]}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="flex-1 overflow-y-auto px-6 py-5">
        {tab === 'recap' ? (
          <RecapTab text={recapText} streaming={recapStreaming} failed={recapFailed} />
        ) : null}
        {tab === 'relationship' ? <RelationshipTab graph={graph} failed={graphFailed} /> : null}
        {tab === 'chatbot' ? (
          <ChatbotTab
            answer={chatAnswer}
            streaming={chatStreaming}
            error={chatError}
            onAsk={onAsk}
          />
        ) : null}
      </div>
    </section>
  );
```

- [ ] **Step 4: 검증**

Run: `cd frontend && npx tsc --noEmit && npm test`
Expected: 전체 통과 — 특히 기존 FR-SVB-002(기본 탭 = 인물 관계도)·FR-SVB-004(세션 경계 초기화) 테스트가 살아 있어야 한다

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/components/Ssabi/SsabiPanel.tsx frontend/src/components/Ssabi/SsabiPanel.test.tsx
git commit -m "feat(R4): 싸비 패널 헤더·탭 바 시안 적용 — FR-SVB-002·004"
```

---

## Task 11: 인물 관계도 — React Flow 원형 배치

**Files:**
- Create: `frontend/src/components/Ssabi/graphLayout.ts`
- Modify: `frontend/src/components/Ssabi/RelationshipGraph.tsx`
- Modify: `frontend/src/components/Ssabi/RelationshipTab.tsx`
- Test: `frontend/src/components/Ssabi/graphLayout.test.ts`
- Modify: `frontend/src/components/Ssabi/RelationshipTab.test.tsx` (없으면 생성)

**Interfaces:**
- Consumes: `GraphResponse`(`src/types/ssabi.ts`) — `{ nodes: GraphNode[]; edges: GraphEdge[] }`
- Produces:
  - `circularLayout(count: number, options?: { radius?: number; center?: { x: number; y: number } }): { x: number; y: number }[]`
  - `RelationshipGraph({ graph }: { graph: GraphResponse })`

- [ ] **Step 1: 배치 함수의 실패하는 테스트를 쓴다**

`frontend/src/components/Ssabi/graphLayout.test.ts`:

```ts
import { circularLayout } from './graphLayout';

describe('circularLayout', () => {
  it('노드 개수만큼 좌표를 만든다', () => {
    expect(circularLayout(5)).toHaveLength(5);
    expect(circularLayout(0)).toHaveLength(0);
  });

  it('첫 노드는 12시 방향에 놓인다', () => {
    const [first] = circularLayout(4, { radius: 100, center: { x: 0, y: 0 } });
    expect(first.x).toBeCloseTo(0, 5);
    expect(first.y).toBeCloseTo(-100, 5);
  });

  it('노드가 원주에 균등 분포한다 — 4개면 90도 간격', () => {
    const points = circularLayout(4, { radius: 100, center: { x: 0, y: 0 } });
    expect(points[1].x).toBeCloseTo(100, 5); // 3시
    expect(points[1].y).toBeCloseTo(0, 5);
    expect(points[2].x).toBeCloseTo(0, 5); // 6시
    expect(points[2].y).toBeCloseTo(100, 5);
  });

  it('모든 노드가 중심에서 같은 거리에 있다', () => {
    const center = { x: 200, y: 150 };
    for (const p of circularLayout(7, { radius: 120, center })) {
      const d = Math.hypot(p.x - center.x, p.y - center.y);
      expect(d).toBeCloseTo(120, 5);
    }
  });

  it('노드가 1개면 중심에 놓는다 — 원주에 혼자 두면 한쪽으로 치우친다', () => {
    const [only] = circularLayout(1, { radius: 100, center: { x: 50, y: 50 } });
    expect(only).toEqual({ x: 50, y: 50 });
  });

  it('같은 입력에 같은 좌표를 낸다 — 렌더마다 흔들리지 않는다', () => {
    expect(circularLayout(5)).toEqual(circularLayout(5));
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd frontend && npx vitest run src/components/Ssabi/graphLayout.test.ts`
Expected: FAIL — `Failed to resolve import "./graphLayout"`

- [ ] **Step 3: 배치 함수를 구현한다**

`frontend/src/components/Ssabi/graphLayout.ts`:

```ts
/**
 * 관계도 원형 배치 — 스펙 §6
 *
 * React Flow 는 노드 좌표를 요구한다. dagre·elkjs 같은 레이아웃 라이브러리를 추가하지 않고
 * 원주에 균등 분포시킨다 — 인물 5명 규모에서 시안과 유사한 방사형이 나오고, 새 의존성이 없다.
 *
 * 같은 입력에 항상 같은 좌표를 낸다. 렌더마다 노드가 튀면 사용자가 관계를 추적할 수 없다.
 */

export interface Point {
  x: number;
  y: number;
}

const DEFAULT_RADIUS = 140;
const DEFAULT_CENTER: Point = { x: 180, y: 180 };

export function circularLayout(
  count: number,
  options: { radius?: number; center?: Point } = {}
): Point[] {
  const radius = options.radius ?? DEFAULT_RADIUS;
  const center = options.center ?? DEFAULT_CENTER;

  if (count <= 0) return [];
  // 노드가 하나뿐이면 원주에 두지 않는다 — 혼자 12시에 붙어 화면이 치우친다
  if (count === 1) return [{ ...center }];

  return Array.from({ length: count }, (_, i) => {
    const theta = (2 * Math.PI * i) / count - Math.PI / 2; // 12시에서 시작
    return {
      x: center.x + radius * Math.cos(theta),
      y: center.y + radius * Math.sin(theta),
    };
  });
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd frontend && npx vitest run src/components/Ssabi/graphLayout.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: 그래프 렌더의 실패하는 테스트를 쓴다**

`frontend/src/components/Ssabi/RelationshipTab.test.tsx`(없으면 생성, 있으면 케이스 추가):

```tsx
import { render, screen } from '@testing-library/react';
import RelationshipTab from './RelationshipTab';
import type { GraphResponse } from '../../types';

const graph = {
  nodes: [
    { id: 'c1', name: '정주사', first_appearance_page: 1, aliases: ['정 주사'] },
    { id: 'c2', name: '초봉', first_appearance_page: 3, aliases: [] },
  ],
  edges: [{ source: 'c1', target: 'c2', label: '부녀', established_page: 5 }],
} as GraphResponse;

describe('RelationshipTab', () => {
  it('NFR-USE-006: 관계 라벨을 글자로 병기한다 — 색상만으로 구분하지 않는다', () => {
    render(<RelationshipTab graph={graph} failed={false} />);
    expect(screen.getByText('부녀')).toBeInTheDocument();
  });

  it('인물 이름을 렌더한다', () => {
    render(<RelationshipTab graph={graph} failed={false} />);
    expect(screen.getByText('정주사')).toBeInTheDocument();
    expect(screen.getByText('초봉')).toBeInTheDocument();
  });

  it('FR-SPL-005 🚦: 조회 실패는 부분 표시로 넘어가지 않는다', () => {
    render(<RelationshipTab graph={null} failed={true} />);
    expect(screen.getByRole('alert')).toHaveTextContent('관계도를 불러오지 못했습니다');
    expect(screen.queryByText('정주사')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 6: RelationshipGraph 를 구현한다**

`frontend/src/components/Ssabi/RelationshipGraph.tsx`:

```tsx
import { ReactFlow, Background, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { GraphResponse } from '../../types';
import { circularLayout } from './graphLayout';

/**
 * 관계도 그래프 렌더 — S4
 * 서버 JSON(nodes/edges)을 그대로 그린다. 라벨을 병기하며 색상만으로 구분하지 않는다 (NFR-USE-006)
 * 간선은 이력형 최신 라벨 1개만 내려온다 (A6, FR-CHR-001 🚦)
 *
 * 라이브러리: React Flow (@xyflow/react) — TECH_STACK.md 의 두 후보 중 8/20 선택.
 * 좌표는 graphLayout.ts 의 원형 배치로 만든다 (스펙 §6).
 *
 * ⚠️ 여기서 노드·간선을 걸러내지 않는다. 서버가 이미 기준점 이하로 필터해 내려보냈고,
 *    초과 여부를 판별하는 코드를 프론트에 두지 않는다 (절대 규칙 7번).
 */
export default function RelationshipGraph({ graph }: { graph: GraphResponse }) {
  const positions = circularLayout(graph.nodes.length);

  const nodes: Node[] = graph.nodes.map((node, i) => ({
    id: node.id,
    position: positions[i],
    data: { label: node.name },
    type: 'default',
    draggable: false,
    style: {
      background: '#ffffff',
      border: '1px solid #ebe6e0',
      borderRadius: 9999,
      padding: '8px 14px',
      fontSize: 12,
      color: '#1c1b1a',
    },
  }));

  const edges: Edge[] = graph.edges.map((edge) => ({
    id: `${edge.source}-${edge.target}`,
    source: edge.source,
    target: edge.target,
    label: edge.label, // NFR-USE-006 — 글자로 병기
    labelStyle: { fontSize: 11, fill: '#6e6a66' },
    style: { stroke: '#ebe6e0' },
  }));

  return (
    <div className="h-[280px] w-full overflow-hidden rounded-card border border-line bg-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#ebe6e0" gap={16} />
      </ReactFlow>
    </div>
  );
}
```

- [ ] **Step 7: RelationshipTab 에 그래프와 인물 카드를 붙인다**

`RelationshipTab.tsx` — 기존 실패·로딩 분기는 그대로 두고, 본문을 그래프 + 인물 카드 목록으로 바꾼다.

```tsx
  return (
    <div className="space-y-4">
      <RelationshipGraph graph={graph} />

      <ul className="space-y-3">
        {graph.nodes.map((node) => (
          <li key={node.id} className="rounded-card border border-line bg-surface p-4">
            <div className="flex items-baseline justify-between">
              <span className="font-serif text-sm font-bold text-ink">{node.name}</span>
              {node.aliases.length > 0 ? (
                <span className="text-[11px] text-muted">{node.aliases.join(', ')}</span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <ul className="space-y-2">
        {graph.edges.map((edge) => (
          <li key={`${edge.source}-${edge.target}`} className="text-xs text-muted">
            {nameOf(edge.source)} — {nameOf(edge.target)} : <span className="text-ink">{edge.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
```

`nameOf`는 컴포넌트 안에 둔다:

```tsx
  const nameOf = (id: string) => graph.nodes.find((n) => n.id === id)?.name ?? id;
```

간선 라벨이 그래프와 목록 **양쪽**에 글자로 나오므로 NFR-USE-006을 확실히 지킨다.

- [ ] **Step 8: 검증**

Run: `cd frontend && npx tsc --noEmit && npm test`
Expected: 전체 통과

React Flow는 jsdom에서 크기를 0으로 잡아 경고를 낼 수 있다. **경고는 무시하되 테스트가 실패하면** 라벨 검증을 그래프가 아닌 목록 쪽에서 하도록 쿼리를 옮긴다 — 검증의 의미(라벨이 글자로 존재)는 유지된다.

- [ ] **Step 9: 브라우저로 확인한다**

읽기 화면 → 인물 관계도 탭. **원형으로 배치된 노드와 라벨이 붙은 연결선이 보이는지** 스크린샷으로 확인한다. 노드가 겹치거나 화면 밖으로 나가면 `circularLayout`의 `radius`를 줄인다.

- [ ] **Step 10: 커밋**

```bash
git add frontend/src/components/Ssabi/graphLayout.ts frontend/src/components/Ssabi/graphLayout.test.ts frontend/src/components/Ssabi/RelationshipGraph.tsx frontend/src/components/Ssabi/RelationshipTab.tsx frontend/src/components/Ssabi/RelationshipTab.test.tsx
git commit -m "feat(R4): 인물 관계도 React Flow 렌더 — FR-CHR-001, NFR-USE-006"
```

---

## Task 12: 리캡 · 챗봇 탭

**Files:**
- Modify: `frontend/src/components/Ssabi/RecapTab.tsx`
- Modify: `frontend/src/components/Ssabi/ChatbotTab.tsx`

**Interfaces:**
- Consumes: Task 1의 토큰
- Produces: 없음. 두 컴포넌트의 props 시그니처를 **바꾸지 않는다.**

- [ ] **Step 1: 현재 구현을 읽는다**

```bash
cd frontend && cat src/components/Ssabi/RecapTab.tsx src/components/Ssabi/ChatbotTab.tsx
```

- [ ] **Step 2: 리캡 탭에 스타일을 입힌다**

본문 텍스트에 `text-[13px] leading-[1.7] text-muted whitespace-pre-wrap`를 준다. 스트리밍 중 표시와 실패 표시(`role="alert"`)의 **분기 구조는 바꾸지 않는다** — 기존 테스트가 이 분기를 검증한다.

- [ ] **Step 3: 챗봇 탭에 스타일을 입힌다**

시안 `79:1254` 구조를 따른다.

```
선택 문장 인용    rounded-card border-l-4 border-accent bg-canvas px-4 py-3 text-xs text-muted
추천 질문 칩      rounded-pill border border-line-subtle px-3 py-1.5 text-[11px] text-faint
사용자 말풍선     ml-auto max-w-[80%] rounded-card bg-canvas px-4 py-2.5 text-xs text-ink
싸비 말풍선       mr-auto max-w-[85%] rounded-card bg-canvas px-4 py-2.5 text-xs leading-relaxed text-ink
입력창            flex items-center gap-2 rounded-pill border border-line bg-surface px-4 py-2.5
```

**근거 부재 응답을 특별 취급하지 않는다.** 서버가 통일 문구를 일반 delta 로 흘려보내므로 프론트는 그냥 답변으로 렌더한다 — 거절 여부를 판별하는 분기를 만들면 그게 판별기다 (FR-QNA-004 🚦, 절대 규칙 7번).

- [ ] **Step 4: 검증**

Run: `cd frontend && npx tsc --noEmit && npm test`
Expected: 전체 통과

- [ ] **Step 5: 브라우저로 4화면 전체를 확인한다**

대시보드 → 브리핑 → 읽기 → 싸비 3탭을 차례로 눌러 **각 화면의 스크린샷을 본다.** 태블릿 가로(1133×744)를 기준 뷰포트로 맞춘다.

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/components/Ssabi/RecapTab.tsx frontend/src/components/Ssabi/ChatbotTab.tsx
git commit -m "feat(R4): 리캡·챗봇 탭 시안 적용 — FR-QNA-004"
```

---

## 완료 확인

- [ ] `cd frontend && npx tsc --noEmit` — 타입 에러 0건
- [ ] `cd frontend && npm test` — 기존 77개 + 신규 약 30개 전부 통과
- [ ] 태블릿 가로(1133×744)에서 4화면 스크린샷 확인 — 빈 화면 0건
- [ ] 게이트 검증 3개가 테스트에 살아 있는지 확인: 읽기 화면 진도 바 부재(FR-PRG-004) · 관계 라벨 글자 병기(NFR-USE-006) · 미완비 도서 비활성(FR-BRW-002 🚦)
- [ ] `git log --oneline` — 태스크당 커밋 1개, 형식 `feat(R4): … — 조항 ID`

**여기서 끝나지 않는 것** — 이 계획은 `VITE_USE_MOCK=true` 기준으로 화면을 완성한다. 실제 백엔드와 붙는 것은 조회 엔드포인트 5종 구현(`docs/superpowers/plans/2026-08-20-r4-query-endpoints.md`) 이후 CP3의 몫이다.

---

## Self-Review 기록

**Spec coverage** — 스펙 §3 토큰(Task 1) · §3.1 서체(Task 1) · §4.1 신규 4개(Task 2·4·5) · §4.2 스텁 4개(Task 3 ProgressBar, Task 5 Button, Task 6 Header, Task 11 RelationshipGraph) · §5.1 대시보드(Task 7) · §5.2 브리핑(Task 8) · §5.3 읽기+패널(Task 9·10·12) · §6 관계도 배치(Task 11) · §7 불일치 5건(#1·#2 Task 7, #3 Task 6, #4 Task 2, #5 Task 4) · §7.1 탭 3개(Task 10) · §8 테스트 원칙(G9 + 각 태스크의 게이트 케이스).

**정정 2건** — ① 스펙 §4.2가 `ProgressBar`를 `common/`에 뒀으나 실제 경로는 `Reader/`다. 파일을 옮기지 않고 실제 경로를 쓴다. ② 스펙이 스텁을 5개로 셌으나 실제로는 7개다(`PageContent`·`PageNavigation` 추가). 둘은 어디서도 import되지 않고 `ReaderView`와 역할이 겹치므로 **범위 밖으로 명시**했다.

**Type consistency** — `TypographicCover({title, author, coverUrl})`를 Task 4가 같은 이름으로 호출한다. `ProgressBar({percent})`가 Task 3·4에서 동일하다. `circularLayout(count, {radius, center})`를 Task 11 Step 6이 `circularLayout(graph.nodes.length)`로 호출한다(옵션 생략 → 기본값). `FilterTabs`의 제네릭 `T`가 Task 7의 `Filter` 타입과 맞는다. `BookGrid({books, onSelect})` 시그니처는 Task 4에서 유지되어 Task 7의 호출부가 그대로 동작한다.

**Placeholder scan** — "적절히 스타일링" 류 없음. Task 8·12는 기존 파일을 읽는 스텝을 먼저 두고 클래스 값을 표로 명시했다(전체 코드를 싣지 않은 이유는 기존 분기 구조를 보존해야 하기 때문이며, 바꿀 값은 전부 구체적으로 적었다).
