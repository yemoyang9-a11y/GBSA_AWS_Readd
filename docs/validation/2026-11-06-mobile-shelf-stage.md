# 모바일 3단계(브리핑·서재·404·홈 화면 추가) 점검 기록 — 2026-11-06

계획: `docs/superpowers/plans/2026-11-06-mobile-briefing-shelf.md` · 스펙 2·3·4.5·5.2절

## 실행한 명령과 결과 (`frontend`에서, Task 4 커밋 직후 마지막 실행)

| 명령 | 결과 |
| --- | --- |
| `npx vitest run` | 424 passed (작업 전과 같음 — 추출 2건 모두 동작 불변) |
| `npx playwright test` | 188 passed (작업 전 107) |
| `npx tsc --noEmit -p .` | 오류 0 |
| `MAKE_ICONS=1 npx playwright test e2e/tools/make-icons.spec.ts --project=desktop` | 아이콘 2개 생성(180·512) |

알려진 불안정 테스트 `Reader.quotePageChange`는 Task 2 추출 직후 1회 실패했고 단독·전체 재실행에서 통과했다.

## 대응

| 기준 | 테스트 | 결과 |
| --- | --- | --- |
| 목차 리스트 장 번호 배지·점검 데이터 장 제목에서 "제N장" 제거 | `mobile-toc` | 통과 |
| 브리핑 모바일/PC 분기, C1·C2·C4(저장·폴백·첫 진입·목차 펼침) | `mobile-briefing` | 통과 |
| 인사 문구 3줄 이하, 표지 자리 저자 한 줄 | `mobile-briefing` | 통과 |
| 이어서 읽기: 진도 요청 없이 `/read`(첫 요청이 `entry`) | `mobile-briefing` | 통과 |
| 목차 장 선택: 진도 응답(1.2초 지연) **뒤에** 읽기 화면 | `mobile-briefing` | 통과 |
| 저장 리캡 없음 → 스트리밍 정확히 1건 / 첫 진입 → 0건 / 저장 리캡 있음 → 0건 | `mobile-briefing` | 통과 |
| 서재 모바일/PC 분기, C1·C2·C4(기본·데모 선택·읽는 중·정보 시트) | `mobile-dashboard` | 통과 |
| 진입 버튼 48px, `POST /entry` 후 서버 `route`대로 `/read`·`/briefing` | `mobile-dashboard` | 통과 |
| 데모 항목: 진입 버튼 비활성, 강제로 눌러도 `entries` 0 (실제 도서는 활성) | `mobile-dashboard` | 통과 |
| 정보 시트: `role=dialog aria-modal`, 닫기 44px, 바깥 누르기로 닫힘, 열린 동안 `body` 스크롤 잠금 | `mobile-dashboard` | 통과 |
| 필터 "읽는 중" → 진도 있는 책만, "전체" → 모두 | `mobile-dashboard` | 통과 |
| 브리핑·읽기·404에서 서재로 돌아오기(아래 Ruling 9) | `mobile-dashboard` | 통과 |
| 404·서재 실패·진입 실패·페이지 실패 C1·C2·C4, 404 "서재로", 서재 다시 시도 | `mobile-errors` | 통과 |
| C6 홈 화면 모드: 서재 머리글·브리핑 돌아가기가 노치 영역 밖 | `mobile-errors` | 통과 |
| manifest 200·`standalone`·이름 "싸비"·아이콘 200, iOS 메타·apple-touch-icon(PNG) | `home-screen` | 통과 |
| P2 PC 화면(읽기·싸비·**브리핑·서재** 기준선은 추출 전에 만듦) | `pc-regression` | 동일 |

스크린샷: `docs/validation/2026-11-06-mobile-shelf-screens/` (2기기 × 브리핑 4·서재 4·404·오류 3 = 24장)

## 바꾼 공유 파일

- `pages/Briefing.tsx` → `hooks/useBriefingSession.ts`, `pages/Dashboard.tsx` → `hooks/useDashboard.ts`: 동작 불변 추출. 주석도 함께 옮겼다.
- `pages/BriefingView.tsx`: `MOCK_DAYS_SINCE_LABEL`·`GREETING_LINES`에 `export`만 추가.
- `components/Layout/Header.tsx`: `ReaddMark`에 `export`만 추가.
- `App.tsx`: `/`·브리핑·`*` 라우트를 `isMobile`로 분기.
- `index.html`: manifest·theme-color·apple 메타·apple-touch-icon.
- `mobile/pages/MobileReader.tsx`(1단계 파일): 오류 화면을 `MobileErrorState`(44px 재시도)로 교체, 뒤로 가기에서 `viewTransition` 제거(Ruling 8·9).
- `e2e/support/mockApi.ts`: `briefingRecap`·`progressDelayMs`·`entryRoute`·`failCatalog`·`failEntry` 옵션, `recapStreams`·`events` 기록, `entry`가 마지막 진도를 돌려줌(Ruling 10).

## Rulings

