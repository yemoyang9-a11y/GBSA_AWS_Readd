# 모바일 2단계(싸비 내부) 점검 기록 — 2026-11-06

계획: `docs/superpowers/plans/2026-11-06-mobile-ssabi.md` · 스펙 4.4, 5.2(G12~G14)

## 실행한 명령과 결과 (`frontend`에서)

| 명령 | 결과 |
| --- | --- |
| `npx vitest run` | 424 passed (origin/main 병합 후) |
| `npx playwright test` | 107 passed (리뷰 반영 후) |
| `npx tsc --noEmit` | 오류 0 |

## 대응

| 기준 | 테스트 | 결과 |
| --- | --- | --- |
| 싸비 3탭 44px·글자 넘침 | `mobile-ssabi-layout` | 통과 |
| 제목 한 줄·배지와 겹침 없음(320px 포함) | `mobile-ssabi-layout` | 통과 |
| 싸비 열었다 닫으면 목차 리스트 안 펼침 | `mobile-ssabi-layout` | 통과 |
| G12 키보드 위 입력창·탭 유지·손잡이 숨김·바깥 누르면 키보드 내림 | `mobile-chat` (visualViewport 흉내) | 통과 |
| G13 입력창 6줄까지 늘어난 뒤 내부 스크롤 | `mobile-chat` | 통과 |
| 입력 16px·보내기 44px·빈 입력 비활성 | `mobile-chat` | 통과 |
| G14 핀치 확대·한 손가락 끌기 진도 0건·전체화면 | `mobile-graph` | 통과 (원래 있던 기능) |
| 싸비 상태 화면 점검(C1·C2·C4) | `mobile-layout` ssabi-recap / ssabi-chat / ssabi-chat-keyboard | 통과 |
| P2 PC 화면 | `pc-regression` | 동일 |

스크린샷: `docs/validation/2026-11-06-mobile-ssabi-screens/`

## 바꾼 공유 컴포넌트

- `tailwind.config.js`: `mobile:` 변형 추가 — `[data-mobile]` 조상 안에서만 적용된다. 모바일 싸비 시트가 `data-mobile="true"`를 단다. 그래서 PC·태블릿(PC 화면) 크기는 전혀 바뀌지 않는다(태블릿 820×1180 회귀 테스트로 확인).
- `SsabiPanel`: 선택 prop 3개 — `compactHeader`(키보드가 열리면 제목 줄 접기), `reserveToggleSpace`(모바일은 PC 여닫기 버튼 자리 비우지 않음), `requireTextToSend`(모바일은 빈 입력에서 보내기 비활성). 기본값은 모두 PC 동작과 같다.
- 싸비 탭·리캡 새로고침·관계도 선택 해제·시점 슬라이더·검색창·챗봇 버튼·입력창: `mobile:` 변형으로만 44px·16px.

## 최종 리뷰 반영 (Opus 리뷰)

- 화면 확대를 키보드로 오판 → `visualViewport.scale` 반영
- 태블릿 PC 화면 변경 → `lg:` 대신 `mobile:` 변형
- PC 보내기 버튼 비활성 변화 → 모바일에서만(`requireTextToSend`)
- 키보드가 열려도 홈 막대 여백 → 키보드 열림 시 0
- 포커스된 검색창을 다시 누르면 키보드 내림 → 입력칸 터치는 제외
- 미룬 것(Minor): 대화 영역을 스크롤하려고 손만 대도 키보드가 내려감, 전체화면 오버레이와 손잡이가 같은 z-50(DOM 순서 의존 — G14 테스트가 지킴), 키보드 흉내가 offsetTop 변화를 다루지 않음, 120px 미만 키보드(하드웨어 키보드 막대)

## 실기기 미확인

- 실제 iOS 키보드가 올라올 때 `visualViewport` 크기 변화와 시트 맞춤, 키보드 위 입력창 위치
- 실제 손가락 핀치의 감도
