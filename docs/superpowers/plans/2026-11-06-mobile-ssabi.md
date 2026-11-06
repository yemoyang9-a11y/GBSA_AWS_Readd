# 모바일 2단계 — 싸비 내부 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 화면 전체로 열린 싸비를 iPhone에서 막힘없이 쓰게 한다. 탭 44px, 제목 줄바꿈, 챗봇 입력(키보드 대응, 16px, 보내기 버튼), 관계도 조작 확인, 1단계에서 미룬 두 건을 다룬다.

**Spec:** `docs/superpowers/specs/2026-11-06-mobile-webapp-design.md` 4.4, 5.2(G12~G14, 싸비 안 C2·C4). 1단계 계획 `2026-11-06-mobile-reader.md`의 기반(Playwright, `installMockApi`, `swipe`, `layoutChecks`)을 그대로 쓴다.

## Global Constraints

- 1단계 Global Constraints를 모두 따른다.
- 싸비 내부 컴포넌트(`components/Ssabi/*`)는 PC와 공유한다. 휴대폰용 크기는 이 저장소의 기존 관례(`RelationshipTab.tsx`의 `min-h-11 lg:min-h-0`)처럼 `lg:` 접두사로 PC(1024px 이상) 값을 되돌려 둔다. 1440px PC 스크린샷(P2)은 바뀌지 않아야 한다.
- 키보드 대응은 `mobile/` 안에서 `window.visualViewport`로 한다. PC 컴포넌트에 키보드 로직을 넣지 않는다.

## Review Focus

1. 키보드가 떠 있는 동안 싸비 손잡이를 다시 누를 수 없어도, 입력창 밖을 누르면 키보드가 내려가고 손잡이가 돌아와야 한다. → Task 2
2. 빈 입력에서 보내기 버튼은 비활성이고, 한글 조합 중 Enter 처리는 그대로여야 한다. → Task 2
3. 관계도 전체화면 오버레이가 싸비 시트·손잡이 위에 떠야 하고(z 순서), 닫으면 시트로 돌아와야 한다. → Task 3
4. 리캡 탭의 새로고침·인용 등 리캡 안 버튼도 44px이어야 한다. → Task 1
5. 싸비를 닫았다 열어도 목차 리스트가 저절로 다시 펼쳐지지 않아야 한다. → Task 1

---

### Task 1: 싸비 시트 레이아웃 — 탭 44px, 제목, 손잡이 겹침, 목차 재펼침

**Files:** Modify `components/Ssabi/SsabiPanel.tsx`(탭·제목 클래스), 필요한 싸비 탭 컴포넌트의 버튼 클래스, `mobile/pages/MobileReader.tsx`, `mobile/components/EdgeHandle.tsx`. Test: `e2e/mobile-ssabi-layout.spec.ts`

- [ ] **Step 1: 실패 테스트를 작성한다.** 3개 탭 각각에서 다음을 확인한다.
  - `smallTapTargets(page)`가 `[]`(싸비 안 포함)
  - `overflowingTexts(page, '[data-testid="mobile-ssabi"]')`가 `[]`
  - 제목 `h2` "아모의 가이드북"의 높이가 한 줄(`lineHeight * 1.5` 미만)
  - 열린 싸비에서 오른쪽 손잡이의 boundingBox가 시트 안 다른 버튼(`elementFromPoint` 기준)과 겹치지 않는다: 손잡이 중심점의 `elementFromPoint`가 손잡이 자신이다.
  - 목차를 열고 → 싸비 열고 → 싸비 닫으면 `toc-list` 0개
- [ ] **Step 2:** 실행해 실패를 확인한다.
- [ ] **Step 3: 구현한다.**
  - 탭: `min-h-11 lg:min-h-0`
  - 제목: `whitespace-nowrap`
  - 작은 버튼은 `min-h-11 min-w-11 lg:min-h-0 lg:min-w-0` 관례로 키운다.
  - 싸비를 열면(`panelOpen`이 true가 되면) 목차를 닫는다.
  - 싸비가 열린 동안 오른쪽 손잡이는 시트 내용과 겹치지 않는 자리로 옮긴다. 시트 머리글 오른쪽 위, 즉 `top: calc(var(--safe-top) + 8px)` 높이다. 이 경우 손잡이는 같은 모양을 유지한다(결정 6).
- [ ] **Step 4:** 테스트 통과, `npx playwright test --project=desktop`(P2) 통과, `npx vitest run` 통과.
- [ ] **Step 5: 커밋** `feat(R4): 모바일 싸비 시트 레이아웃 — FR-SVB-003, NFR-USE`

