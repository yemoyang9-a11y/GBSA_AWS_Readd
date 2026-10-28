# 관계 의미 독립 평가

이 디렉터리는 제품 구현을 맡지 않은 평가 담당자가 작성한다. `oracle.json`의 기대 결과는 구현자의 결과를 복사하지 않고 원문을 읽어 먼저 정했다. 제품 코드·DB는 이 평가 도구에서 수정하지 않는다.

## 자료 범위

- 실제 작품: 저장소의 채만식 「탁류」와 GITenberg에서 받은 Jane Austen의 「Pride and Prejudice」 2개 작품의 짧은 발췌. 원문 위치와 인용을 기록했다. Austen 출처 URL·SHA256·행 범위는 `austen-holdout-source.json`에 보존했다.
- 창작 평가문: 「유리 항구」「안개 실험실」「역 앞의 우산」은 평가자가 이 작업을 위해 만든 짧은 문장 모음이다. 이 창작 자료는 출판 작품이나 실제 다작품 검증 실적으로 세지 않는다.
- `holdout: true`는 구현 테스트와 다른 표현·이름의 별도 평가 사례를 뜻한다. 모든 작품/문체에서의 정확성을 입증하지 않는다.
- 후보 검증기를 대상으로 한 주입 검사는 LLM의 실제 추출 정확도나 누락률을 검증하지 않는다. 모델을 실제 실행한 결과가 없으면 해당 검사는 미검증으로 남긴다.

## 원문에서 먼저 고정한 사실

1. 「탁류」 2556–2568행: 김씨가 태수를 두고 초봉이를 질투한다. `초봉이 → 김씨`는 반대 방향이다.
2. 3604–3617행: 장형보가 초봉이를 탐낸다. 초봉이의 상호 감정, 연인 관계, 이미 실행된 가해로 확장할 근거는 없다.
3. 4647–4653행: 행화는 초봉이를 질투하지 않는다. 비교 대상인 김씨의 감정을 행화에게 옮기면 실패다.
4. 2980–2985행의 중매는 질투의 소멸이 아니다. 4651–4652행은 질투와 결혼 주선의 공존을 재확인한다. 후반 근거를 앞선 기준점의 설명에 넣으면 안 된다.

기존 scope R057(p91), R072(p106), R078(p129)의 인물 ID는 각각 정렬된 저장 endpoint이며 감정의 주체/대상을 뜻하지 않는다. `supported`라는 과거 감사 판정만으로 새 방향 정보를 정답 처리하지 않는다.

## 판정 기준

| 평가 영역 | 통과 조건 | 실패 예 |
| --- | --- | --- |
| 의미 구체성 | 감정 주체와 대상, 무엇을 느끼는지 설명 가능 | `욕망`, `경쟁 관계`만 표시 |
| 방향 | 저장 순서가 바뀌어도 원문 감정 방향 유지 | 김씨 대신 초봉이가 질투한다고 표시 |
| 근거 | 페이지와 정확한 인용을 확인할 수 있음 | 이름 둘이 존재한다는 이유만으로 승인 |
| 별칭 | 관계 시점에 확인된 별칭만 이용 | 나중에 알려진 본명을 앞서 표시 |
| 복수 관계 | 다른 의미의 관계가 공존할 수 있음 | 중매가 질투를 덮어씀 |
| 시간 변화 | 실제 변경 근거가 있는 의미만 갱신 | 과거 감정과 현재 감정을 무조건 병합 |
| 상태 구분 | 부정·소문·오해·계획·모호한 대명사는 확정 사실로 승격하지 않음 | 부정문에서 감정 단어만 추출 |
| 보류와 누락 | 보류 수·이유와 기대 사실 누락을 별도 기록 | 전량 보류/빈 결과를 정확도 100%로 보고 |
| R4 cutoff | DB 선택에서 관계·인물·별칭·근거 모두 같은 상한을 적용 | 전체 조회 뒤 프론트에서 숨김 |
| R9 | 관계 조회에 LLM 호출 0회 | 화면 열 때 라벨 다시 생성 |
| R12 | 검수되지 않은 의미를 사실로 공개하지 않음 | 모델의 자기 확신만으로 공개 |
| UI | 모바일·데스크톱에서 주체→대상·설명·출처를 실제 확인 | 타입/단위 테스트만으로 UI 완료 주장 |

각 cutoff 검사는 직전 페이지 negative와 확립 페이지 positive를 함께 실행한다. 0건 노출만 확인하면 빈 응답 구현도 통과하므로 충분하지 않다. 되감기 시 과거 라벨이 복원되는지, 새 근거의 인용·본명이 같이 사라지는지도 확인한다.

## 결과 상태

- **구현됨**: 코드/스키마/경로 존재를 확인했다. 실제 실행의 성공과 구분한다.
- **실제 검증됨**: 실행 명령, 입력 자료, 관찰 결과를 남겼다.
- **구현 안 됨**: 요구 행동이나 보호가 존재하지 않는다.
- **환경 이슈로 검사가 제한됨**: 실행 의존성·DB·모델 접근 등이 없어 결과를 관찰하지 못했다. 승인/키 발급을 평가자가 대신 진행하지 않는다.

최종 보고는 이 네 상태와 함께 원문 범위, 모의 후보 여부, 실제 DB/UI 연결 여부를 명시한다.

## 재실행

저장소 루트에서:

```bash
node evaluation/relationships/audit-source.cjs
node evaluation/relationships/probe-validator.cjs
NODE_PATH=/tmp/ssabi-relation-tools/node_modules node evaluation/relationships/check-review-boundary.cjs
NODE_PATH=/tmp/ssabi-relation-tools/node_modules node evaluation/relationships/check-snapshot-replacement.cjs
```

`probe-validator.cjs`는 의미 반례를 검출하면 종료 코드 1을 반환한다. 현재 11개 잘못된 후보가 구조 검증을 통과하는 잔여 한계를 보여준다. 이를 모델 정확도 점수로 사용하지 않는다. SQL 명령은 별도 검증용 `@electric-sql/pglite` 설치 경로를 `NODE_PATH`로 받으며 원격 DB 환경변수를 사용하지 않는다.

UI harness는 frontend 디렉터리에서 `node node_modules/vite/bin/vite.js ../evaluation/relationships/ui-harness --config ../evaluation/relationships/ui-harness/vite.config.mjs --host 127.0.0.1 --port 5186 --strictPort`로 시작한다. 이후 루트에서 `node evaluation/relationships/check-ui.cjs`, `node evaluation/relationships/check-source-flow-ui.cjs`, `node evaluation/relationships/check-control-overlap.cjs`를 실행한다. source-flow 검사는 `/workspace/relationship-validation/source-flow/*.graph.json`의 실제 로컬 SQL 출력 파일을 읽는다. 이 출력의 증거 사본은 `results/source-flow/`에도 보존했다.

최종 판정과 정확한 검증 범위는 [final-evaluation.md](final-evaluation.md)에 있다.
