# 본문 읽기 화면(+싸비 패널) 재설계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 읽기 화면(`Reader.tsx`)과 싸비 패널(3탭)을 확정된 목업(`.reader-scr`)대로 정확히 구현한다 — 페이지 번호 직접 입력, 패널 드래그 리사이즈, 전면 brief-* 톤 전환까지.

**Architecture:** `.reader-scr`의 CSS 변수가 브리핑(`.brief-scr`)과 완전히 동일해 새 브랜드 팔레트를 또 만들지 않는다 — `brief-*` 토큰을 그대로 재사용하고, 읽기 영역 전용 배경(`brief-page`) 하나만 추가한다. 리캡·관계도·챗봇은 이미 실동작하는 기능이라 로직은 건드리지 않고 색·서체·레이아웃만 옮긴다. 신규 기능은 페이지 직접 입력과 패널 드래그 리사이즈 둘뿐이다.

**Tech Stack:** React 18 + TypeScript, Tailwind CSS, @xyflow/react, Vitest + Testing Library.

**Spec:** https://claude.ai/code/artifact/7cbdf443-c597-405c-b453-02d3d0a8c17f — `.reader-scr` 스코프(stage 03, 인터랙티브 데모). Claude Artifact이며 저장소 파일이 아니다. 실측값은 이 계획에 그대로 옮겨져 있다.

## Global Constraints

- **색·그림자 실측값** (`.reader-scr` CSS 변수, `.brief-scr`와 동일 + `--page` 추가):
  ```
  paper:#fbf8f2  page:#f6f1e4  panel:#ffffff  ink:#2a2620  muted:#8c8473  rule:#d3c6a8
  accent:#4b3fd6  accent-soft:#f1effc
  shadow: 0 10px 24px rgba(42,38,32,.07), 0 2px 6px rgba(42,38,32,.05)
  shadow-sm: 0 4px 10px rgba(42,38,32,.08)
  ```
- **서체는 새로 안 만든다.** `font-dashSerif`(Noto Serif KR)·`font-dashSans`(Pretendard)·`font-dashMono`(DM Mono)를 재사용한다.
- **`faint`(보조 색 2단계)는 이 시스템에 없다.** 브리핑 재설계 때도 `muted` 하나만 썼다 — 읽기 화면의 "스트리밍 중" 표시도 `brief-muted`로 통일한다(2단계 대비를 만들지 않는다).
- **페이지 직접 입력**은 `fetchPage(bookId, pageNo)`(R4 소유, 상한 대상 아님)를 그대로 호출한다 — 1~totalPages로 clamp만 하고 서버 파생값을 계산하지 않는다.
- **드래그 리사이즈**: `MIN_PANEL_W = 380`, 최대는 부모 요소 폭의 50%. 닫혀 있으면 리사이즈 불가.
- **관계도(React Flow)·되감기 슬라이더·리캡 스트리밍·챗봇 SSE 로직은 건드리지 않는다** — 색과 레이아웃만 바꾼다.
- **리캡 탭에 인물 이름 자동 강조를 만들지 않는다** — 식별 근거(데이터 소스)가 없어 지어낸 판정이 된다.
- **워드마크·책 제목 텍스트를 topbar에서 뺀다** — 목업에 없고, 다른 화면(브리핑)과도 일관된다.

---

### Task 1: brief-page 토큰 + usePanelResize 훅

**Files:**
- Modify: `frontend/tailwind.config.js`
- Test: `frontend/src/pages/__tests__/readerTokens.test.ts`
- Create: `frontend/src/hooks/usePanelResize.ts`
- Test: `frontend/src/hooks/usePanelResize.test.ts`

**Interfaces:**
- Produces: Tailwind 클래스 `bg-brief-page`.
- Produces: `usePanelResize(options)` 훅 —
  ```ts
  function usePanelResize(options: { minWidth: number; getMaxWidth: () => number }): {
    width: number;
    isDragging: boolean;
    handleProps: {
      onMouseDown: (e: React.MouseEvent) => void;
      onTouchStart: (e: React.TouchEvent) => void;
    };
  }
  ```
  Task 8이 이 훅으로 `<aside>` 폭을 제어한다.

- [ ] **Step 1: 실패하는 토큰 테스트 작성**

```ts
// frontend/src/pages/__tests__/readerTokens.test.ts
import { describe, expect, it } from 'vitest';
import config from '../../../tailwind.config.js';

describe('읽기 화면 재설계 — 신규 토큰', () => {
  it('brief-page 배경 토큰이 시안 실측값과 일치한다', () => {
    const brief = (config.theme!.extend!.colors as Record<string, unknown>).brief as Record<
      string,
      string
    >;
    expect(brief.page).toBe('#f6f1e4');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && npx vitest run src/pages/__tests__/readerTokens.test.ts`
Expected: FAIL — `colors.brief.page`가 없다.

- [ ] **Step 3: tailwind.config.js에 토큰 추가**

`colors.brief` 블록에 `page: '#f6f1e4',` 한 줄 추가(기존 paper/ink/muted/line/rule/accent/accent-soft 유지):

```js
        brief: {
          paper: '#fbf8f2',
          page: '#f6f1e4',
          ink: '#2a2620',
          muted: '#8c8473',
          line: '#ece6d8',
          rule: '#d3c6a8',
          accent: '#4b3fd6',
          'accent-soft': '#f1effc',
        },
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd frontend && npx vitest run src/pages/__tests__/readerTokens.test.ts`
Expected: PASS

- [ ] **Step 5: 실패하는 usePanelResize 테스트 작성**

