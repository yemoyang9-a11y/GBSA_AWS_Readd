# Grounded Reading Implementation Plan
> For agentic workers: use superpowers:subagent-driven-development or executing-plans.
**Goal:** 원문 기반 인물 검증과 유연한 범위 제한 대화.
**Architecture:** 배치 단계에서 원문 근거를 검증하고 런타임은 기존 cutoff 경계를 유지한다. 검색·생성·화면 무효화를 각각 고친다.
**Tech Stack:** TypeScript, Node, PostgreSQL, React, Jest, Vitest. 기존 LLM 게이트웨이에서 OpenAI Responses API (`gpt-6-luna`, `low`)를 기본으로 사용하고 Cohere 검색 임베딩을 유지한다.
**Spec:** docs/superpowers/specs/2026-10-21-grounded-reading.md

## Global Constraints
- yemo-develop, remote base bf0272b2ef4771fc941f78056bb0b04afc94cd6c.
- 2026-10-22 후속 승인: OpenAI 키 발급·교체와 실제 모델 테스트에 이어 PR 작성·CI/CD 검사·병합·운영 테스트까지 진행한다. 운영 반영 완료는 실제 배포·응답 확인 후 판단한다.
- 운영 DB 교정은 승인된 전봇대 노트 source_page 및 관계 established_page 2행의 303→304 변경으로 제한한다. 원문·인물 첫 등장과 별도 외모 문구 별칭은 변경하지 않고, 전체 도서 재생성은 수행하지 않는다.
- 기존 별칭 날짜를 동일인 확립 근거로 무조건 승격하지 않는다.
- 개별 작업자는 지정 파일만 수정하고 다른 작업자 변경을 되돌리지 않는다.
- provider 교체는 승인된 OpenAI 경로에 한정하고, 검증에 필요한 범위의 실제 API 호출만 수행한다. 검토 모델과 자동 답변 재생성은 도입하지 않는다.
- 전체 suite baseline과 수정 후 suite/typecheck를 실행한다.

## Review Focus
- 사물 이름인 별명 누락과 공유 호칭의 잘못된 병합.
- 원문에 없는 근거 인용 및 실제 등장보다 이른 공개 시점.
- 임베딩 장애 회복 중 DB 오류를 근거 없음으로 숨기기.
- 페이지 이동 및 새 대화 이후 늦게 도착하는 SSE/조회 응답.
- 과거 큰 cutoff의 인용/요약/대화가 현재 컨텍스트로 유입.

## Task 1: 배치 인물 검증
Files: backend/src/batch/pipeline/* 및 해당 tests.
Consumes: 원본 split 페이지 및 기존 생성 타입.
Produces: 원문 근거 검증·검수 보류 산출물, 모호성 없는 인물 통합, 캐시 유효성 검사.
- [ ] 역방향 별명 매칭, 공유 호칭, 사물/별명, 인용·페이지 오태깅 재현 테스트를 먼저 실패시킨다.
- [ ] 원문 인용·위치·판정 이유를 추출에 요구하고 실제 페이지와 대조한다. 미확인 항목은 별도 검수 목록으로 남긴다.
- [ ] 자동 통합은 검증된 유일 대응만 허용하고 대표명·별명 공개 시점을 보존한다.
- [ ] 구버전 캐시가 검증을 우회하지 않게 하고 반복 실행의 ID/교정 재현성을 검사한다.
- [ ] targeted Jest와 backend typecheck; 실제 원문 대조 결과와 한계를 보고한다.

## Task 2: 챗봇 근거와 응답
Files: backend/src/modules/chatbot/* 및 해당 tests. 다른 모듈 타입 변경이 필요하면 root와 조율.
Consumes: getCutoffSnapshot, 기존 게이트웨이, page/chunk repository.
Produces: 상한 적용 텍스트 검색 회복, 근거 기반 부분 답변 정책, 인용/이력 경계 검증.
- [ ] `gpt-6-luna` (`low`)의 정상 답변 생성 1회와 완료 전 첫 청크 전달을 검증한다. 별도 검토·자동 재생성은 사용하지 않는다.
- [ ] 고정 거절·완독 부재 단정·별칭 정규식·검색 장애·위조 quote·이력 race 재현 테스트.
- [ ] 원본 질문과 안전한 정규화 검색을 유지하고 K 이하 lexical 검색을 병행한다. DB 오류는 throw.
- [ ] 부분 답변/불확실성/감상 정책으로 생성 지시를 바꾸고 미검증 quote를 확정 근거로 승격하지 않는다.
- [ ] 표시용 이력 조회도 cutoff 조건을 SQL에 적용한다.
- [ ] targeted Jest와 backend typecheck. 실제 생성 성공과 mock 기반 정책 검증을 구분한다.

## Task 3: 프런트 스포일러 경계
Files: frontend/src/hooks/useChatConversation*, frontend/src/pages/Reader*, 관련 components/tests.
Consumes: 서버 currentPage/cutoff 응답 및 기존 SSE API.
Produces: 페이지 이동 시 이전 데이터 즉시 미노출, 요청 세대별 상태 반영.
- [ ] K90→K40 이동, 새 채팅·이력 선택 후 늦은 delta/조회·리캡 응답 재현 테스트.
- [ ] 진도 이동 시 대화/이력/리캡·선택 인용을 무효화하고 이전 요청의 상태 반영을 막는다.
- [ ] 인물 관계도 요청의 늦은 응답도 같은 위험이 있는지 확인하고 필요하면 수정한다.
- [ ] targeted Vitest, frontend typecheck/build.

## Task 4: 통합 검증·기록
Files: backend/src/modules/ssabi/pg-repository.ts, tests/unit/ssabi/*, CLAUDE.md, README.md, docs/reports/*, lessons.md.
- [ ] 관계 양 끝 인물의 book/cutoff 조건을 테스트하고 SQL에 추가한다.
- [ ] 기존 규칙을 사용자 요구와 정합하게 갱신하되 상한 테스트를 약화시키지 않는다.
- [ ] 전체 suite·typecheck/build와 독립 코드 리뷰를 실행한다.
- [ ] 원문 출처·전봇대 근거 위치·개선 전후·재처리 절차·미실행 검증을 보고한다.

## Task 5: 2026-10-22 후속 배포 승인
- [ ] 최종 변경 범위와 비밀값 제외를 확인하고 PR을 작성한다.
- [ ] 프론트·백엔드 CI를 확인하고 승인된 변경을 병합한다.
- [ ] Fly 런타임 OpenAI 설정·키와 프론트 배포 대상을 확인한다.
- [ ] 실제 배포 revision과 운영 health/SSE 응답을 확인한다.
- [ ] 운영 챗봇의 303/304페이지 경계, 부분 근거 답변, 직접 스트리밍과 생성 호출 수를 검증하고 결과·비용·남은 한계를 기록한다.

