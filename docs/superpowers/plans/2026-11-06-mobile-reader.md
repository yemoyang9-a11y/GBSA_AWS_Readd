# 모바일 1단계 — 기반 + 읽기 화면 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** iPhone 세로 화면에서 읽기 화면을 모바일 전용으로 그린다. 옆으로 밀어 페이지를 넘기고, 양옆 손잡이로 목차 리스트와 전체 화면 싸비를 연다. 이 단계가 끝나면 스크린샷을 사용자에게 보여 주고 피드백을 받는다.

**Architecture:** 같은 Vite 앱 안에 `frontend/src/mobile/`을 둔다. 기기 화면의 짧은 쪽이 600px 미만이면 읽기 라우트에 `MobileReader`를 그린다. 읽기 진행 로직은 `Reader.tsx`에서 `hooks/useReadingSession.ts`로 옮기고, PC 화면과 모바일 화면이 같은 훅을 쓴다. 점검은 Playwright(WebKit)로 하며, API 요청을 가로채 점검용 응답을 돌려준다.

**Tech Stack:** React 18, react-router-dom 6 데이터 라우터, Tailwind 3, Vitest + Testing Library(jsdom), Playwright `@playwright/test`(WebKit만 설치).

**Spec:** `docs/superpowers/specs/2026-11-06-mobile-webapp-design.md`. 이 계획은 스펙 5.1의 "1. 읽기 화면" 단계만 다룬다. 싸비 내부 모바일화(챗봇 입력·관계도 핀치·탭 44px), 브리핑, 서재, 404·오류, 홈 화면 추가는 이후 단계 계획에서 다룬다.

## Global Constraints

- 대상은 iPhone 세로, 폭 375px(iPhone SE)~430px(iPhone 15 Pro Max)이다. 가로 화면은 깨지지만 않으면 된다.
- 모바일 판정 기준은 `Math.min(screen.width, screen.height) < 600`이다. 앱 시작 시 1회만 판정하고, 창 폭은 보지 않는다.
- 페이지 이동은 서버가 준 `prev_page`·`next_page`, 또는 장의 `start_page`만 쓴다. 프론트에서 `page ± 1`을 계산하지 않는다(절대 규칙 2, 10).
- 페이지 안에서 세로 스크롤해도 서버 요청이 생기지 않는다(절대 규칙 9). 진도 요청은 페이지 이동 때만 기존 `sendProgress` 경로로 보낸다.
- 기준점을 서버에 보내는 API를 새로 만들지 않는다. 새 서버 호출 경로도 만들지 않는다. 기존 `services/*`만 쓴다.
- 목차는 상한 없이 전체를 보여 준다(FR-NAV-001).
- PC 화면 파일은 두 경우에만 수정한다. Task 2의 로직 추출과 Task 3의 라우트 연결이다. `ReaderView.tsx`는 `highlightContent` export 추가만 허용한다.
- 누를 수 있는 요소는 가로·세로 모두 44px 이상이다. iOS 자동 확대를 막기 위해 입력창 글자는 16px 이상이다.
- 구현 근거는 조항 ID 주석만 남긴다(예: `// FR-PRG-003 🚦`). 설명 문장 주석은 달지 않는다.
- 커밋 형식은 `{type}(R4): {요약} — {조항 ID}`이다. 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`을 붙인다. push와 PR은 하지 않는다.
- 운영 서버와 운영 DB는 쓰지 않는다. E2E는 `VITE_API_URL=http://api.e2e.test`로 설정하고 모든 요청을 가로챈다.

## Review Focus

1. **싸비가 열린 상태에서 옆으로 끌기:** 관계도 그래프를 끄는 등 싸비 위에서 옆으로 끌어도 페이지가 넘어가면 안 된다. 진도 요청은 0건이어야 한다. → Task 5에서 테스트한다.
2. **연속으로 빠르게 두 번 밀기:** 두 번째 스와이프는 새 페이지의 `next_page`를 써야 한다. 진도 요청은 `[n+1, n+2]` 순서로 1번씩 생기고, 같은 페이지를 두 번 보내지 않는다. → Task 4에서 테스트한다.
3. **모바일 하단 페이지 번호 입력창:** PC는 13px이다. 모바일은 16px 이상이어야 누를 때 iOS가 화면을 확대하지 않는다. → Task 3에서 테스트한다.
4. **페이지 불러오기 실패 상태:** 재시도 버튼이 보이고, 밀어도 이동과 진도 요청이 없어야 한다. → Task 4에서 테스트한다.
5. **손잡이 위에서 시작한 끌기:** 손잡이는 누르기만 받는다. 손잡이에서 시작한 옆 끌기로 페이지가 넘어가면 안 된다. → Task 5에서 테스트한다.

