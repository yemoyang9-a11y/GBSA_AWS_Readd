# 모바일 3단계 — 브리핑·서재·404·홈 화면 추가 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (TDD per task). Steps use checkbox (`- [ ]`) syntax.

**Goal:** iPhone 세로 화면에서 서재 → 브리핑 → 읽기 흐름이 막힘없게 한다. 모바일 브리핑·서재 화면을 `frontend/src/mobile/`에 새로 만들고, 404·오류 화면을 점검하고, 홈 화면 추가(standalone)를 지원한다.

**Spec:** `docs/superpowers/specs/2026-11-06-mobile-webapp-design.md` (2·3·4.5·5.2절, 결정 10·11·18). 앞 단계 계획: `2026-11-06-mobile-reader.md`, `2026-11-06-mobile-ssabi.md`. **그 계획들의 Global Constraints를 모두 따른다.**

## 먼저 읽을 기존 코드 (패턴을 그대로 따른다)

- 로직 추출 선례: `frontend/src/hooks/useReadingSession.ts`. `pages/Reader.tsx`에서 동작을 바꾸지 않고 옮긴 방식이다.
- 모바일 화면 선례: `frontend/src/mobile/pages/MobileReader.tsx`, `mobile/components/*`. 안전 영역은 `var(--safe-top)`/`var(--safe-bottom)`을 쓴다.
- 라우트 분기: `frontend/src/App.tsx`의 `createAppRouter(isMobile)`
- E2E 기반: `frontend/e2e/support/{mockApi,fixtures,gestures,layoutChecks,keyboard}.ts`, `frontend/playwright.config.ts`. 프로젝트는 `iphone-se`(320×568), `iphone-pro-max`(430×739), `desktop`(1440×1000)이다.
- 현재 PC 화면을 iPhone 크기로 열면 이렇게 깨진다(실측). 서재는 가로 스크롤, "읽기 시작" 버튼이 화면 밖, 제목·필터가 한 글자씩 세로로 쌓임, 정보 버튼 42px. 브리핑은 인사 문구가 한 글자씩 세로로 쌓임, 돌아가기 36px, 이어서 읽기 34px.

## Global Constraints (이 단계 추가분)

