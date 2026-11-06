# lessons

## 2026-11-06 — Playwright WebKit이 뷰 전환 중 긴 모바일 서재를 그리면 페이지가 죽는다

- **증상:** 모바일 404 "서재로", 브리핑 "돌아가기", 읽기 "뒤로 가기"로 `/`에 돌아오면 E2E가 간헐(병렬 부하 시 거의 매번) 실패. 화면은 "서재를 여는 중"에서 멈추고 호출 로그는 `Page crashed` 또는 `Target page, context or browser has been closed`. `/books` 응답은 200으로 두 번 도착해 있었다.
- **원인:** `navigate('/', { viewTransition: true })`로 시작한 뷰 전환이 끝나기 전에 서재 목록이 들어와 문서가 화면보다 길어지면 Playwright WebKit(Windows) 렌더러가 죽는다. CSS를 하나씩 끄며 확인했다 — `startViewTransition` 제거, `/books` 응답 1.5초 지연, 목록 1행만 표시, 루트를 `h-[100dvh] overflow-y-auto`로 바꾼 경우는 모두 통과했고, 목록을 숨기고 2000px 여백을 넣은 경우는 여전히 죽었다. PC 서재(1440×1000)는 같은 흐름에서 죽지 않았다. 실제 iOS Safari에서도 생기는지는 확인하지 못했다.
- **검증된 해결:** 모바일 화면에서 서재(`/`)로 가는 이동은 `viewTransition` 없이 `navigate('/')`로 한다(`MobileReader`, `MobileBriefing`, `MobileNotFound`). 회귀 테스트 `mobile-dashboard.spec.ts`의 "…로 서재에 돌아오면 서재가 그려진다" 3종이 수정 전 18회 중 10회 실패, 수정 후 30회 중 30회 통과.
- **참고:** 뷰 전환 관련 E2E 실패가 "요소 없음"으로만 보이면 error-context의 호출 로그에서 `Page crashed`를 먼저 확인한다.