---

### Task 1: Playwright 기반 + 기준선 기록

**Files:**
- Modify: `frontend/package.json`(devDependency `@playwright/test`, script `e2e`)
- Create: `frontend/playwright.config.ts`
- Create: `frontend/e2e/support/fixtures.ts`, `frontend/e2e/support/mockApi.ts`, `frontend/e2e/support/gestures.ts`
- Create: `frontend/e2e/pc-regression.spec.ts`
- Create: `docs/validation/2026-11-06-mobile-baseline.md`

**Interfaces:**
- Produces:
  - `installMockApi(page: Page, opts?: { startPage?: number; totalPages?: number; failPages?: number[] }): Promise<ApiLog>`
  - `ApiLog = { progress: number[]; pageFetches: number[]; entries: number }`. 배열은 요청 순서대로 쌓인다.
  - `BOOK_ID = 'takryu-e2e'`
  - `swipe(page: Page, opts: { fromX: number; toX: number; y: number; durationMs: number; steps?: number }): Promise<void>`

- [ ] **Step 1: 의존성을 설치하고 vitest 기준선을 기록한다.** `cd frontend && npm install && npm test`를 실행한다. 통과·실패 수와 실패한 테스트 이름을 `docs/validation/2026-11-06-mobile-baseline.md`에 그대로 적는다. 이후 P1은 "이 기준선보다 나빠지지 않음"으로 판정한다.
- [ ] **Step 2: Playwright를 설치한다.** `npm i -D @playwright/test`, `npx playwright install webkit`을 실행한다. `package.json` scripts에 `"e2e": "playwright test"`를 추가한다.
- [ ] **Step 3: `playwright.config.ts`를 작성한다.**
  - `testDir: 'e2e'`
  - projects 세 개, 모두 WebKit이다.
    - `iphone-se`: `devices['iPhone SE']`
    - `iphone-pro-max`: `devices['iPhone 15 Pro Max']`
    - `desktop`: `devices['Desktop Safari']`, viewport 1440×1000
  - `webServer`: `npx vite --port 4173 --strictPort`, `url: 'http://localhost:4173'`, `env: { VITE_USE_MOCK: 'false', VITE_API_URL: 'http://api.e2e.test', VITE_DEMO_DEVICE_ID: 'e2e-device' }`, `reuseExistingServer: false`
  - `use.baseURL: 'http://localhost:4173'`
  - `expect.toHaveScreenshot.maxDiffPixelRatio: 0.01`
- [ ] **Step 4: `fixtures.ts`를 작성한다.**
  - 기본값: `totalPages = 30`
  - 장 3개: 1~10, 11~20, 21~30. 제목은 `'제1장 인간기념물'`, `'제2장 생활 제일과'`, `'제3장 신판 흥보전'`
  - 각 페이지 본문은 한글 문단을 반복해 iPhone SE 높이의 2배 이상이 되게 한다.
  - `prev_page`·`next_page`는 1과 `totalPages`에서 `null`이다.
  - 응답 모양은 `src/types`의 `BookInfoResponse`, `PageResponse`, `EntryResponse`, `GraphResponse`를 따른다.
- [ ] **Step 5: `mockApi.ts`를 작성한다.** `page.route('http://api.e2e.test/**')`로 아래 요청에 응답한다.
  - `POST /books/:id/entry` → `{ route: 'reader', page: startPage ?? 15, is_new_session: false, session_epoch: 1 }`
  - `GET /books/:id/info` → 장 목록
  - `GET /books/:id/pages/:n` → 해당 페이지. `failPages`에 있으면 500
  - `POST /books/:id/progress` → `{ success: true, applied_cutoff: n }`. 요청 본문의 페이지를 `progress`에 기록한다.
  - `POST /books/:id/heartbeat` → `{}`
  - `GET /books/:id/ssabi/graph` → 인물 2명, 관계 1개
  - `GET /books/:id/chat/conversations` → `[]`
  - `POST /books/:id/recap/stream` → `mocks/server.ts`의 `mockStreamFrames` 형식을 따른 SSE 텍스트
  - `GET /books` → 책 1권 카탈로그
  - 그 밖의 요청 → 404