- `pages/Briefing.tsx`·`pages/Dashboard.tsx`의 진행 로직은 공용 훅으로 **동작 불변 추출**만 한다(결정 18). 진입 판정·진도 저장 후 이동·데모 항목 진입 차단·필터 처리·총 페이지 조회 등이 대상이다. PC 화면 파일(`pages/BriefingView.tsx`, `components/Dashboard/*`)의 모양은 바꾸지 않는다.
- 모바일 화면은 `mobile/` 안에 새로 짓는다. 화면 판정 유틸(`utils/briefingView.ts`의 `resolveBriefingView`), `TypographicCover`, `ProgressBar`, `parseRecapParagraphs`, `splitHighlighted`, `EMPTY_RECAP_MESSAGE`, `BOOK_INFO_CONTENT`처럼 모양이 아닌 공용 조각은 import해 쓴다.
- %·진도·기준점은 서버 값만 쓴다(절대 규칙 2). 브리핑의 "마저 읽기"는 리캡 상태와 무관하게 즉시 동작한다(FR-SPL-005).
- 브리핑에서 장을 고르면 PC와 같이 `sendProgress` 완료를 기다린 뒤 읽기 화면으로 간다.
- 각 Task가 끝나면 **전체** `npx vitest run`과 `npx playwright test`를 돌린다(작업 단위 테스트만 돌리면 회귀를 놓친다 — lessons.md 2026-11-06). 알려진 불안정 테스트 두 개는 재실행해서 통과하면 된다. 하나는 `Reader.quotePageChange`(작업 전부터 간헐 실패)이고, 다른 하나는 G4 빠른 튕김(재시도 2회 허용)이다.
- 터치 UI 테스트는 `click()`이 아니라 `tap()`으로 쓴다.
- 커밋 형식은 `{type}(R4): {요약} — {조항 ID}`, 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`이다. 커밋 후 `git log --oneline -1`로 커밋이 실제로 생겼는지 확인한다. 본 체크아웃의 `packed-refs.lock` 경고는 무시하되, 커밋 실패 여부는 확인한다. push는 하지 않는다.
- 패키지를 새로 설치하지 않는다.

## Review Focus

1. 서재의 데모 항목(실제 카탈로그에 없는 책)은 미리보기만 되고 진입 버튼으로 서버 요청이 나가지 않아야 한다. → Task 3
2. 브리핑에서 장을 고르면 진도 요청이 응답한 뒤에 읽기 화면으로 넘어가야 한다(순서). → Task 2
3. 저장 리캡이 없으면(fallback) 리캡 스트리밍을 정확히 1회만 요청하고, 첫 진입(cutoff 0)이면 요청이 0회여야 한다. → Task 2
4. 책 정보 시트가 열려 있을 때 배경 스크롤이 막히고, 닫기(44px)와 바깥 누르기로 닫혀야 한다. → Task 3
5. 홈 화면 standalone에서 상단 노치 영역에 서재 머리글이 가리지 않아야 한다. → Task 4

---

### Task 1: 점검 데이터를 실제와 맞추고 목차 리스트에 장 번호 표시

- `e2e/support/fixtures.ts`의 장 제목에서 "제N장 "을 뺀다(실제 서버처럼 `title`에 장 번호가 없게). 예: `'인간기념물'`, `'생활 제일과'`, `'신판 흥보전'`.
- 기존 E2E에서 제목 문자열로 찾던 곳을 고친다(`mobile-toc.spec.ts` 등).
- `mobile/components/TocList.tsx` 항목 앞에 PC `TocPanel.tsx`처럼 장 번호를 표시한다. `"{chapter_no}"` 원형 배지를 쓰고, 현재 장은 강조 색이다.
- 테스트를 먼저 쓴다. 리스트 항목에 `1`·`2`·`3`과 제목이 함께 보이고, 현재 장 항목 텍스트가 `2`와 `생활 제일과`를 포함한다.
- 커밋: `fix(R4): 모바일 목차 리스트 장 번호 표시·점검 데이터 정합 — FR-NAV-001`

### Task 2: 브리핑

**Files:** Create `hooks/useBriefingSession.ts`(Briefing.tsx 로직 추출), `mobile/pages/MobileBriefing.tsx`, `mobile/components/MobileBriefingView.tsx`, `e2e/mobile-briefing.spec.ts`. Modify `pages/Briefing.tsx`(훅 사용, 동작 불변), `App.tsx`(브리핑 라우트 분기), `e2e/support/mockApi.ts`(브리핑 응답 옵션: 저장 리캡 있음/없음/첫 진입 cutoff 0 — `MockApiOptions`에 `briefingRecap?: 'saved' | 'none' | 'first'` 추가. 이미 GET `/briefing` 기본 응답이 있다).

**레이아웃(출발 안 — 스크린샷으로 확정):** 세로 한 줄로 쌓는다.
- 위: 44px 돌아가기
- 표지(작게, 가운데 또는 왼쪽)와 인사 문구 2줄. `text-[22px]` 정도로, 한 글자씩 쌓이지 않아야 한다.
- 진도 카드: 장 제목·전체 쪽수·진도 막대·%. "이어서 읽기"는 폭 100%, 높이 48px.
- 리캡 카드: PC와 같은 상태 분기(empty / fallback 실패 / recap·fallback 스트리밍)
- 목차 아코디언: 항목 44px 이상. 장 번호와 제목을 표시하고 현재 장을 강조한다.
- 좌우 여백 `px-5`, 위아래 안전 영역

**Steps:**
- [ ] 추출 → `npx vitest run` 기준선 그대로(424), `npx playwright test --project=desktop` PC 스크린샷 동일
- [ ] E2E 실패 테스트 작성(iphone-se·pro-max):
  - 모바일에서 `/books/:id/briefing`이 모바일 브리핑(`data-testid="mobile-briefing"`)으로 그려지고, 데스크톱은 PC 브리핑이다.
  - C1 가로 스크롤 없음, C2 글자 넘침 없음, C4 44px
  - 인사 문구 `h2` 높이가 3줄 이하
  - "이어서 읽기"를 탭하면 `/read`로 가고, 진도 요청은 없다(읽기 화면 진입 후 진입 판정만).
  - 목차를 펼쳐 3번 장을 탭하면 진도 요청 `21`이 기록된 **뒤에** 읽기 화면 article이 보인다.
  - `briefingRecap: 'none'`이면 `/recap/stream` 요청이 정확히 1건, `'first'`이면 0건이다(mockApi에 요청 기록 추가).
- [ ] 구현 → 통과 → 전체 회귀 → 커밋 `feat(R4): 모바일 브리핑 화면 — FR-BRF-001, FR-SPL-005`

### Task 3: 서재(대시보드)와 책 정보 시트

**Files:** Create `hooks/useDashboard.ts`(Dashboard.tsx 로직 추출 — `applyDashFilter`, `displayBooks`, `selectedBook`, `enterable`, `totalPages`, `handleFilterChange`, `handleResume`, `emptyMessage`, `catalogError`/`loadCatalog`, `infoBook`), `mobile/pages/MobileDashboard.tsx`, `mobile/components/MobileShelf.tsx`, `mobile/components/MobileBookInfoSheet.tsx`, `e2e/mobile-dashboard.spec.ts`. Modify `pages/Dashboard.tsx`(훅 사용, 동작 불변), `App.tsx`(`/` 분기).

**레이아웃(출발 안):**
- 위: 로고 줄(안전 영역 아래). 검색은 PC에서도 동작하지 않는 장식이면 모바일에서는 뺀다(코드를 확인해 판단하고 기록).
- 환영 문구: 1~2줄
- 이어 읽기 카드: 표지·제목·저자·진도(서버 값)를 담고, "이어서 읽기/읽기 시작" 버튼은 폭 100%, 48px. 데모 항목이면 PC와 같은 비활성 처리를 한다.
- 내 서재: 필터 칩 3개(각 44px), 1열 목록 행(표지 썸네일·제목·저자·진도·정보 버튼 44px). 행을 탭하면 위 카드 미리보기가 바뀐다(PC와 같음).
- 책 정보: 아래에서 올라오는 시트. `role="dialog" aria-modal`, 닫기 44px, 바깥 탭으로 닫힘, 열린 동안 배경 스크롤 잠금. 내용은 `BOOK_INFO_CONTENT`를 쓴다.

**Steps:**
- [ ] 추출 → vitest 기준선 그대로, PC 스크린샷 동일(서재 PC 스크린샷 기준선 `pc-dashboard.png`를 **추출 전에** `pc-regression.spec.ts`에 추가해 만들어 둔다)
- [ ] E2E 실패 테스트(iphone-se·pro-max):
  - 모바일 `/`가 `data-testid="mobile-dashboard"`로 그려진다.
  - C1·C2·C4 통과
  - 이어서 읽기를 탭하면 `POST /entry` 1건 후 `/read` 또는 `/briefing`(mock `route` 값대로)으로 간다.
  - 데모 항목 행을 탭한 뒤 진입 버튼은 비활성이고, 눌러도 `entries`가 늘지 않는다.
  - 정보 버튼을 탭하면 시트가 뜨고(`role=dialog`), 닫기 버튼과 바깥 탭으로 각각 닫힌다.
  - 필터 "읽는 중"을 탭하면 목록이 진도 있는 책만 보인다.
- [ ] 구현 → 통과 → 전체 회귀 → 커밋 `feat(R4): 모바일 서재 화면과 책 정보 시트 — FR-BRW-001, FR-BRW-003`

### Task 4: 404·오류 화면과 홈 화면 추가

- **404:** 모바일에서 `pages/NotFound.tsx`를 실측한다(현재 3줄). 44px "서재로" 버튼이 있는 모바일 404를 `mobile/pages/MobileNotFound.tsx`로 만들고 라우트를 분기한다. 오류 화면(서재 불러오기 실패, 진입 실패, 페이지 실패)이 모바일에서 C1·C2·C4를 통과하는지 테스트한다(mockApi에 `failCatalog?: boolean`, `failEntry?: boolean` 옵션 추가).
- **홈 화면 추가(결정 10):**
  - `frontend/public/manifest.webmanifest`: `name`/`short_name` "싸비", `display: "standalone"`, `start_url: "/"`, `background_color`·`theme_color`는 `tailwind.config.js`의 `brief.paper` 값
  - `index.html`: `<link rel="manifest">`, `<meta name="apple-mobile-web-app-capable" content="yes">`, `<meta name="apple-mobile-web-app-status-bar-style" content="default">`, `<meta name="apple-mobile-web-app-title" content="싸비">`, `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`
  - 아이콘: 패키지를 설치하지 않는다. `frontend/src/assets`의 아모 얼굴 이미지(싸비 아이콘으로 쓰이는 `ssabiFace`)를 가운데 둔 단색 배경 HTML을 Playwright로 180×180·512×512 스크린샷으로 떠서 `public/apple-touch-icon.png`, `public/icon-512.png`로 저장한다. 생성 스크립트는 `frontend/e2e/tools/make-icons.spec.ts`(기본 실행에서 제외: `test.skip(!process.env.MAKE_ICONS)`)로 남긴다.
  - E2E: `GET /manifest.webmanifest`가 200이고 JSON의 `display`가 `standalone`이다. 아이콘 링크가 200이다.
- 커밋 `feat(R4): 모바일 404·오류 화면 점검과 홈 화면 추가 — NFR-USE`

### Task 5: 기록

- `mobile-layout.spec.ts`(또는 새 spec)에 서재·브리핑·책 정보 시트·404 스크린샷을 추가해 `test-results/screens/`에 저장한다. 그다음 `docs/validation/2026-11-06-mobile-shelf-screens/`로 복사한다.
- `docs/validation/2026-11-06-mobile-shelf-stage.md`에 실행 명령·결과·바꾼 공유 파일·판단(Ruling)·실기기 미확인 항목을 적고 커밋한다.