```ts
// frontend/src/hooks/usePanelResize.test.ts
import { act, renderHook } from '@testing-library/react';
import { usePanelResize } from './usePanelResize';

function fireMouseEvent(target: EventTarget, type: string, clientX: number) {
  const event = new MouseEvent(type, { clientX, bubbles: true });
  target.dispatchEvent(event);
}

describe('usePanelResize', () => {
  it('초기 폭은 minWidth다', () => {
    const { result } = renderHook(() => usePanelResize({ minWidth: 380, getMaxWidth: () => 800 }));
    expect(result.current.width).toBe(380);
  });

  it('핸들을 왼쪽으로 드래그하면(더 왼쪽 = 더 넓게) 폭이 늘어난다', () => {
    const { result } = renderHook(() => usePanelResize({ minWidth: 380, getMaxWidth: () => 800 }));

    act(() => {
      result.current.handleProps.onMouseDown({
        clientX: 500,
        preventDefault: () => {},
      } as unknown as React.MouseEvent);
    });
    expect(result.current.isDragging).toBe(true);

    act(() => {
      fireMouseEvent(window, 'mousemove', 460); // 40px 왼쪽으로 — 패널이 40px 넓어진다
    });
    expect(result.current.width).toBe(420);

    act(() => {
      fireMouseEvent(window, 'mouseup', 460);
    });
    expect(result.current.isDragging).toBe(false);
  });

  it('minWidth보다 좁아지지 않는다', () => {
    const { result } = renderHook(() => usePanelResize({ minWidth: 380, getMaxWidth: () => 800 }));
    act(() => {
      result.current.handleProps.onMouseDown({
        clientX: 500,
        preventDefault: () => {},
      } as unknown as React.MouseEvent);
    });
    act(() => {
      fireMouseEvent(window, 'mousemove', 700); // 오른쪽으로 200px — 패널이 좁아지려 한다
    });
    expect(result.current.width).toBe(380);
  });

  it('getMaxWidth()보다 넓어지지 않는다', () => {
    const { result } = renderHook(() => usePanelResize({ minWidth: 380, getMaxWidth: () => 500 }));
    act(() => {
      result.current.handleProps.onMouseDown({
        clientX: 500,
        preventDefault: () => {},
      } as unknown as React.MouseEvent);
    });
    act(() => {
      fireMouseEvent(window, 'mousemove', 0); // 왼쪽으로 500px — max(500)를 넘으려 한다
    });
    expect(result.current.width).toBe(500);
  });
});
```

- [ ] **Step 6: 실패 확인**

Run: `cd frontend && npx vitest run src/hooks/usePanelResize.test.ts`
Expected: FAIL — 파일이 없다.

- [ ] **Step 7: 구현**

```ts
// frontend/src/hooks/usePanelResize.ts
import { useCallback, useRef, useState } from 'react';

/**
 * 싸비 패널 드래그 리사이즈 — 시안 읽기 화면(2026-08-23, `.reader-scr .resize-handle`)
 *
 * 원본은 vanilla JS로 mousedown → mousemove(window) → mouseup(window) 리스너를 직접
 * 붙였다 반응형으로 옮기면서 같은 흐름을 훅으로 감쌌다 — 드래그 중 폭은 항상
 * [minWidth, getMaxWidth()] 사이로 clamp된다. 핸들은 패널 **왼쪽** 모서리에 있어 마우스가
 * 왼쪽으로 갈수록(clientX가 작아질수록) 패널이 넓어진다(delta = startX - pointX).
 *
 * 패널을 닫았다 열어도 마지막 폭을 기억한다 — 이 훅의 상태(width)는 언마운트되지 않는 한
 * 유지되므로, 호출부(Reader.tsx)가 훅 자체를 계속 살려두면 자동으로 만족된다.
 */
export function usePanelResize({
  minWidth,
  getMaxWidth,
}: {
  minWidth: number;
  getMaxWidth: () => number;
}) {
  const [width, setWidth] = useState(minWidth);
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef(0);
  const startWidth = useRef(minWidth);

  const clamp = useCallback(
    (px: number) => Math.max(minWidth, Math.min(px, getMaxWidth())),
    [minWidth, getMaxWidth]
  );

  const onMove = useCallback(
    (clientX: number) => {
      const delta = startX.current - clientX;
      setWidth(clamp(startWidth.current + delta));
    },
    [clamp]
  );

  const startDrag = useCallback(
    (clientX: number) => {
      startX.current = clientX;
      startWidth.current = width;
      setIsDragging(true);

      function handleMouseMove(e: MouseEvent) {
        onMove(e.clientX);
      }
      function handleTouchMove(e: TouchEvent) {
        if (e.touches[0]) onMove(e.touches[0].clientX);
      }
      function stop() {
        setIsDragging(false);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', stop);
        window.removeEventListener('touchmove', handleTouchMove);
        window.removeEventListener('touchend', stop);
      }

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', stop);
      window.addEventListener('touchmove', handleTouchMove, { passive: false });
      window.addEventListener('touchend', stop);
    },
    [width, onMove]
  );

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      startDrag(e.clientX);
    },
    [startDrag]
  );

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches[0]) startDrag(e.touches[0].clientX);
    },
    [startDrag]
  );

  return { width, isDragging, handleProps: { onMouseDown, onTouchStart } };
}
```

- [ ] **Step 8: 테스트 통과 확인**

