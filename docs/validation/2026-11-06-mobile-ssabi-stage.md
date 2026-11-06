# 모바일 2단계(싸비 내부) 점검 기록 — 2026-11-06

계획: `docs/superpowers/plans/2026-11-06-mobile-ssabi.md` · 스펙 4.4, 5.2(G12~G14)

## 실행한 명령과 결과 (`frontend`에서)

| 명령 | 결과 |
| --- | --- |
| `npx vitest run` | 416 passed |
| `npx playwright test` | 99 passed + 1 flaky(G4 빠른 튕김, 재시도 통과 — 1단계에서 허용한 타이머 해상도 문제) |
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

- `SsabiPanel`: 선택 prop 2개 추가 — `compactHeader`(기본 false, 키보드가 열리면 모바일이 제목 줄을 접음), `reserveToggleSpace`(기본 true, 모바일은 PC 여닫기 버튼 자리를 비우지 않음).
- 싸비 탭·리캡 새로고침·관계도 선택 해제·시점 슬라이더·검색창·챗봇 버튼: 1024px 미만에서 44px(`lg:`로 PC 크기 유지). 검색창·입력창 글자 16px(1024px 미만).
- 챗봇 보내기 버튼: 빈 입력이면 비활성(PC 포함).

## 실기기 미확인

- 실제 iOS 키보드가 올라올 때 `visualViewport` 크기 변화와 시트 맞춤, 키보드 위 입력창 위치
- 실제 손가락 핀치의 감도