- [ ] **Step 6: `gestures.ts`의 `swipe`를 작성한다.**
  - `page.evaluate` 안에서 `document.elementFromPoint(fromX, y)`에 `PointerEvent`를 보낸다. 순서는 `pointerdown` → `steps`(기본 8)번의 `pointermove` → `pointerup`이다.
  - 이벤트 속성: `pointerType: 'touch'`, `isPrimary: true`, `bubbles: true`, `pointerId: 1`
  - move 사이에 `durationMs / steps`만큼 기다린다.
  - 합성 이벤트라 텍스트 선택이 생기지 않는다.
- [ ] **Step 7: PC 회귀 스크린샷 기준선을 만든다.**
  - `pc-regression.spec.ts`는 `desktop` 프로젝트에서만 돈다.
  - `/books/takryu-e2e/read`를 열어 `toHaveScreenshot('pc-reader.png')`를 찍는다.
  - 오른쪽 싸비 토글을 눌러 `toHaveScreenshot('pc-reader-ssabi.png')`를 찍는다.
  - `npx playwright test --project=desktop --update-snapshots`를 실행한 뒤, 같은 명령을 `--update-snapshots` 없이 다시 실행한다. Expected: 2 passed
- [ ] **Step 8: 커밋한다.**
  ```bash
  git add frontend/package.json frontend/package-lock.json frontend/playwright.config.ts frontend/e2e docs/validation/2026-11-06-mobile-baseline.md
  git commit -m "test(R4): 모바일 점검용 Playwright 기반과 PC 기준선 — FR-PRG-001"
  ```

### Task 2: 읽기 진행 로직을 `useReadingSession`으로 추출(동작 불변)

**Files:**
- Create: `frontend/src/hooks/useReadingSession.ts`
- Modify: `frontend/src/pages/Reader.tsx:42-418`. `ReadingSession` 안의 진행 로직을 훅으로 옮긴다.

**Interfaces:**
- Produces: `useReadingSession(bookId: string): ReadingSessionState`. `ReadingSessionState`는 아래를 가진다.
  - `entryError: boolean`, `retryEntry(): void`
  - `page: PageResponse | null`, `pageError: boolean`, `retryPage(): void`
  - `currentPage: number | null`, `totalPages: number`, `chapters: ChapterSummary[]`
  - `moveTo(page: number): void`. 기존 `setCurrentPage`를 대신한다.
  - `panelOpen: boolean`, `setPanelOpen(open: boolean): void`, `togglePanel(): void`
  - `highlightedQuote: string | null`, `quote(text: string): void`. 기존 `handleQuote`와 같고 패널도 연다.
  - `ssabiPanelProps`: `Reader.tsx` 566~595행에서 `<SsabiPanel>`에 넘기던 props 전부(`key` 제외). 타입은 `Omit<ComponentProps<typeof SsabiPanel>, never>`이다.
- 화면 쪽에 남기는 것: 목차 열림 상태, 패널 폭 조절(`usePanelResize`), 열기·닫기 애니메이션(`usePanelOpenTransition`, rAF 트릭), JSX

- [ ] **Step 1: 옮긴다.** `Reader.tsx` 60~418행에서 위 Produces에 해당하는 상태·ref·effect·콜백을 순서와 주석까지 그대로 훅으로 옮긴다. 레이아웃 관련 코드(목차·폭·애니메이션)는 `Reader.tsx`에 남긴다. `handleSelectChapter`는 `moveTo(startPage); setTocOpen(false)`로 바꾼다.
- [ ] **Step 2: 기존 테스트가 기준선과 같은지 확인한다.** `npm test`를 실행한다. Expected: Task 1 기준선과 같은 통과 수이고, 새 실패가 없다. 특히 `src/pages/Reader.*.test.tsx`는 7개 파일 모두 기준선 결과와 같아야 한다.
- [ ] **Step 3: PC 스크린샷을 비교한다.** `npx playwright test --project=desktop`를 실행한다. Expected: 2 passed. 스크린샷 차이는 1% 이하다.
- [ ] **Step 4: 커밋한다.**
  ```bash
  git add frontend/src/hooks/useReadingSession.ts frontend/src/pages/Reader.tsx
  git commit -m "refactor(R4): 읽기 진행 로직을 useReadingSession으로 추출 — FR-PRG-003, FR-SPL-002"
  ```

### Task 3: 모바일 판정 + `MobileReader` 뼈대