### Task 2: 챗봇 입력창과 키보드

**Files:** Create `mobile/useVisualViewport.ts`. Modify `mobile/components/MobileSsabiSheet.tsx`, `mobile/pages/MobileReader.tsx`, `components/Ssabi/ChatbotTab.tsx`(입력 글자 크기·보내기 버튼 크기·비활성 조건). Test: `e2e/mobile-chat.spec.ts`, `e2e/support/keyboard.ts`

**Interfaces:**
- `useVisualViewport(): { height: number; offsetTop: number; keyboardOpen: boolean }`. `keyboardOpen`은 `innerHeight - visualViewport.height > 120`.
- `e2e/support/keyboard.ts`: `installFakeKeyboard(page)`는 `addInitScript`로 `window.visualViewport`를 가짜 EventTarget으로 바꾼다. `showKeyboard(page, px)`·`hideKeyboard(page)`는 높이를 바꾸고 `resize`를 보낸다.

- [ ] **Step 1: 실패 테스트를 작성한다.**
  - G12: 챗봇 탭에서 입력창을 누르고 `showKeyboard(300)` → 시트 bottom ≤ `innerHeight - 300`, 입력창 bottom ≤ `innerHeight - 300`, tablist가 보이고, 싸비 손잡이가 0개다. 대화 영역(입력창 밖)을 누르면 입력창 포커스가 풀린다. `hideKeyboard` 후 손잡이가 다시 보인다.
  - G13: 줄바꿈 10줄을 입력하면 입력창 높이가 ≤ 6줄(`lineHeight * 6`)이고 `scrollHeight > clientHeight`다.
  - 입력창 computed `font-size` ≥ 16, 보내기 버튼 44×44 이상, 빈 입력에서 보내기 버튼 `disabled`, 글자를 넣으면 활성.
- [ ] **Step 2:** 실행해 실패를 확인한다.
- [ ] **Step 3: 구현한다.**
  - 시트는 `top = offsetTop`, `height = visualViewport.height`로 그린다.
  - 키보드가 열려 있으면 오른쪽 손잡이를 숨긴다(`hidden`).
  - 시트 `onPointerDown`에서 대상이 `form` 밖이고 포커스가 `textarea`이면 `blur()`한다.
  - `ChatbotTab`:
    - textarea: `text-[16px] lg:text-xs`, 최대 높이 6줄(`max-h-[9.6rem] lg:max-h-32`)
    - 보내기 버튼: `h-11 w-11 lg:h-7 lg:w-7`
    - `disabled={streaming || !query.trim()}`
- [ ] **Step 4:** 테스트, P2, vitest 통과.
- [ ] **Step 5: 커밋** `feat(R4): 모바일 챗봇 입력과 키보드 대응 — FR-QNA-006, NFR-USE`

### Task 3: 관계도 조작 확인(G14)

**Files:** Test `e2e/mobile-graph.spec.ts`. 실패가 나오면 `components/Ssabi/RelationshipGraph.tsx` 또는 `mobile/*`를 고친다.

- [ ] **Step 1: 테스트를 작성한다.**
  - 그래프 영역에서 두 포인터 합성 핀치(거리 2배)를 하면 배율 표시가 `100%`에서 커진다.
  - 한 포인터 끌기를 해도 페이지 진도 요청은 0건이다.
  - 전체화면 버튼을 누르면 오버레이가 화면 전체(viewport ±1px)이고, 그 중심점 `elementFromPoint`가 오버레이 안이다(손잡이가 위에 있지 않음). 다시 누르면 닫히고 시트가 보인다.
- [ ] **Step 2:** 실행한다. 통과하면 이미 갖춰진 동작이라 테스트만 남긴다. 실패하면 고친다.
- [ ] **Step 3: 커밋** `test(R4): 모바일 관계도 핀치·전체화면 확인 — FR-CHR-001`

### Task 4: 스크린샷과 기록

- [ ] `mobile-layout.spec.ts`의 상태 목록에 `ssabi-recap`, `ssabi-chat`, `ssabi-chat-keyboard`를 추가하고, 싸비 내부도 C4 대상에 넣는다(제외 해제).
- [ ] 전체 `npx vitest run`, `npx playwright test`를 실행한다.
- [ ] `docs/validation/2026-11-06-mobile-ssabi-stage.md`에 결과와 스크린샷 경로를 기록하고 커밋한다.
