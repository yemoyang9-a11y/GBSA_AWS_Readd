# 모바일 1단계(기반 + 읽기 화면) 점검 기록 — 2026-11-06

스펙: `docs/superpowers/specs/2026-11-06-mobile-webapp-design.md` · 계획: `docs/superpowers/plans/2026-11-06-mobile-reader.md`

## 실행한 명령과 결과

| 명령 (`frontend`에서) | 결과 |
| --- | --- |
| `npx vitest run` | Test Files 64 passed, Tests 416 passed (기준선 404 + 신규 12) |
| `npx playwright test` | 60 passed, 33 skipped (skip은 프로젝트별 대상 아님 — 모바일 전용 테스트의 desktop 실행 등) |
| `npx tsc --noEmit` | 오류 0 |

Playwright: 1.65.0, WebKit, 기기 설정 `iPhone SE`(375×667), `iPhone 15 Pro Max`(430×739), `Desktop Safari`(1440×1000). API는 `http://api.e2e.test`로 보내고 전부 가로챈다(운영 서버·DB 미사용).

## 완성 기준 대응 (이번 단계 범위)

| 기준 | 테스트 | 결과 |
| --- | --- | --- |
| C1 가로 스크롤 없음 | `mobile-layout` 4개 상태 × 2기기, `mobile-toc` C1, `mobile-reader` G16 | 통과 |
| C2 글자 넘침·잘림 | `mobile-layout` | 통과 (화면 읽기용 1px 숨김 라벨은 제외) |
| C3 손잡이·본문 겹침 | `mobile-handles` C3 | 통과 |
| C4 44px 누르는 영역 | `mobile-layout`, `mobile-handles` C4 | 통과 (싸비 내부는 2단계 범위라 제외) |
| C5 한글 글꼴 | `mobile-layout` C5 | 통과. `Noto Serif KR` 로드, '가나다' 폭 52.2px. 단 Windows의 WebKit이라 실제 iOS 글꼴 렌더링은 아님 |
| C6 안전 영역 | `mobile-layout` C6 (위 47px, 아래 34px 흉내) | 통과 |
| C7 스크린샷 | `docs/validation/2026-11-06-mobile-reader-screens/` 8장 | 저장 |
| G1~G6 스와이프 | `mobile-swipe` | 통과 (3회 연속) |
| G7·G8 선택·인용 | `mobile-quote` | 통과 |
| G9 싸비 100% 여닫기 | `mobile-handles` | 통과 |
| G10·G11 목차 리스트 | `mobile-toc` | 통과 |
| G15·G16 모바일 판정·가로 | `mobile-reader`, `src/mobile/device.test.ts`, `src/App.mobile.test.tsx` | 통과 |
| P1 기존 테스트 | vitest 전체 | 416/416 |
| P2 PC 화면 | `pc-regression` 2장 | 기준선과 동일 |

이번 단계에서 하지 않은 것: G12~G14(챗봇 키보드·입력창·관계도 핀치)와 싸비 내부 44px — 2단계(싸비) 범위.

## 알려진 문제·관찰

- `src/pages/Reader.quotePageChange.test.tsx`는 전체 실행 부하에서 간헐 실패한다. 작업 전 기준 코드에서도 5회 중 1회 재현됐다(이번 변경과 무관).
- 기존 ESLint 문제 3건(`useSSE.position.test.ts` error 1, warning 2)은 작업 전부터 있던 것이다.
- 싸비를 화면 전체로 열면 머리글 "아모의 가이드북"이 단어 중간에서 줄바꿈된다(2단계에서 다룸).

## 실기기 미확인 (스펙 5.4)

1. 홈 화면 아이콘 실행 시 전체 화면·실제 노치/홈 막대 겹침
2. Safari 왼쪽 끝 뒤로 가기와 왼쪽 손잡이·스와이프 충돌
3. 꾹 누름 iOS 메뉴와 "챗봇에 물어보기" 버튼의 실제 위치 관계
4. 스와이프 손맛과 실제 관성 스크롤