**Files:**
- Create: `frontend/src/mobile/device.ts`, `frontend/src/mobile/device.test.ts`
- Create: `frontend/src/mobile/pages/MobileReader.tsx`, `frontend/src/mobile/components/MobileReaderView.tsx`
- Modify: `frontend/src/App.tsx`(라우트 정의), `frontend/index.html`(viewport 메타에 `viewport-fit=cover` 추가)
- Modify: `frontend/src/components/Reader/ReaderView.tsx`(`highlightContent` export만 추가)
- Test: `frontend/src/App.mobile.test.tsx`, `frontend/e2e/mobile-reader.spec.ts`

**Interfaces:**
- Produces:
  - `isMobileDevice(screen: { width: number; height: number }): boolean`
  - `createAppRouter(isMobile = isMobileDevice(window.screen))`. 읽기 라우트에서 `isMobile`이면 `<MobileReader />`, 아니면 `<Reader />`를 그린다. 나머지 라우트는 그대로다.
  - `MobileReaderView` props: `{ content: string; currentPage: number; totalPages: number; prevPage: number | null; nextPage: number | null; onMove(page: number): void; highlightedQuote: string | null; chapterStart: ChapterSummary | null }`. Task 4에서 `swipeDisabled: boolean`, Task 7에서 `onQuote(text: string): void`를 추가한다.
  - 스와이프 표면 요소는 `data-testid="swipe-surface"`를 가진다.

- [ ] **Step 1: 실패 테스트를 작성한다.**
  ```ts
  test('isMobileDevice: 짧은 변 600 미만만 모바일', () => {
    expect(isMobileDevice({ width: 375, height: 667 })).toBe(true);
    expect(isMobileDevice({ width: 932, height: 430 })).toBe(true);
    expect(isMobileDevice({ width: 600, height: 1024 })).toBe(false);
    expect(isMobileDevice({ width: 1440, height: 1000 })).toBe(false);
  });
  ```
  `App.mobile.test.tsx`에서 `createAppRouter(true)`로 `/books/b/read`를 열면 `data-testid="mobile-reader"`가 있다. `createAppRouter(false)`로 열면 그 요소가 없다.
- [ ] **Step 2:** `npx vitest run src/mobile src/App.mobile.test.tsx`를 실행한다. Expected: FAIL(모듈 없음)
- [ ] **Step 3: 구현한다.**
  - `device.ts`, 라우트 분기, `MobileReader`를 만든다. `MobileReader`는 `Reader`처럼 `key={bookId}` 래퍼를 두고 `useReadingSession`을 쓴다. 진입·페이지 오류 시 PC와 같은 문구("페이지를 불러오지 못했습니다" + "다시 시도")를 보여 준다.
  - `MobileReaderView`는 본문 `article`을 그린다. 서체·크기는 PC와 같고(`font-dashSerif text-[18px] leading-[2]`), 좌우 패딩은 `px-6`이며, 위아래에 `env(safe-area-inset-*)` 여백을 둔다.
  - 하단 nav는 "이전/다음" 버튼(각 44×44 이상)과 페이지 입력을 둔다. 입력은 `text-[16px]`이다. 입력 확정 동작은 PC의 `commit`과 같다(1~totalPages로 자른 뒤 `onMove`).
  - 상단 뒤로 가기 버튼(44×44)은 `navigate('/', { viewTransition: true })`이다.
- [ ] **Step 4:** Step 2의 명령을 다시 실행한다. Expected: PASS
- [ ] **Step 5: E2E 테스트를 작성하고 돌린다.** `mobile-reader.spec.ts`에 세 가지를 넣는다.
  - G15: `iphone-se`에서 `mobile-reader`가 보인다. `desktop`에서는 보이지 않는다.
  - G16: `devices['iPhone 15 Pro Max landscape']`로 열어도 `mobile-reader`가 보이고, `document.documentElement.scrollWidth <= innerWidth`이다.
  - Review Focus 3: 페이지 입력의 computed `font-size`가 16 이상이다.
  
  `npx playwright test e2e/mobile-reader.spec.ts`를 실행한다. Expected: 전부 PASS
- [ ] **Step 6: 커밋한다.** `feat(R4): 모바일 판정과 모바일 읽기 화면 뼈대 — FR-PRG-001, FR-PRG-003`

### Task 4: 스와이프 페이지 넘김

**Files:**
- Create: `frontend/src/mobile/gestures/swipeDecision.ts`, `frontend/src/mobile/gestures/swipeDecision.test.ts`
- Create: `frontend/src/mobile/gestures/useSwipePager.ts`
- Modify: `frontend/src/mobile/components/MobileReaderView.tsx`
- Test: `frontend/e2e/mobile-swipe.spec.ts`