1. **브리핑 폴백 1회 호출 보호를 모바일 뷰에 그대로 복제했다** — PC `BriefingView`의 `requested` ref 패턴을 `MobileBriefingView`에 같은 모양으로 둔다. 훅으로 옮기면 PC 뷰 구조가 바뀌기 때문이다. — 틀리면: 두 곳이 어긋날 수 있다. E2E가 1건·0건으로 지키고 있다.
2. **고정 문구·워드마크는 PC 파일에서 export해 가져온다** — `MOCK_DAYS_SINCE_LABEL`(TODO(mock))이 한 곳에 남아야 실제 값으로 바꿀 때 둘 다 바뀐다. — 틀리면: 모바일 파일이 PC 페이지 파일을 import하는 의존이 생긴다. 옮기는 비용은 작다.
3. **모바일 브리핑 목차는 펼칠 때만 그린다** — PC의 grid 애니메이션과 `tabIndex` 처리 대신 조건부 렌더로 바꿨다. 접힌 동안 보이지 않는 버튼이 C4나 포커스에 걸리지 않게 하려는 것이다. 항목은 48px, 장 번호 배지와 제목만 두고 시작 쪽 번호는 뺐다. — 틀리면: 펼침 애니메이션이 없다. 스크린샷 피드백으로 되돌릴 수 있다.
4. **모바일 서재에서 "도서 검색"을 뺐다** — PC에서도 `disabled` 장식이다(엔드포인트 없음, `Header.tsx` 주석, 스펙 §7 #3). 34px라 C4에도 걸린다. — 틀리면: 검색이 생기면 모바일에 따로 넣어야 한다.
5. **표지 자리 글자 여백은 모바일에서만 줄인다** — 공용 `TypographicCover`의 row 크기는 `px-6`이라 84px 폭에서 "채만/식"으로 줄이 바뀐다(PC 서재 행에서도 같은 현상이다. 기준선 `pc-dashboard.png`). 모바일 파일에서 감싸는 요소에 `[&>div]:px-2`를 줬고, 공용 파일은 바꾸지 않았다. 실제 「탁류」는 표지 이미지가 있어 이 자리가 보이지 않는다. — 틀리면: PC 행의 같은 문제는 남는다(보고만 하고 고치지 않음).
6. **서재 행 미리보기 버튼에 `aria-pressed`를 달았다** — 선택된 책을 테두리 색으로만 구분하면 스크린리더가 알 수 없다. 필터 칩 44px, 정보 버튼 44px. — 틀리면: 없음(접근성 속성 추가).
7. **책 정보 시트의 스크롤 잠금은 `body.style.overflow = 'hidden'`으로 하고, 키보드 처리는 `useModalLayer`를 재사용한다** — 소개 정적 데이터(`BOOK_INFO_CONTENT`)가 없는 책은 PC처럼 아무것도 띄우지 않는다. — 틀리면: 오래된 iOS(15 이하)는 `overflow: hidden`만으로 배경 스크롤이 완전히 막히지 않을 수 있다(실기기 미확인).
8. **모바일 오류 화면은 `MobileErrorState` 하나로 쓴다** — 공용 `Button`은 높이 약 39px라 C4에 걸리고 `className`을 받지 않는다. 1단계 `MobileReader`의 진입·페이지 실패 화면도 이것으로 바꿨다(문구·재시도 동작 동일). — 틀리면: 없음.
9. **모바일에서 서재(`/`)로 가는 이동은 뷰 전환 없이 한다** — 뷰 전환 도중 긴 모바일 서재가 그려지면 Playwright WebKit 렌더러가 죽는다(재현·원인 분리는 `lessons.md` 2026-11-06). 브리핑 "돌아가기"는 모바일 화면에서 `navigate('/')`를 직접 넘기고, PC는 훅의 `goBack`(전환 있음)을 그대로 쓴다. 서재 → 브리핑·읽기, 브리핑 → 읽기 전환은 유지했다(부하 반복 40회 통과). — 틀리면: 서재로 돌아올 때 페이드 효과가 없다. 실제 iOS에서 같은 충돌이 나는지는 모른다.
10. **점검용 `entry` 응답은 고정 `startPage` 대신 마지막으로 받은 진도를 돌려준다** — 실제 서버처럼 동작해야 "목차 장 선택 → 진도 저장 → 읽기 화면이 21쪽에서 열림"을 확인할 수 있다. 초기값은 `startPage`라 기존 테스트에는 영향이 없다(테스트마다 진입 1회). — 틀리면: 진도 후 재진입하는 테스트가 새로 생기면 위치가 바뀐다. 그게 실제 동작이다.
11. **아이콘은 `brief.paper`(#fdfdfa) 바탕 가운데에 아모 얼굴을 높이 68%로 놓았다** — manifest에 `orientation: portrait`, `scope`, `lang`, `<meta name="theme-color">`를 더했다(결정 1 세로 전용). — 틀리면: 아이콘 비율이나 색은 스크립트 값만 바꿔 다시 만들면 된다.
12. **목차 리스트(읽기 화면)는 320px에서 제목이 단어 중간에서 2줄로 바뀐다** — 폭 상한 45vw(결정 9)와 장 번호 배지 때문이다. 배지를 넣기 전에도 "제1장 인간기 / 념물"로 같았다. 375px 이상에서는 한 줄이다. — 틀리면: SE 1세대 크기에서 읽기가 조금 불편하다.

## 실기기 미확인

- 홈 화면 아이콘으로 열었을 때 주소창 없는 전체 화면 표시, 실제 노치·홈 막대와 서재 머리글·브리핑 돌아가기의 위치(C6는 CSS 변수 흉내로만 확인)
- 로컬 http 주소로 홈 화면에 추가했을 때 standalone 동작(스펙 5.4-5)
- 책 정보 시트가 열린 동안 실제 iOS에서 배경 스크롤이 막히는지, 시트 안 스크롤의 튕김
- Ruling 9의 뷰 전환 충돌이 실제 iOS Safari에도 있는지(Playwright WebKit Windows 빌드에서만 확인)
- 브리핑 목차에서 장을 고른 뒤 진도 응답을 기다리는 동안 표시가 없다(PC와 같음). 느린 망에서 여러 번 누르면 진도 요청이 여러 번 갈 수 있다