Run: `cd frontend && npx vitest run src/hooks/usePanelResize.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 9: 전체 검증 및 커밋**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: tsc 0건, 전체 테스트 통과.

```bash
git add frontend/tailwind.config.js frontend/src/pages/__tests__/readerTokens.test.ts frontend/src/hooks/usePanelResize.ts frontend/src/hooks/usePanelResize.test.ts
git commit -m "feat(R4): brief-page 토큰 + usePanelResize 훅(싸비 패널 드래그 리사이즈)"
```

---

### Task 2: ReaderView.tsx — 페이지 직접 입력 + brief 톤 restyle

**Files:**
- Modify: `frontend/src/components/Reader/ReaderView.tsx`
- Modify: `frontend/src/components/Reader/ReaderView.test.tsx`

**Interfaces:**
- 시그니처 변경 없음(`content`/`currentPage`/`totalPages`/`prevPage`/`nextPage`/`onMove`) — 페이지 입력도 같은 `onMove(page: number)`를 쓴다.

- [ ] **Step 1: 실패하는 테스트로 교체**

`ReaderView.test.tsx`의 "FR-PRG-004" 테스트를 바꾸고, 페이지 입력 테스트 3개를 추가한다.

```tsx
  it('FR-PRG-004: 페이지 번호를 입력창으로 표시하고 진도 바를 두지 않는다', () => {
    render(<ReaderView {...baseProps} />);

    expect(screen.getByRole('textbox', { name: '페이지로 이동' })).toHaveValue('21');
    expect(screen.getByText('/ 30')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('페이지 입력창에 숫자를 넣고 Enter를 누르면 그 페이지로 이동한다', async () => {
    const onMove = vi.fn();
    render(<ReaderView {...baseProps} onMove={onMove} />);

    const input = screen.getByRole('textbox', { name: '페이지로 이동' });
    await userEvent.clear(input);
    await userEvent.type(input, '9{Enter}');

    expect(onMove).toHaveBeenCalledWith(9);
  });

  it('입력값을 1~totalPages 범위로 자른다', async () => {
    const onMove = vi.fn();
    render(<ReaderView {...baseProps} onMove={onMove} />);

    const input = screen.getByRole('textbox', { name: '페이지로 이동' });
    await userEvent.clear(input);
    await userEvent.type(input, '999{Enter}');

    expect(onMove).toHaveBeenCalledWith(30); // totalPages
  });

  it('숫자가 아닌 값을 넣고 포커스를 벗어나면 원래 페이지로 되돌린다', async () => {
    const onMove = vi.fn();
    render(<ReaderView {...baseProps} onMove={onMove} />);

    const input = screen.getByRole('textbox', { name: '페이지로 이동' });
    await userEvent.clear(input);
    await userEvent.tab(); // blur, 빈 값

    expect(input).toHaveValue('21');
    expect(onMove).not.toHaveBeenCalled();
  });
```

기존 "FR-PRG-004: 페이지 번호만 표시하고 진도 바를 두지 않는다" 테스트는 위 새 버전으로 완전히 대체한다(같은 이름 하나만 남긴다 — 중복 금지).

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && npx vitest run src/components/Reader/ReaderView.test.tsx`
Expected: FAIL — 여러 건(입력창이 없다, 기존 `getByText('21 / 30')` 단일 텍스트가 사라졌다).

- [ ] **Step 3: 구현**

전체를 다음으로 교체:

```tsx
import { useState } from 'react';

/**
 * 읽기 화면 — S3, 재설계 2026-08-23
 *
 * 고정 페이지 + 페이지 내 스크롤. 폰트·화면 크기가 바뀌어도 페이지를 다시 나누지 않는다
 * (FR-PRG-001, 절대 규칙 10번) — 본문 영역은 스크롤 길이만 늘어난다.
 * 진도 바를 두지 않는다(FR-PRG-004) — 페이지 번호는 이제 **입력 가능한 필드**로 보여준다.
 * 이동 확정 시에만 onMove 로 알린다 — 스크롤은 이벤트를 만들지 않는다 (절대 규칙 9번).
 *
 * 이전/다음은 서버가 내려준 값(prev_page·next_page)을 그대로 쓴다. 직접 입력은 사용자가
 * 타이핑한 목표 페이지를 1~totalPages로 자른 뒤 그대로 onMove 로 넘긴다 — `fetchPage`는
 * 임의 페이지를 받는 R4 소유 엔드포인트이고 상한 대상이 아니라, 이 값을 서버 파생값으로
 * 취급할 필요가 없다.
 */
export default function ReaderView({
  content,
  currentPage,
  totalPages,
  prevPage,
  nextPage,
  onMove,
}: {
  content: string;
  currentPage: number;
  totalPages: number;
  prevPage: number | null;
  nextPage: number | null;
  onMove: (page: number) => void;
}) {
  const [inputValue, setInputValue] = useState(String(currentPage));

  function commit() {
    const n = parseInt(inputValue, 10);
    if (isNaN(n)) {
      setInputValue(String(currentPage));
      return;
    }
    const clamped = Math.max(1, Math.min(totalPages, n));
    setInputValue(String(clamped));
    if (clamped !== currentPage) onMove(clamped);
  }

  return (
    <main className="flex h-full flex-col bg-brief-page">
      <article
        role="article"
        className="mx-auto w-full max-w-[560px] flex-1 overflow-y-auto whitespace-pre-wrap px-8 pb-10 pt-[60px] font-dashSerif text-[18px] leading-[2] text-[#332e22]"
      >
        {content}
      </article>

      <nav className="flex items-center justify-between border-t border-brief-rule px-8 py-3.5 font-dashSans text-[13px] text-brief-muted">
        <button
          type="button"
          disabled={prevPage === null}
          onClick={() => prevPage !== null && onMove(prevPage)}
          className="disabled:opacity-40"
        >
          이전 페이지
        </button>

        <div className="flex items-baseline gap-1.5 font-dashMono text-[13px] font-medium text-brief-ink">
          <input
            type="text"
            inputMode="numeric"
            aria-label="페이지로 이동"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value.replace(/[^0-9]/g, ''))}
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            onBlur={commit}
            className="w-[3ch] border-0 border-b border-dashed border-brief-rule bg-transparent text-center font-inherit text-inherit outline-none focus:border-b-[1.5px] focus:border-solid focus:border-brief-accent focus:bg-brief-accent-soft"
          />
          <span className="text-brief-muted">/ {totalPages}</span>
        </div>

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
}
```

**주의:** `currentPage` prop이 바뀌면(부모가 페이지를 이동시키면) 입력창도 새 값으로 갱신돼야 한다. React는 `value`를 controlled로 쓰면서 `useState` 초기값만 `currentPage`를 참조하면 이후 prop 변경에 반응하지 않는다 — 아래를 함수 컴포넌트 안, `useState` 선언 다음 줄에 추가한다:

```tsx
  if (String(currentPage) !== inputValue && document.activeElement?.tagName !== 'INPUT') {
    setInputValue(String(currentPage));
  }
```

이 패턴(렌더 중 조건부 `setState`)은 React가 공식적으로 지원하는 "prop 변경에 따른 state 동기화" 방법이다(리렌더를 유발하지만 같은 커밋 안에서 처리돼 깜빡임이 없다) — `useEffect`로 하면 한 프레임 늦게 반영된다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd frontend && npx vitest run src/components/Reader/ReaderView.test.tsx`
Expected: PASS 전부(기존 6개 중 1개 교체 + 신규 3개 = 8개, "본문을 렌더한다"·"다음 페이지"·"이전 페이지"·"서버가 이웃 페이지를 주지 않으면"·"스크롤은 이동 안 알림"·"재분할 없음" 그대로 통과).

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/components/Reader/ReaderView.tsx frontend/src/components/Reader/ReaderView.test.tsx
git commit -m "feat(R4): 읽기 화면 페이지 직접 입력 추가 + brief 톤 restyle"
```

---

### Task 3: SsabiToggleButton.tsx — 원형 아웃라인 restyle

**Files:**
- Modify: `frontend/src/components/common/SsabiToggleButton.tsx`
- Create: `frontend/src/components/common/SsabiToggleButton.test.tsx`

**Interfaces:** 시그니처 변경 없음(`open`/`onToggle`).

**확인된 사실:** 이 컴포넌트에 기존 테스트 파일이 없다 — 이번에 처음 만든다.

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
// frontend/src/components/common/SsabiToggleButton.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SsabiToggleButton from './SsabiToggleButton';

describe('SsabiToggleButton', () => {
  it('닫혀 있으면 "싸비 열기"라는 이름을 갖는다', () => {
    render(<SsabiToggleButton open={false} onToggle={() => {}} />);
    expect(screen.getByRole('button', { name: '싸비 열기' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  it('열려 있으면 "싸비 닫기"라는 이름을 갖고 강조 테두리를 쓴다', () => {
    render(<SsabiToggleButton open={true} onToggle={() => {}} />);
    const button = screen.getByRole('button', { name: '싸비 닫기' });
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(button.className).toContain('border-brief-ink');
  });

  it('누르면 onToggle이 호출된다', async () => {
    const onToggle = vi.fn();
    render(<SsabiToggleButton open={false} onToggle={onToggle} />);
    await userEvent.click(screen.getByRole('button', { name: '싸비 열기' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && npx vitest run src/components/common/SsabiToggleButton.test.tsx`
Expected: FAIL — 지금 컴포넌트는 `border-brief-ink` 클래스를 안 쓴다(옛 `bg-ink` 채움 스타일).

- [ ] **Step 3: 구현**

전체를 다음으로 교체:

```tsx
/**
 * 싸비 패널 여닫기 버튼 — 재설계 2026-08-23 (`.reader-scr .tb-toggle`)
 *
 * `Reader.tsx`가 화면의 같은 자리(top-bar 우측)에 **고정 위치**로 그린다 — 열림/닫힘과
 * 무관하게 움직이지 않는다. 패널 안에만 두면 닫은 뒤 다시 열 수단이 사라지기 때문에
 * 패널 밖, 흐름과 무관한 고정 레이어에 둔다.
 *
 * 시안은 원형 아웃라인 버튼이다(채움 없음) — 이전 버전은 사각형+채움이었다. 열렸을 때는
 * 테두리만 ink로 강조한다.
 */
export default function SsabiToggleButton({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls="ssabi-panel"
      aria-label={open ? '싸비 닫기' : '싸비 열기'}
      className={`flex size-[38px] shrink-0 items-center justify-center rounded-full border bg-white text-brief-ink transition-shadow hover:shadow-brief-soft-sm ${
        open ? 'border-brief-ink' : 'border-brief-rule'
      }`}
    >
      <svg viewBox="0 0 24 24" className="size-[17px]" fill="none" aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="1.8" />
        <path d="M14 4v16" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    </button>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd frontend && npx vitest run src/components/common/SsabiToggleButton.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/components/common/SsabiToggleButton.tsx frontend/src/components/common/SsabiToggleButton.test.tsx
git commit -m "feat(R4): SsabiToggleButton을 원형 아웃라인(채움 없음)으로 restyle"
```

---

### Task 4: RecapTab.tsx — 인용부호 카드 + brief 톤

**Files:**
- Modify: `frontend/src/components/Ssabi/RecapTab.tsx`
- Modify: `frontend/src/components/Ssabi/RecapTab.test.tsx`

**Ruling(계획에 포함) — 인물 이름 자동 강조는 만들지 않는다:** 목업의 `e-key` 스팬은 "정 주사"·"초봉" 같은 이름을 굵게+accent색으로 강조한다. 이 탭이 받는 건 스트리밍 순수 텍스트뿐이고 인물명을 식별할 데이터(별도 마커나 인물 목록 매핑)가 없다 — 만들면 문자열 매칭으로 이름을 "추측"하게 되어 지어낸 판정이 된다(ChatbotTab.tsx가 "추천 질문 칩"을 만들지 않은 것과 같은 이유). 강조 없이 일반 본문으로 렌더한다.

- [ ] **Step 1: 실패하는 테스트로 교체**

```tsx
// frontend/src/components/Ssabi/RecapTab.test.tsx
import { render, screen } from '@testing-library/react';
import RecapTab from './RecapTab';

describe('RecapTab', () => {
  it('본문은 brief-ink로 강조하고, brief-muted로 저평가하지 않는다', () => {
    render(<RecapTab text="정 주사는 미두장에서 재산을 잃었다." streaming={false} failed={false} />);
    const body = screen.getByText(/정 주사는/);
    expect(body).toHaveClass('text-brief-ink');
    expect(body).not.toHaveClass('text-brief-muted');
  });

  it('스트리밍 표시는 brief-muted를 쓴다', () => {
    render(<RecapTab text="정 주사는" streaming={true} failed={false} />);
    expect(screen.getByText('불러오는 중')).toHaveClass('text-brief-muted');
  });

  it('"지금까지" eyebrow 라벨과 장식용 인용부호를 보여준다', () => {
    render(<RecapTab text="정 주사는" streaming={false} failed={false} />);
    expect(screen.getByText('지금까지')).toBeInTheDocument();
    expect(screen.getByText('"', { exact: true })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && npx vitest run src/components/Ssabi/RecapTab.test.tsx`
Expected: FAIL — `text-brief-ink` 없음(`text-ink` 사용 중), eyebrow·인용부호 없음.

- [ ] **Step 3: 구현**

전체를 다음으로 교체:

```tsx
/**
 * 리캡 탭 — SSE 스트리밍 렌더 (NFR-PERF-002 🚦) — 재설계 2026-08-23 (`.reader-scr .e-card`)
 *
 * 받은 조각을 순서대로 이어 붙이기만 한다. 스트리밍 중 페이지가 바뀌어도 끊지 않는다 —
 * 진행 중인 응답은 시작 시점 기준점을 유지한다 (UC-27 A5).
 *
 * 인물 이름 자동 강조(시안의 e-key 스팬)는 만들지 않는다 — 식별 데이터가 없어 지어낸
 * 판정이 된다.
 *
 * 색은 brief-ink로 둔다(critique P2, 2026-08-21 판단 유지) — 이 탭에서 독자가 실제로
 * 찾는 본문이라, brief-muted는 eyebrow 같은 진짜 보조 요소에만 남긴다.
 */
export default function RecapTab({
  text,
  streaming,
  failed,
}: {
  text: string;
  streaming: boolean;
  failed: boolean;
}) {
  if (failed)
    return (
      <p role="alert" className="text-[13px] text-brief-muted">
        리캡을 불러오지 못했습니다
      </p>
    );

  return (
    <div className="rounded-xl bg-brief-paper p-[26px_22px_22px]">
      <span
        aria-hidden="true"
        className="-mb-3 block font-dashSerif text-[40px] leading-none text-brief-accent opacity-[.28]"
      >
        "
      </span>
      <p className="mb-2.5 font-dashMono text-[10.5px] font-semibold uppercase tracking-[.06em] text-brief-muted">
        지금까지
      </p>
      <p className="whitespace-pre-wrap font-dashSerif text-[15px] leading-[1.85] text-brief-ink">
        {text}
      </p>
      {streaming ? (
        <span aria-live="polite" className="mt-3 block text-[11px] text-brief-muted">
          불러오는 중
        </span>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd frontend && npx vitest run src/components/Ssabi/RecapTab.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/components/Ssabi/RecapTab.tsx frontend/src/components/Ssabi/RecapTab.test.tsx
git commit -m "feat(R4): RecapTab에 인용부호 카드 restyle 적용 — 이름 자동 강조는 만들지 않음"
```

---

### Task 5: ChatbotTab.tsx — 아바타·테두리 말풍선 + brief 톤

**Files:**
- Modify: `frontend/src/components/Ssabi/ChatbotTab.tsx`
- Modify: `frontend/src/components/Ssabi/ChatbotTab.test.tsx`

- [ ] **Step 1: 실패하는 테스트로 교체**

```tsx
// frontend/src/components/Ssabi/ChatbotTab.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatbotTab from './ChatbotTab';

describe('ChatbotTab', () => {
  it('싸비 답변 말풍선은 accent 테두리를 쓰고 옆에 "싸" 아바타가 있다', () => {
    render(<ChatbotTab answer="정 주사에 대해 답합니다." streaming={false} error={null} onAsk={() => {}} />);
    expect(screen.getByText(/정 주사에 대해/)).toHaveClass('border-brief-accent');
    expect(screen.getByText('싸')).toBeInTheDocument();
  });

  it('polish: 답변이 없으면(질문 전) 빈 말풍선을 그리지 않는다', () => {
    const { container } = render(
      <ChatbotTab answer="" streaming={false} error={null} onAsk={() => {}} />
    );
    expect(container.querySelector('p')).toBeNull();
    expect(screen.queryByText('싸')).not.toBeInTheDocument();
  });

  it('사용자 질문 말풍선은 paper 배경 + rule 테두리를 쓴다 — 액센트가 사용자 쪽으로 번지지 않는다', async () => {
    const onAsk = vi.fn();
    render(<ChatbotTab answer="" streaming={false} error={null} onAsk={onAsk} />);

    await userEvent.type(screen.getByLabelText('질문'), '정주사가 누구야');
    await userEvent.click(screen.getByRole('button', { name: '질문' }));

    const bubble = screen.getByText('정주사가 누구야');
    expect(bubble).toHaveClass('bg-brief-paper');
    expect(bubble).toHaveClass('border-brief-rule');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && npx vitest run src/components/Ssabi/ChatbotTab.test.tsx`
Expected: FAIL — 옛 `bg-ssabi-soft`/`bg-canvas` 클래스, 아바타 없음.

- [ ] **Step 3: 구현**

전체를 다음으로 교체:

```tsx
import { useState } from 'react';

/**
 * 챗봇 탭 — SSE 스트리밍 (NFR-PERF-008) — 재설계 2026-08-23 (`.reader-scr .a-thread`)
 *
 * 근거 부재 거절 문구도 일반 delta 로 흘러온다. 프론트는 그것을 보통 답변과 똑같이
 * 렌더하며, 문구를 보고 거절인지 판별하지 않는다 (절대 규칙 7번, FR-QNA-004 🚦).
 *
 * **대화 이력은 아직 없다.** 마지막 문답 한 쌍만 보인다 (FR-QNA-003 은 P1).
 *
 * 시안은 사용자 말풍선(paper 배경 + rule 테두리)과 싸비 답변(원형 "싸" 아바타 + panel
 * 배경 + accent 테두리)을 다른 처리로 구분한다 — 정렬만으로는 좁은 패널에서 화자 구분이
 * 약하다는 critique P2(2026-08-21) 판단을 그대로 잇는다.
 *
 * 답변 말풍선은 `answer`가 있을 때만 그린다 — 질문 전에 빈 말풍선이 뜨지 않게 한다.
 *
 * ⚠️ 시안의 "선택 문장 인용"과 "추천 질문 칩"은 만들지 않는다 — 인용할 문장을 넘겨받는
 *    경로가 없고, 추천 질문은 CLAUDE.md 9장이 미결로 둔 항목이다.
 */
export default function ChatbotTab({
  answer,
  streaming,
  error,
  onAsk,
}: {
  answer: string;
  streaming: boolean;
  error: string | null;
  onAsk: (query: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [asked, setAsked] = useState('');

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto">
        {asked ? (
          <p className="ml-auto max-w-[76%] rounded-2xl rounded-br-md border border-brief-rule bg-brief-paper px-[13px] py-[9px] text-xs leading-[1.6] text-brief-ink">
            {asked}
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="text-xs text-brief-muted">
            {error}
          </p>
        ) : answer ? (
          <div className="flex items-end gap-2">
            <span
              aria-hidden="true"
              className="flex size-[26px] shrink-0 items-center justify-center overflow-hidden rounded-full border border-brief-accent bg-brief-accent-soft font-dashSerif text-[11px] font-bold text-brief-accent"
            >
              싸
            </span>
            <p className="max-w-[76%] whitespace-pre-wrap rounded-2xl rounded-bl-md border border-brief-accent bg-white px-[13px] py-[9px] text-xs leading-[1.6] text-brief-ink">
              {answer}
            </p>
          </div>
        ) : null}

        {streaming ? (
          <span aria-live="polite" className="block text-[11px] text-brief-muted">
            답하는 중
          </span>
        ) : null}
      </div>

      <form
        className="mt-4 flex items-center gap-2 rounded-full border border-brief-rule bg-white px-4 py-2.5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!query.trim() || streaming) return;
          onAsk(query.trim());
          setAsked(query.trim());
          setQuery('');
        }}
      >
        <label htmlFor="chat-query" className="sr-only">
          질문
        </label>
        <input
          id="chat-query"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="flex-1 bg-transparent text-xs text-brief-ink outline-none placeholder:text-brief-muted"
          placeholder="읽은 데까지의 내용으로 물어보세요"
        />
        <button
          type="submit"
          disabled={streaming}
          className="shrink-0 font-dashSans text-xs font-bold text-brief-accent disabled:opacity-40"
        >
          질문
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd frontend && npx vitest run src/components/Ssabi/ChatbotTab.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/components/Ssabi/ChatbotTab.tsx frontend/src/components/Ssabi/ChatbotTab.test.tsx
git commit -m "feat(R4): ChatbotTab에 아바타·테두리 말풍선 restyle 적용"
```

---

### Task 6: RelationshipGraph.tsx + RelationshipTab.tsx — brief 톤 (로직 유지)

**Files:**
- Modify: `frontend/src/components/Ssabi/RelationshipGraph.tsx`
- Modify: `frontend/src/components/Ssabi/RelationshipTab.tsx`
- Modify: `frontend/src/components/Ssabi/RelationshipTab.test.tsx`

**Ruling(계획에 포함) — React Flow·되감기 슬라이더·인물/관계 목록 구조를 그대로 둔다:** 목업은 고정 4노드 SVG 장난감 데모라 임의 노드 수·되감기를 다루지 못한다. 실코드가 이미 이 둘을 다 갖고 있고 실 데이터(30인물·51관계)로 검증까지 끝났다 — 로직을 목업으로 되돌리면 퇴보다. 색(`TOKEN` 객체)과 카드·슬라이더 스타일만 brief-*로 바꾼다.

- [ ] **Step 1: 실패하는 테스트로 교체**

`RelationshipTab.test.tsx`의 클래스 관련 부분은 원래 없었으므로(현재 파일에 클래스 단언이 없다), 새로 색 단언 3개를 추가한다. 파일 끝(`});` 직전)에 추가:

```tsx
  it('인물 카드는 brief 톤 카드 스타일을 쓴다', () => {
    render(<RelationshipTab graph={graph} failed={false} />);
    const people = screen.getByRole('region', { name: '인물' });
    const card = within(people).getByText('정주사').closest('li')!;
    expect(card.className).toContain('bg-white');
    expect(card.className).toContain('border-brief-rule');
  });

  it('되감기 슬라이더는 brief-accent 를 쓴다', () => {
    render(<RelationshipTab graph={graph} failed={false} />);
    expect(screen.getByLabelText('시점 되감기').className).toContain('accent-brief-accent');
  });
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && npx vitest run src/components/Ssabi/RelationshipTab.test.tsx`
Expected: FAIL — 지금은 `border-line`/`accent-ssabi`를 쓴다.

- [ ] **Step 3: RelationshipGraph.tsx의 TOKEN 교체**

```tsx
const TOKEN = {
  surface: '#ffffff',
  line: '#d3c6a8', // brief-rule
  ink: '#2a2620', // brief-ink
  muted: '#8c8473', // brief-muted
} as const;
```

주석 블록의 "⚠️ 색이 hex 리터럴인 이유" 설명 문단 끝에 한 줄 추가:

```tsx
 * 재설계(2026-08-23)로 brief-rule/brief-ink/brief-muted 값으로 갱신했다 — React Flow가
 * Tailwind 클래스를 못 읽는 사정은 그대로라 hex를 계속 직접 쓴다.
```

`<div className="h-[280px] w-full overflow-hidden rounded-card border border-line bg-canvas">`를 다음으로 교체:

```tsx
    <div className="h-[280px] w-full overflow-hidden rounded-xl border border-brief-rule bg-brief-page">
```

- [ ] **Step 4: RelationshipTab.tsx의 카드·슬라이더 색 교체**

```tsx
// "인물" 섹션 li — 기존:
              <li key={node.id} className="rounded-card border border-line bg-surface p-3.5">
// 교체:
              <li key={node.id} className="rounded-xl border border-brief-rule bg-white p-3.5">
```
```tsx
// 인물 이름 span — 기존:
                <span className="font-serif text-sm font-bold text-ink">{node.name}</span>
// 교체:
                <span className="font-dashSerif text-sm font-bold text-brief-ink">{node.name}</span>
```
```tsx
// 별칭 span — 기존:
                  <span className="text-[11px] text-muted">{node.aliases.join(' · ')}</span>
// 교체:
                  <span className="text-[11px] text-brief-muted">{node.aliases.join(' · ')}</span>
```
```tsx
// 슬라이더 label — 기존:
            <label htmlFor="graph-scrub" className="text-faint">
// 교체:
            <label htmlFor="graph-scrub" className="text-brief-muted">
```
```tsx
// 슬라이더 현재 표시 span — 기존:
            <span className="font-bold text-ink">
// 교체:
            <span className="font-bold text-brief-ink">
```
```tsx
// range input — 기존:
            className="w-full accent-ssabi"
// 교체:
            className="w-full accent-brief-accent"
```
```tsx
// "인물 N" / "관계 N" 제목 — 기존(2곳):
        <h3 className="text-xs font-bold text-faint">
// 교체(2곳):
        <h3 className="text-xs font-bold text-brief-muted">
```
```tsx
// 관계 목록 li — 기존:
            <li key={`${edge.source}-${edge.target}`} className="text-xs text-muted">
// 교체:
            <li key={`${edge.source}-${edge.target}`} className="text-xs text-brief-muted">
```
```tsx
// 관계 라벨 span — 기존:
              <span className="font-bold text-ink">{edge.label}</span>
// 교체:
              <span className="font-bold text-brief-ink">{edge.label}</span>
```
```tsx
// 실패 alert — 기존:
  if (failed) return <p role="alert">관계도를 불러오지 못했습니다</p>;
// 교체:
  if (failed) return <p role="alert" className="text-brief-muted">관계도를 불러오지 못했습니다</p>;
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd frontend && npx vitest run src/components/Ssabi/RelationshipTab.test.tsx`
Expected: PASS 전부(기존 5개 + 신규 2개 = 7개).

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/components/Ssabi/RelationshipGraph.tsx frontend/src/components/Ssabi/RelationshipTab.tsx frontend/src/components/Ssabi/RelationshipTab.test.tsx
git commit -m "feat(R4): 관계도 React Flow·되감기 슬라이더를 brief 톤으로 restyle — 로직 유지"
```

---

### Task 7: SsabiPanel.tsx — 헤더·탭 brief 톤

**Files:**
- Modify: `frontend/src/components/Ssabi/SsabiPanel.tsx`
- Modify: `frontend/src/components/Ssabi/SsabiPanel.test.tsx`

**확인된 사실:** `pr-20` 클래스를 직접 단언하는 기존 테스트(`polish: 헤더가...`)가 있다 — 헤더의 패딩 구조(pl-6 pr-20 pt-6 pb-5)는 그대로 유지하고 색만 바꾼다.

- [ ] **Step 1: 실패하는 테스트로 교체**

`SsabiPanel.test.tsx`에 색 단언을 추가한다(파일 끝 `});` 직전):

```tsx
  it('활성 탭은 brief-accent 테두리·배경을 쓴다', () => {
    render(<SsabiPanel {...baseProps} />);
    const activeTab = screen.getByRole('tab', { name: '인물 관계도' });
    expect(activeTab.className).toContain('border-brief-accent');
    expect(activeTab.className).toContain('bg-brief-accent-soft');
  });

  it('기준점 배지는 brief-accent 톤을 쓴다', () => {
    render(<SsabiPanel {...baseProps} appliedCutoff={79} />);
    expect(screen.getByText('79p까지 확인').className).toContain('text-brief-accent');
  });
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && npx vitest run src/components/Ssabi/SsabiPanel.test.tsx`
Expected: FAIL — 지금은 `border-ssabi`/`bg-ssabi-soft`/`text-ssabi`를 쓴다.

- [ ] **Step 3: 구현**

`SsabiPanel.tsx`의 색 관련 클래스를 교체한다.

```tsx
// 바깥 section — 기존:
    <section className="flex h-full flex-col border-l border-line bg-surface">
// 교체:
    <section className="flex h-full flex-col border-l border-brief-rule bg-brief-paper">
```
```tsx
// 헤더 제목 — 기존:
        <h2 className="font-serif text-base font-extrabold text-ink">싸비의 가이드북</h2>
// 교체:
        <h2 className="font-dashSerif text-base font-extrabold text-brief-ink">싸비의 가이드북</h2>
```
```tsx
// 기준점 배지 — 기존:
          <span className="shrink-0 rounded-pill bg-ssabi-soft px-2.5 py-1 text-[11px] font-bold text-ssabi">
// 교체:
          <span className="shrink-0 rounded-full bg-brief-accent-soft px-2.5 py-1 font-dashMono text-[11px] font-bold text-brief-accent">
```
```tsx
// 탭 버튼 — 기존:
            className={
              tab === it
                ? 'rounded-cover border border-ssabi bg-ssabi-soft px-3 py-2 text-xs font-bold text-ssabi'
                : 'rounded-cover border border-transparent px-3 py-2 text-xs text-muted'
            }
// 교체:
            className={
              tab === it
                ? 'rounded-lg border border-brief-accent bg-brief-accent-soft px-3 py-2 font-dashSans text-xs font-bold text-brief-accent'
                : 'rounded-lg border border-brief-rule px-3 py-2 font-dashSans text-xs text-brief-muted transition-colors hover:border-brief-muted hover:text-brief-ink'
            }
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd frontend && npx vitest run src/components/Ssabi/SsabiPanel.test.tsx`
Expected: PASS 전부(기존 11개 + 신규 2개 = 13개, `pr-20` 단언도 그대로 통과).

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/components/Ssabi/SsabiPanel.tsx frontend/src/components/Ssabi/SsabiPanel.test.tsx
git commit -m "feat(R4): SsabiPanel 헤더·탭을 brief 톤으로 restyle"
```

---

### Task 8: Reader.tsx 최종 조립 — topbar·리사이즈 연결 + 전체 검증

**Files:**
- Modify: `frontend/src/pages/Reader.tsx`

**Interfaces:**
- Consumes: `usePanelResize`(Task 1), 재설계된 `SsabiToggleButton`(Task 3).

- [ ] **Step 1: Reader.tsx 수정**

import 추가:
```ts
import { usePanelResize } from '../hooks/usePanelResize';
```

컴포넌트 안, `const [panelOpen, setPanelOpen] = useState(false);` 다음 줄에 추가:
```tsx
  const appRef = useRef<HTMLDivElement>(null);
  const { width: panelWidth, isDragging, handleProps } = usePanelResize({
    minWidth: 380,
    getMaxWidth: () => (appRef.current ? Math.round(appRef.current.clientWidth * 0.5) : 380),
  });
```

`useRef`를 react import에 추가(`import { useCallback, useEffect, useRef, useState } from 'react';`).

topbar 블록 전체를 교체 — 기존:
```tsx
      <div className="flex h-[72px] shrink-0 items-center border-b border-line px-8">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="뒤로 가기"
            className="flex size-8 items-center justify-center rounded-full border border-line bg-surface text-ink transition-opacity hover:opacity-60"
          >
            <span aria-hidden="true">‹</span>
          </button>
          <div className="flex flex-col gap-0.5">
            <span className="font-serif text-lg font-bold tracking-widest text-ink">RE:ADD</span>
            <span className="text-xs text-muted">탁류</span>
          </div>
        </div>

      </div>
```
교체 후:
```tsx
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-brief-rule bg-brief-paper px-6">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="뒤로 가기"
          className="flex size-9 items-center justify-center rounded-full border border-brief-rule bg-white text-brief-ink transition-shadow hover:shadow-brief-soft-sm"
        >
          <span aria-hidden="true" className="text-base">
            ‹
          </span>
        </button>
      </div>
```

(싸비 토글 버튼은 이미 `<div className="absolute right-6 top-24 z-10">`로 고정 위치에 그려지고 있어 topbar 안으로 옮기지 않는다 — Task 3에서 restyle된 컴포넌트가 그대로 이 자리를 쓴다. `right-6 top-24`는 top-bar 72px→64px로 줄었으니 `top-24`(96px)를 `top-20`(80px = 64+16 헤더 패딩과 맞춘 값)으로 조정한다.)

`<div className="absolute right-6 top-24 z-10">` → `<div className="absolute right-6 top-20 z-10">`

바깥 컨테이너 배경도 brief로: `<div className="relative flex h-screen flex-col bg-canvas">` → `<div ref={appRef} className="relative flex h-screen flex-col bg-brief-page">`

`<aside id="ssabi-panel" className="w-[420px] shrink-0">`를 리사이즈 가능한 형태로 교체:
```tsx
        {panelOpen ? (
          <aside
            id="ssabi-panel"
            style={{ width: panelWidth, flexBasis: panelWidth }}
            className={`relative shrink-0 border-l border-brief-rule ${isDragging ? '' : 'transition-[width]'}`}
          >
            <div
              {...handleProps}
              className={`absolute -left-[5px] top-0 z-10 flex h-full w-[10px] cursor-col-resize items-center justify-center ${isDragging ? 'select-none' : ''}`}
            >
              <span
                aria-hidden="true"
                className={`w-[3px] rounded-full bg-brief-rule transition-all ${isDragging ? 'h-[52px] bg-brief-ink' : 'h-9'}`}
              />
            </div>
            <SsabiPanel
              sessionEpoch={session?.session_epoch ?? 0}
              appliedCutoff={panelAppliedCutoff}
              onTabChange={setTab}
              graph={graph}
              graphFailed={graphFailed}
              recapText={recapText}
              recapStreaming={recapStreaming}
              recapFailed={recapError !== null}
              chatAnswer={chatAnswer}
              chatStreaming={chatStreaming}
              chatError={chatError}
              onAsk={handleAsk}
            />
          </aside>
        ) : null}
```

에러·로딩 상태 화면들의 `bg-canvas`도 `bg-brief-page`로:
```tsx
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-canvas px-6 text-center">
```
2곳(진입 실패·페이지 실패) 전부 `bg-brief-page`로 교체.

- [ ] **Step 2: 전체 회귀 테스트**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: tsc 0건. `Reader.tsx` 자체엔 별도 단위 테스트 파일이 없으므로(App 통합 테스트가 커버) App.*.test.tsx 전부 통과해야 한다 — 실패하면 셀렉터가 옛 topbar 구조(워드마크 텍스트 등)에 의존하고 있는지 확인하고 고친다.

- [ ] **Step 3: eslint**

Run: `cd frontend && npx eslint src --ext ts,tsx`
Expected: 0건.

- [ ] **Step 4: 커밋**

```bash
git add frontend/src/pages/Reader.tsx
git commit -m "feat(R4): 읽기 화면 topbar 재설계(원형 버튼, 워드마크 제거) + 싸비 패널 드래그 리사이즈 연결"
```

- [ ] **Step 5: 실 브라우저 대조 (사용자 확인용, 커밋 아님)**

`dev` 서버 재시작(새 토큰 반영). 읽기 화면(`/books/takryu/read`)에서:
- 싸비 닫힌 topbar(원형 뒤로가기만, 워드마크 없음)
- 페이지 번호 입력창 클릭 → 전체 선택 → 숫자 입력 → Enter로 이동
- 싸비 토글 → 패널 열림, 왼쪽 모서리 드래그로 폭 조절, 최소 380px에서 안 좁아지는지
- 리캡·인물 관계도(되감기 슬라이더 포함)·챗봇 탭 각각 brief 톤으로 보이는지

목업과 나란히 대조하고 불일치가 있으면 그 자리에서 고친다.

---

## Self-Review 체크리스트

1. **스펙 커버리지** — brief-page 토큰✓(T1) · 드래그 리사이즈✓(T1,T8) · 페이지 직접 입력✓(T2) · 원형 토글✓(T3) · 리캡 인용부호 카드✓(T4) · 챗봇 아바타·테두리✓(T5) · 관계도 색 교체(로직 유지)✓(T6) · 패널 헤더·탭✓(T7) · topbar 재설계✓(T8). 갭 없음.
2. **플레이스홀더 스캔** — 전 태스크 코드 완전 작성.
3. **타입 일관성** — `usePanelResize`의 반환 타입(`width`/`isDragging`/`handleProps`)이 T1 정의·T8 소비에서 일치. `SsabiToggleButton`의 `open`/`onToggle` 시그니처 불변, T8이 그대로 쓴다(T8 자체 코드에선 토글 버튼 위치 조정만 하고 컴포넌트 호출부는 안 건드린다 — 이미 있는 `<SsabiToggleButton open={panelOpen} onToggle={...} />` 호출이 자리만 이동).