**Interfaces:**
- Produces:
  - `decideSwipe(i: { dx: number; dy: number; velocityX: number; width: number; hasPrev: boolean; hasNext: boolean }): 'next' | 'prev' | 'cancel'`. `velocityX`의 단위는 px/ms이다.
  - `useSwipePager(o: { hasPrev: boolean; hasNext: boolean; onNext(): void; onPrev(): void; disabled: boolean }): { offsetX: number; settling: boolean; bind: { onPointerDown; onPointerMove; onPointerUp; onPointerCancel } }`
- 스펙 값(결정 4)과 작성자 판단 값:
  - 넘김 거리: `|dx| >= width * 0.25`
  - 빠른 튕김: `|velocityX| >= 0.5` 그리고 `|dx| >= 24`
  - 방향 확정: 처음 10px 움직인 뒤 `|dx| > |dy|`이면 가로로 본다. 세로로 확정되면 그 제스처는 끝까지 무시한다.
  - 끝 페이지 저항: 끝 페이지 쪽으로 미는 동안 `offsetX = dx * 0.3`이고, 손을 떼면 `'cancel'`이다.
  - 복귀·이탈 애니메이션: 220ms `ease-out`
  - 스와이프 표면 CSS: `touch-action: pan-y`
  - 방향: 왼쪽으로 밀기(`dx < 0`)는 next, 오른쪽으로 밀기(`dx > 0`)는 prev

- [ ] **Step 1: 실패 테스트를 작성한다.** (`width = 375`)
  ```ts
  test('FR-PRG-003: 1/4 이상 왼쪽으로 밀면 다음', () =>
    expect(decideSwipe({ dx: -100, dy: 5, velocityX: -0.2, width: 375, hasPrev: true, hasNext: true })).toBe('next'));
  test('1/4 이상 오른쪽으로 밀면 이전', () =>
    expect(decideSwipe({ dx: 100, dy: 5, velocityX: 0.2, width: 375, hasPrev: true, hasNext: true })).toBe('prev'));
  test('짧고 느리면 취소', () =>
    expect(decideSwipe({ dx: -60, dy: 0, velocityX: -0.1, width: 375, hasPrev: true, hasNext: true })).toBe('cancel'));
  test('짧아도 빠르면 다음', () =>
    expect(decideSwipe({ dx: -60, dy: 0, velocityX: -1.2, width: 375, hasPrev: true, hasNext: true })).toBe('next'));
  test('마지막 페이지에서 다음은 취소', () =>
    expect(decideSwipe({ dx: -200, dy: 0, velocityX: -1, width: 375, hasPrev: true, hasNext: false })).toBe('cancel'));
  test('첫 페이지에서 이전은 취소', () =>
    expect(decideSwipe({ dx: 200, dy: 0, velocityX: 1, width: 375, hasPrev: false, hasNext: true })).toBe('cancel'));
  test('세로가 더 크면 취소', () =>
    expect(decideSwipe({ dx: -120, dy: 200, velocityX: -1, width: 375, hasPrev: true, hasNext: true })).toBe('cancel'));
  ```
- [ ] **Step 2:** `npx vitest run src/mobile/gestures`를 실행한다. Expected: FAIL
- [ ] **Step 3: 구현한다.**
  - `decideSwipe`와 `useSwipePager`를 만든다. `pointerdown` 때 `setPointerCapture`를 건다.
  - `disabled`이면 모든 핸들러가 아무것도 하지 않는다.
  - `MobileReaderView`에 연결한다. next는 `onMove(nextPage)`, prev는 `onMove(prevPage)`이다.
  - `MobileReaderView`에 prop `swipeDisabled: boolean`을 추가한다. `MobileReader`는 싸비가 열렸을 때 `true`를 넘긴다. 페이지 로드 중이거나 오류일 때는 `MobileReaderView` 자체가 그려지지 않는다(PC와 같은 분기).
  - 훅의 `disabled`는 `swipeDisabled`가 참이거나, 제스처 시작 시점에 `document.getSelection()`에 글자가 있으면(G7) 켠다.
- [ ] **Step 4:** Step 2의 명령을 다시 실행한다. Expected: PASS
- [ ] **Step 5: E2E 테스트를 작성한다.** `mobile-swipe.spec.ts`는 `iphone-se`·`iphone-pro-max`에서 돌고, 시작 페이지는 15다.
  - G1: `swipe(fromX: w*0.8 → toX: w*0.3, durationMs: 400)` 후 페이지 입력 값이 `16`이고 `log.progress`의 마지막이 `16`이다. 넘김으로 늘어난 진도 요청은 정확히 1건이다.
  - G2: 반대 방향으로 밀면 값이 `14`다.
  - G3: `w*0.6 → w*0.6-60`, 600ms로 밀면 값이 `15` 그대로이고 새 진도 요청은 0건이다.
  - G4: `w*0.6 → w*0.6-60`, 50ms로 밀면 값이 `16`이다.
  - G5: `startPage: 30`에서 다음 방향, `startPage: 1`에서 이전 방향으로 밀면 값이 그대로이고 새 진도 요청은 0건이다.
  - G6: `page.mouse.wheel(0, 800)`과 `article.evaluate(el => el.scrollTop = 600)` 후 새 진도 요청과 새 `pageFetches`가 모두 0건이다.
  - Review Focus 2: 연속 두 번 밀기(각 400ms, 사이에 페이지 로드 대기) 후 `log.progress`의 끝 두 값이 `[16, 17]`이다.
  - Review Focus 4: `failPages: [16]`에서 다음으로 밀면 "다시 시도"가 보인다. 그 상태에서 다시 밀어도 `pageFetches`에 `17`이 없다.
- [ ] **Step 6:** `npx playwright test e2e/mobile-swipe.spec.ts`를 실행한다. Expected: 전부 PASS
- [ ] **Step 7: 커밋한다.** `feat(R4): 모바일 스와이프 페이지 넘김 — FR-PRG-003, FR-PRG-001`

### Task 5: 양옆 손잡이 + 전체 화면 싸비

**Files:**
- Create: `frontend/src/mobile/components/EdgeHandle.tsx`, `frontend/src/mobile/components/MobileSsabiSheet.tsx`
- Modify: `frontend/src/mobile/pages/MobileReader.tsx`
- Test: `frontend/e2e/mobile-handles.spec.ts`

**Interfaces:**
- Produces:
  - `EdgeHandle` props: `{ side: 'left' | 'right'; label: string; open: boolean; onToggle(): void; hidden?: boolean }`. 렌더 결과는 `<button aria-label={label} aria-expanded={open}>`이다.
  - `MobileSsabiSheet` props: `{ open: boolean; children: ReactNode }`. `open`일 때 `fixed inset-0 h-[100dvh]`, `z-40`, `data-testid="mobile-ssabi"`이다.
- 값(결정 6·7, 작성자 판단):
  - 위치: `position: fixed`, `top: 58%`. 왼쪽은 `left: 0`, 오른쪽은 `right: 0`이다.
  - 누르는 영역: 44×64px
  - 보이는 부분: 가장자리에서 14px만 튀어나온 둥근 탭, `opacity: 0.7`
  - 쌓임 순서: `z-50`. 싸비 시트보다 위다.
  - 라벨: 왼쪽 `'목차'`, 오른쪽 `'싸비'`
  - 손잡이 요소에서 시작한 포인터 이벤트는 `stopPropagation`해서 스와이프로 넘어가지 않게 한다.

- [ ] **Step 1: E2E 실패 테스트를 작성한다.** `mobile-handles.spec.ts`
  - G9: '싸비' 손잡이를 누르면 `mobile-ssabi`의 boundingBox가 viewport와 같다(±1px). 같은 손잡이를 다시 누르면 `mobile-ssabi`가 사라지고 페이지 입력 값이 그대로다.
  - C4: 두 손잡이의 boundingBox가 가로 44 이상, 세로 44 이상이다.
  - C3: 손잡이 boundingBox와 `article` 안 첫 텍스트 줄의 Range rect가 겹치지 않는다.
  - Review Focus 1: 싸비가 열린 상태에서 `swipe(w*0.8 → w*0.2)`를 해도 새 진도 요청이 0건이다.
  - Review Focus 5: 오른쪽 손잡이 위치에서 시작해 `w*0.2`까지 밀어도 페이지가 그대로다.
- [ ] **Step 2:** `npx playwright test e2e/mobile-handles.spec.ts`를 실행한다. Expected: FAIL
- [ ] **Step 3: 구현한다.**
  - `MobileReader`에 오른쪽 손잡이를 둔다. `open = panelOpen`, `onToggle = togglePanel`이다.
  - `MobileSsabiSheet` 안에 `<SsabiPanel key={currentPage} {...ssabiPanelProps} />`를 그린다. PC처럼 닫으면 언마운트한다.
  - 시트를 즉시 마운트·언마운트할지, 슬라이드 애니메이션을 둘지는 만드는 사람이 정한다.
- [ ] **Step 4:** Step 2의 명령을 다시 실행한다. Expected: PASS
- [ ] **Step 5: 커밋한다.** `feat(R4): 모바일 양옆 손잡이와 전체 화면 싸비 — FR-SVB-003`

### Task 6: 목차 리스트

**Files:**
- Create: `frontend/src/mobile/components/TocList.tsx`
- Modify: `frontend/src/mobile/pages/MobileReader.tsx`(왼쪽 손잡이 + 리스트)
- Test: `frontend/e2e/mobile-toc.spec.ts`

**Interfaces:**
- Produces: `TocList` props: `{ chapters: ChapterSummary[]; currentPage: number | null; onSelect(startPage: number): void }`. 렌더 결과는 `role="list"`, `data-testid="toc-list"`이다. 현재 장 항목은 `aria-current="true"`다.
- 값(결정 8·9): 왼쪽 손잡이 옆에 붙어 펼쳐진다. `max-width: 45vw`(반드시 50% 미만), `max-height: 50dvh`, 내부 세로 스크롤, 항목 높이 44px 이상, 제목 `line-clamp-2`, 배경 어둡게 깔기 없음.
- 현재 장 판정은 `TocPanel.tsx` 67~69행과 같은 비교(`start_page <= currentPage <= end_page`)를 쓴다.

- [ ] **Step 1: E2E 실패 테스트를 작성한다.** `mobile-toc.spec.ts`, 시작 페이지는 15다.
  - G10: '목차' 손잡이를 누르면 `toc-list` 폭이 `innerWidth * 0.5`보다 작고, `aria-current` 항목이 `'제2장 생활 제일과'`이며 리스트 안에서 보인다. '제3장' 항목을 누르면 페이지 입력 값이 `21`, `log.progress`의 마지막이 `21`이고 리스트가 닫힌다. 다시 열고 손잡이를 다시 누르면 닫힌다.
  - G11: 리스트를 연 채로 `startPage: 20`에서 다음으로 밀면 값이 `21`이 되고, `aria-current`가 '제3장'으로 바뀐다.
  - C1: 리스트를 연 상태에서 `scrollWidth <= innerWidth`이다.
- [ ] **Step 2:** `npx playwright test e2e/mobile-toc.spec.ts`를 실행한다. Expected: FAIL
- [ ] **Step 3: 구현한다.** 장을 고르면 `moveTo(startPage)` 후 리스트를 닫는다. 리스트가 열릴 때 현재 장 항목에 `scrollIntoView({ block: 'nearest' })`를 호출한다.
- [ ] **Step 4:** Step 2의 명령을 다시 실행한다. Expected: PASS
- [ ] **Step 5: 커밋한다.** `feat(R4): 모바일 목차 리스트 — FR-NAV-001`

### Task 7: 꾹 눌러 고른 문장을 챗봇에 인용

**Files:**
- Create: `frontend/src/mobile/components/QuoteAskButton.tsx`
- Modify: `frontend/src/mobile/components/MobileReaderView.tsx`
- Test: `frontend/e2e/mobile-quote.spec.ts`

**Interfaces:**
- Consumes: `useQuoteSelection<HTMLElement>()`(`hooks/useQuoteSelection.ts`), 그리고 `useReadingSession`의 `quote(text)`
- Produces: `QuoteAskButton` props: `{ popover: QuoteSelectionPopover; onAsk(): void }`
- 값(결정 5): 위치는 `top = popover.bottom + 12`, 가로 가운데 정렬, 좌우 16px 안으로 제한한다. 문구는 `'챗봇에 물어보기'`, 높이는 44px 이상이다.

- [ ] **Step 1: E2E 실패 테스트를 작성한다.** `mobile-quote.spec.ts`
  - 선택 흉내: `page.evaluate`로 `article` 첫 텍스트 노드의 0~20번째 글자에 Range를 만들어 `addRange`하고, `touchend`를 보낸다.
  - G8: '챗봇에 물어보기' 버튼의 top이 선택 Range rect의 bottom보다 크다. 버튼을 누르면 `mobile-ssabi`가 보이고 챗봇 탭이 선택돼 있으며, 인용 카드에 선택 문자열이 있다.
  - G7: 선택이 남아 있는 상태에서 `swipe(w*0.8 → w*0.2)`를 해도 페이지가 그대로다. `getSelection().removeAllRanges()` 후 다시 밀면 넘어간다.
- [ ] **Step 2:** `npx playwright test e2e/mobile-quote.spec.ts`를 실행한다. Expected: FAIL
- [ ] **Step 3: 구현한다.**
  - `MobileReaderView`에서 `useQuoteSelection`의 `containerRef`를 `article`에 붙인다.
  - prop `onQuote(text: string): void`를 추가하고, `MobileReader`가 `quote`를 넘긴다.
  - 버튼을 누르면 `onQuote(popover.text)`를 호출하고, 선택을 해제하고, `clearPopover()`를 호출한다.
- [ ] **Step 4:** Step 2의 명령을 다시 실행한다. Expected: PASS
- [ ] **Step 5: 커밋한다.** `feat(R4): 모바일 문장 인용 — FR-QNA-006`

### Task 8: 읽기 단계 화면 점검 + 스크린샷 → 사용자 피드백

**Files:**
- Create: `frontend/e2e/support/layoutChecks.ts`, `frontend/e2e/mobile-layout.spec.ts`
- Create: `docs/validation/2026-11-06-mobile-reader-stage.md`

**Interfaces:**
- Produces:
  - `noHorizontalScroll(page): Promise<boolean>`
  - `overflowingTexts(page): Promise<string[]>`. 글자 요소의 `scrollWidth > clientWidth + 1` 또는 `scrollHeight > clientHeight + 1`인 것 중, `line-clamp`·`text-ellipsis`·`overflow-y-auto` 컨테이너를 뺀 것의 선택자 목록
  - `smallTapTargets(page): Promise<string[]>`. 보이는 `button`, `a`, `input`, `[role=tab]` 중 가로나 세로가 44 미만인 것
  - `fontReport(page): Promise<{ family: string; serifLoaded: boolean; pretendardLoaded: boolean; hangulWidth: number }>`
    - `family`: `article`의 computed `fontFamily`
    - `serifLoaded`: `document.fonts.check('18px "Nanum Myeongjo"')`
    - `pretendardLoaded`: `document.fonts.check('16px "Pretendard"')`
    - `hangulWidth`: `article`과 같은 글꼴로 canvas `measureText('가나다').width`

- [ ] **Step 1: 점검 테스트를 작성한다.** `mobile-layout.spec.ts`는 `iphone-se`·`iphone-pro-max` 각각에서 상태 4개를 연다. 읽기 기본, 목차 열림, 싸비 열림, 인용 버튼 표시 상태다.
  - C1: `noHorizontalScroll`이 `true`
  - C2: `overflowingTexts`가 `[]`
  - C4: `smallTapTargets`가 `[]`. 이번 단계에서는 싸비 내부를 제외한다. 싸비 내부는 2단계 범위다.
  - C6: `page.addStyleTag`로 `:root { --sat: 47px; --sab: 34px }`를 흉내 내고, 손잡이·하단 nav가 위 47px, 아래 34px 영역 밖에 있다. 이를 위해 Task 3의 안전 영역 여백은 `env(safe-area-inset-top, var(--sat, 0px))` 형태로 쓴다.
  - C5: `fontReport().hangulWidth > 0`이다. `family`와 두 `loaded` 값은 Step 4 기록에 남긴다.
  - C7: 각 상태를 `test-results/screens/{project}-{state}.png`로 저장한다.
- [ ] **Step 2: 실행하고 고친다.** `npx playwright test e2e/mobile-layout.spec.ts`를 실행한다. 실패하면 모바일 컴포넌트를 고친다. 테스트 기대값은 바꾸지 않는다. Expected: 전부 PASS
- [ ] **Step 3: 전체 회귀를 확인한다.** `npm test`와 `npx playwright test`를 실행한다. Expected: vitest는 기준선 이상이고, E2E는 전부 PASS다.
- [ ] **Step 4: 기록한다.** `docs/validation/2026-11-06-mobile-reader-stage.md`에 실행 명령, 통과 수, 글꼴 확인 결과(C5), 스크린샷 경로, "실기기 미확인" 항목(스펙 5.4의 1~4)을 적는다.
- [ ] **Step 5: 커밋한다.** `test(R4): 모바일 읽기 단계 화면 점검 — FR-PRG-001, NFR-USE`
- [ ] **Step 6: 사용자 피드백을 받는다.** 스크린샷 8장(2개 크기 × 상태 4개)을 사용자에게 보여 준다. 손잡이 크기·모양과 목차 리스트 모양에 대해 피드백을 받고 반영한다(결정 8·17). 반영이 끝나야 2단계(싸비 내부) 계획으로 넘어간다.
