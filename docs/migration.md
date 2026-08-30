# migration.md — AWS 이탈 이전 기록

> 이전 전 인프라는 [`architecture-aws.md`](architecture-aws.md), 이전 후 인프라는
> [`architecture-current.md`](architecture-current.md)에 있다. 이 문서는 **그 사이에서
> 무엇을 왜 그렇게 정했는가**를 다룬다.
>
> 각 Phase를 끝낼 때마다 한 항목씩 누적한다. 끝나고 몰아서 쓰지 않는다 — SSE 버퍼링이나
> 임베딩 차원 같은 문제는 해결하는 순간엔 생생하지만 일주일 뒤엔 남지 않는다.

---

## 배경

2026년 8월 해커톤(7팀 중 대상) 산출물을 포트폴리오로 계속 유지하기 위한 이전이다.
기능 변경이 목적이 아니다 — **같은 동작을, 상시 과금 없이, 언제든 접근 가능한 상태로**
옮기는 것이 목표다.

AWS 구성은 EC2 2대, Multi-AZ RDS, ALB, Elastic IP 2개가 전부 상시 가동이었다. 방문이
없는 시간에도 이 전부가 시간당으로 청구된다. 발표가 끝난 뒤 이 구조를 유지할 이유가
사라졌다.

## 제약 조건

이전 대상 선정은 아래 네 가지를 동시에 만족해야 했다.

| # | 제약 | 근거 |
| --- | --- | --- |
| 1 | **상시 접근 가능** | 채용 담당자가 언제 열어볼지 알 수 없다. "깨워야 보이는" 상태는 안 된다 |
| 2 | **유휴 시 과금 없음** | 대부분의 시간에 방문자가 0이다. 그 시간을 돈 내고 유지할 이유가 없다 |
| 3 | **SSE 스트리밍 지원** | 리캡·챗봇이 전부 토큰 스트리밍이다. 프록시가 버퍼링하면 제품이 죽는다 |
| 4 | **pgvector** | 스포일러 차단이 벡터 검색 + `<= K` 쿼리에 걸려 있다 |

1과 2는 정면으로 충돌한다. 이 충돌을 푸는 것이 이번 이전의 핵심 판단이다.

## 목표 구성

| 계층 | 이전 | 이후 |
| --- | --- | --- |
| 정적 프론트 | S3 + CloudFront | Cloudflare Pages |
| 백엔드 | EC2 ×2 + ALB + nginx + PM2 | Fly.io 컨테이너 1개 (스케일-투-제로) |
| DB | RDS PostgreSQL Multi-AZ | Supabase PostgreSQL |
| LLM | Amazon Bedrock (Claude Haiku 4.5) | Anthropic API (Claude Haiku 4.5) |
| 임베딩 | Bedrock Titan Embed v2 (1024) | Cohere embed-v4 (1024) |

리전은 백엔드·DB 모두 도쿄로 맞춘다. 어긋나면 요청마다 DB 왕복 지연이 붙는다.

---

## Phase 0 — AWS 백업 (2026-08-29)

### 무엇을 했나

AWS 계정을 닫으면 영구 소실되는 것들을 먼저 확보했다. 되돌릴 수 없는 작업이라 다른
어떤 것보다 먼저 했다.

| 대상 | 결과 |
| --- | --- |
| `/opt/ssabi/.env` | 키 이름 17개 확인. **값은 어떤 파일에도 기록하지 않았다** |
| `SESSION_TIMEOUT_MS` | **설정돼 있지 않음** (`.env`에 키 자체가 없다) |
| 임베딩 적재 상태 | 「탁류」 411페이지 **전량 적재, 누락 0건** |
| RDS 전체 덤프 | `backup/ssabi.dump` (2.8 MB, custom 포맷). TOC 115개 항목, 20개 테이블, `vector` 확장 포함 검증 완료 |
| Route53 | **호스팅 존·등록 도메인 모두 없음** — 잃을 도메인 자산 없음 |
| S3 에셋 | 두 버킷 14개 객체 전부 저장소에 원본 존재. 고유 자산 없음 |

`.env`의 실제 키 이름(값 아님):
`NODE_ENV` `MOCK_MODE` `PORT` `DB_HOST` `DB_PORT` `DB_NAME` `DB_USER` `DB_PASSWORD`
`AWS_REGION` `BEDROCK_CLAUDE_SONNET` `BEDROCK_CLAUDE_HAIKU` `BEDROCK_EMBED_MODEL`
`DEVICE_ID_HEADER` `CORS_ORIGIN` `LOG_LEVEL` `BEDROCK_FALLBACK_MODEL`
`ENABLE_MODEL_FALLBACK`

### 막힌 것과 해결

**pg_dump 버전 불일치.** EC2에는 PostgreSQL 15 클라이언트가 깔려 있는데 RDS는 16.15다.

```
pg_dump: error: aborting because of server version mismatch
pg_dump: detail: server version: 16.15; pg_dump version: 15.18
```

`dnf install postgresql16`은 postgresql15와 man 페이지 파일이 충돌해 실패하고,
`--allowerasing`으로도 같은 충돌이 났다. `dnf swap postgresql15 postgresql16`으로
교체해 해결했다. pg_dump 16.14로 덤프 성공.

**덤프 반출 경로.** 로컬에 SSM Session Manager 플러그인이 없어 포트 포워딩으로 직접
당길 수 없었다. EC2 → S3 → 로컬 경로로 우회하고, 반출 후 S3와 EC2의 임시 사본을
모두 지웠다.

**덤프 검증 시 또 버전 문제.** 로컬 검증용 컨테이너가 pg15라
`unsupported version (1.15) in file header`가 났다. pg16 이미지로 `pg_restore --list`를
돌려 TOC를 확인했다. **덤프 자체는 정상이고, 읽는 쪽 버전 문제였다.** 이전 대상
Supabase에서 복원할 때도 pg16 이상 클라이언트가 필요하다.

### 예상과 달랐던 것

**Cost Explorer를 조회할 수 없다.** 이 계정은 AWS Organizations 멤버 계정이고, 상위
조직의 SCP가 `ce:GetCostAndUsage`를 명시적으로 거부한다.

```
AccessDeniedException: ... explicit deny in a service control policy
```

실비용 내역이 포트폴리오에서 "왜 옮겼나"의 가장 강한 근거였는데, 숫자를 확보할 수
없었다. **추정치를 실측치처럼 적지 않기로 하고**, 대신 과금 대상 리소스 목록을
`architecture-aws.md` 7장에 남겼다. 결제 콘솔에서 사람이 확인 가능하면 그때 채운다.

**`SESSION_TIMEOUT_MS`가 프로덕션에 아예 없었다.** 로컬 `.env`에는 검증용으로 `0`이
들어 있어 배포 환경에도 데모용 값이 있으리라 예상했는데, 실제로는 키 자체가 없었다.

여기서 **"그러면 코드 기본값 30분으로 동작 중"이라고 결론지은 것은 틀렸다.** 환경변수만
보고 상수 선언까지만 확인한 판단이었다. 실제 배포에서 브리핑이 매번 뜬다는 관찰과
모순된다는 지적을 받아 판정 경로를 끝까지 추적했고, 진짜 원인은 환경변수가 아니라
**코드에 하드코딩된 분기**였다. 아래 D-3 항목에 정리한다.

교훈 — 설정값의 "선언"과 "실사용"은 별개다. 상수가 존재하고 env 오버라이드 함수까지
있어도, 판정식이 그 값을 참조하지 않으면 아무 의미가 없다. 이전 후 구성에서 환경변수
목록을 옮길 때도 **키가 실제로 읽히는 경로가 있는지**를 함께 확인해야 한다.

---

## Phase 0.5 — AWS 구성 기록 (2026-08-29)

### 무엇을 했나

인프라가 살아 있는 동안에만 정확히 쓸 수 있는 문서를 만들었다.
[`architecture-aws.md`](architecture-aws.md) 신규 작성 — VPC·서브넷·보안 그룹·ALB·
EC2·nginx·PM2·RDS·CloudFront·배포 파이프라인을 전부 CLI로 실조회해 기록했다.

문서 구조를 이렇게 나눴다. 기존 `architecture-r1.md`는 논리·앱·데이터 아키텍처라
인프라와 독립적이므로 건드리지 않고, 그 아래 인프라 층을 별도 문서로 뒀다.

```
architecture-r1.md       논리·앱·데이터 (인프라 무관, 이전과 무관하게 유효)
architecture-aws.md      이전 전 인프라        ← Phase 0.5
architecture-current.md  이전 후 인프라        ← Phase 6
migration.md             이전 과정·판단 근거   ← 이 문서
```

### 예상과 달랐던 것

**NAT Gateway가 없었다.** 작업 지시서는 "프라이빗 서브넷 구성상 존재할 가능성 높음 —
과금 최대"로 예상했으나 실제로는 없었다. EC2를 프라이빗 서브넷에 두는 대신 **퍼블릭
서브넷에 Elastic IP를 직접 붙이는** 구성이었기 때문이다. 프라이빗 서브넷 2개는
RDS 전용이다.

보안은 NAT 대신 **보안 그룹 3단 사슬**로 확보했다 — ALB는 CloudFront 관리형 접두사
목록에서만, EC2는 ALB SG에서만, RDS는 EC2 SG에서만 받는다. EC2에 퍼블릭 IP가 있어도
80 포트가 ALB SG로만 열려 있어 직접 접근되지 않고, 관리 접근은 포트 개방 없이 SSM으로
한다. 결과적으로 **최대 과금 항목을 없애면서 계층 격리는 유지한** 구성이다. 이전
후에도 이 정도의 격리를 유지할 수 있는지가 판단 지점이 된다.

**SSE가 두 계층에 동시에 의존하고 있었다.** nginx의 `proxy_buffering off`만 보고
있었는데, CloudFront `/api/*` 동작도 Min/Default/Max TTL을 전부 0으로 두고 헤더를
전량 전달하도록 맞춰져 있었다. 둘 중 하나만 어긋나도 스트리밍이 죽는다. 이전 후
검증에서 프록시 계층을 하나씩 확인해야 한다.

**nginx가 `/api` 접두사를 벗겨내고 있었다.** `proxy_pass`가
`http://127.0.0.1:3000/`(끝 슬래시)라 백엔드 라우트에는 `/api`가 없다. Fly에서
프록시 없이 컨테이너가 직접 요청을 받으면 이 변환이 사라지므로, 프론트의 API
베이스 URL 처리를 함께 손봐야 한다.

---

## 착수 전 결정 (D-1 ~ D-3)

### D-1. 임베딩 교체 모델 — Cohere embed-v4, 출력 차원 1024

Titan은 Bedrock 전용이라 AWS를 닫으면 함께 사라진다.

**비용은 판단 기준이 아니었다.** 「탁류」 전량 임베딩은 후보 어느 것이든 도서당 1회
수백 원 이하고, 질의 임베딩은 회당 수십 토큰이라 사실상 0이다. 최저가를 고르려고
한국어 품질을 포기할 이유가 없다.

**실질 기준은 1024차원 유지였다.** 출력 차원을 1024로 지정할 수 있으면
`EMBEDDING_DIM` 상수, `vector(1024)` 스키마, HNSW 인덱스를 그대로 쓸 수 있다.
데이터 이전이 `UPDATE` 한 줄로 끝난다. 차원이 바뀌면 스키마 변경 + 인덱스 재생성이
따라붙는다.

Supabase Edge Functions의 내장 임베딩은 **탈락** — 지원 모델이 `gte-small` 하나뿐이고
영어 전용이며 384차원이다. 세 조건 모두 안 맞는다.

한국어 적합성은 문서 A8-1이 정한 절차(표본 20~30문장 유사도 비교)로 Phase 1에서
실검증한다. 1937년 표기의 고어체·방언이 섞인 텍스트라 "다국어 지원" 표기만 믿고
넘어갈 수 없다.

### D-2. LLM 폴백 정책 — 재시도만 (단일 모델)

Bedrock Nova Lite 폴백 경로가 사라진다. **폴백 모델을 두지 않고 지수 백오프 재시도만
남긴다.** NFR-AI-003을 재시도 정책으로 재정의한다.

폴백 모델을 두면 R10(FR-QNA-004 🚦 — 근거 부재 시 항상 같은 문구)을 **모델별로 다시
검증해야 한다.** Haiku 4.5를 고를 때 질문 5종×3회 절차를 돌렸고, 그때 Sonnet 5는 근거
부재 답변이 매번 달라져 탈락했다. 폴백 모델에도 같은 절차를 요구하는 비용이
포트폴리오 규모에 맞지 않는다. 게다가 같은 공급자 안의 폴백이라 공급자 장애 상황에서
실질 효과도 제한적이다.

Nova Lite 관련 설정(`BEDROCK_FALLBACK_MODEL`, `ENABLE_MODEL_FALLBACK`)과 주석은 함께
정리한다. 어차피 `ENABLE_MODEL_FALLBACK=false`로 한 번도 켜진 적이 없다.

### D-3. 세션 진입 판정 — 항상 브리핑을 정식 결정으로 승격

**조사 과정에서 판단을 한 번 틀렸다.** Phase 0에서 `.env`에 `SESSION_TIMEOUT_MS`가
없는 것을 보고 "코드 기본값 30분으로 동작 중"이라고 결론지었는데, 실제 배포에서
브리핑이 매번 떴다는 관찰과 모순된다는 지적을 받고 판정 경로를 끝까지 추적했다.

원인은 환경변수가 아니라 **코드에 하드코딩된 분기**였다.

```ts
// session.service.ts decideEntry — 커밋 e82024f (2026-08-25)
const isNewSession = true;   // 30분 비교를 통째로 삭제
```

지워진 원래 판정식:

```ts
const session = await sessions.findSession(deviceId, bookId);
const isNewSession =
  session === null ||
  clock.now().getTime() - session.last_activity_at.getTime() >= SESSION_TIMEOUT_MS;
```

**`SESSION_TIMEOUT_MS`의 실사용처 추적 결과** — `SPEC_SESSION_TIMEOUT_MS`(30분) →
`resolveSessionTimeout()`(env 오버라이드) → `SESSION_TIMEOUT_MS` export까지는 정상
동작한다. 그런데 이 export를 소비하는 곳은 **스위퍼(`sweep.ts:48`) 하나뿐**이고,
그 스위퍼는 배선이 없다 — `runSweep`을 부르는 건 수동 실행용 `run-sweep.ts`뿐이며
`index.ts`에 스케줄러가 없고 프로덕션 EC2에도 crontab·cron.d·systemd timer가 전부
비어 있다(실조회 확인). 즉 **`SESSION_TIMEOUT_MS`는 현재 어디에서도 실효적으로 쓰이지
않는다.**

방증 — 데모 디바이스의 `reading_session.session_epoch`가 **136**이다. `/entry`를 부를
때마다 `startNewSession`이 돌아 계속 증가했다. 모든 행의 `recap_state`가 `none`인 것도
스위퍼가 한 번도 돌지 않았다는 증거다. `last_activity_at`은 정상 갱신되고 있다
(`touchActivity`가 진도·리캡·조회 5개 경로에서 호출됨) — 갱신된 값을 읽는 쪽이 없을 뿐이다.

프론트는 결백하다. `routes.ts`가 서버의 `route`를 그대로 따르고 `is_new_session`으로
재판정하지 않는다(절대 규칙 8번 준수). `FORCE_BRIEFING` 류의 데모 플래그도 없다.

**결정 — 하드코딩을 유지하되 "임시 조치"가 아닌 정식 결정으로 승격한다.**

포트폴리오에서는 방문자가 반드시 브리핑 화면을 거쳐야 제품이 설명된다. 30분 규칙을
살리면 재방문 시 건너뛰어 오히려 안 보인다. 원복해도 스위퍼가 여전히 미동작이라
저장 리캡 재종합(R7)이 안 돌고, 그 상태에서 30분 규칙만 살리면 재방문자는 브리핑도
못 보고 저장 리캡도 없는 상태가 된다 — 명세 정합성이 오히려 나빠진다.

따라서 R6·FR-BRF-001을 재정의하고, `architecture-r1.md` 5.2절 흐름 B의 "저장 리캡
재사용이 주 경로" 서술도 사실과 맞춘다(매번 새 세션 → 매번 브리핑 → 항상 실시간
스트리밍). 코드의 "데모 기간 임시 조치" 주석도 정식 결정 서술로 고친다. Phase 6에서
처리한다.

---

## Phase 1 — 코드 변경

### 무엇을 바꿨나

**1-1. LLM 게이트웨이 → Anthropic API** (`modules/llm-gateway/`)

의존성을 `@aws-sdk/client-bedrock-runtime` → `@anthropic-ai/sdk`(0.122.0)로 교체했다.
**호출부는 한 줄도 안 고쳤다** — 4.3절 의존 규칙대로 모든 LLM 호출이 게이트웨이를
경유하고 있었기 때문에, `call`/`stream`의 시그니처와 반환 형태만 유지하면 챗봇·리캡·
배치가 그대로 돈다. 이 설계가 실제로 값을 한 지점이다.

- `gateway.ts` — `InvokeModelWithResponseStreamCommand` → `client.messages.stream()`.
  Nova/Claude 두 스키마를 분기하던 `buildRequestBody`·`parseResponseBody`·
  `parseStreamChunk` 세 함수가 통째로 사라졌다(폴백 제거로 Nova가 없어져서).
- `model-config.ts` — `BEDROCK_MODEL` → `ANTHROPIC_MODEL`, 기본값 `claude-haiku-4-5`.
- `retry.ts` — `withFallback` 제거(D-2). `withRetry`는 임베딩 경로가 계속 쓴다.

**1-2. 임베딩 → Cohere embed-v4** (`modules/llm-gateway/embedding.ts` 신규)

적재(`batch/pipeline/embed.ts`)와 질의(`chatbot/vector-search.ts`)에 **따로 있던 임베딩
호출을 한 파일로 합쳤다.** 지시서가 요구한 대로이기도 하지만, 합치면서 두 곳이 이미
어긋나 있었다는 걸 발견했다 — 적재 쪽은 모델 ID가 없으면 예외를 던졌는데 질의 쪽은
하드코딩된 기본값(`amazon.titan-embed-text-v2:0`)으로 조용히 넘어갔고, 차원 검증도
적재에만 있었다. 질의 임베딩이 잘못된 차원으로 나가도 아무도 못 잡는 상태였다.

**1-3. 실행 환경** — `ecosystem.config.js` 삭제(PM2 제거). `package.json`의 start는 이미
`node dist/index.js`라 그대로 뒀다.

**1-4. DB 연결** (`config/database.ts`) — 풀 크기 20 → 5, 연결 타임아웃 2초 → 10초,
SSL 인증서 검증 활성화.

### 왜 그렇게 정했나

**모델 ID에 날짜를 붙이지 않는다.** 지시서는 `claude-haiku-4-5-20251001`을 쓰라고
했는데 **그건 Bedrock 형식이고 Anthropic API에는 존재하지 않는 ID다.** Anthropic API의
정식 ID는 `claude-haiku-4-5` 하나로 완결돼 있다.

이게 NFR-AI-002(모델 버전 고정)의 근거를 흔든다 — 예전엔 "ID 문자열에 날짜가 박혀
있으니 고정"이라고 말할 수 있었지만 이제 그 날짜가 없다. 조항을 버리는 대신 취지를
세 가지로 옮겼다: ① 별칭(`-latest` 류)을 쓰지 않고 세대 고정 ID를 쓴다 ② 기동 로그에
실제 모델을 남긴다 ③ 이 값을 바꾸면 가드레일을 재수행한다. ①은 테스트로 고정했다
(`model-config.test.ts` — Bedrock 접두사·날짜 접미사·`latest`가 없는지 검사).

**SDK 내장 재시도를 쓴다.** 직접 만든 `withRetry`를 게이트웨이에서 뺐다. Anthropic SDK가
408/409/429/5xx와 연결 오류를 실제 에러 타입으로 판별해 지수 백오프로 재시도한다.
직접 구현을 유지했다면 아래 버그를 그대로 안고 갔을 것이다.

**부팅 가드를 API 키로 옮겼다.** Bedrock은 IAM 역할로 서명해서 별도 키가 없었고,
`validateModelVersions`는 모델 ID 존재만 확인했다. Anthropic API는 키가 없으면 첫
호출에서야 401로 터지는데, 조회 5종은 LLM을 안 부르므로 **데모 중 챗봇을 눌러야
발견되는** 실패 모드가 된다. 그래서 기동 시 `ANTHROPIC_API_KEY` 부재를 예외로 막는다.

**커넥션 풀 20 → 5.** 두 가지가 겹쳤다. Supabase 동시 연결 상한이 RDS보다 낮고,
실행 단위가 PM2 2프로세스 → 컨테이너 1개로 줄었다. 예전 설정은 실제로 20 × 2 = 40을
띄웠다는 뜻이기도 하다. 연결 타임아웃은 2초 → 10초로 늘렸다 — 같은 리전이어도 매니지드
DB는 콜드 상태에서 첫 연결이 2초를 넘길 수 있다.

### 막힌 것과 발견한 것

**재시도가 조용히 죽어 있을 뻔했다.** `retry.ts`의 `isRetryableError`는
`'ThrottlingException'`, `'NetworkingError'` 같은 **AWS 에러 이름**을 문자열 매칭했다.
AWS를 떠나면 그 이름은 절대 안 나오므로, 그대로 뒀다면 **모든 오류가 "재시도 불가"로
분류돼 재시도가 한 번도 안 도는** 상태가 됐을 것이다. 에러는 정상적으로 나고 로그도
찍히기 때문에 겉으로는 아무 문제가 없어 보인다. HTTP 상태 코드 기준으로 바꿨다.

이건 이관에서 반복되는 패턴이다 — **문자열 매칭으로 외부 시스템의 어휘에 의존한 코드는
그 시스템을 떠날 때 조용히 무력화된다.** 타입 오류도, 테스트 실패도 안 난다.

**`output_dimension`을 명시하지 않으면 차원이 틀어진다.** Cohere embed-v4의 기본 출력
차원은 **1536**이다. 1024를 명시하지 않으면 `vector(1024)` 컬럼 적재가 실패한다.
지시서가 경고한 지점이 실제로 그랬다. 런타임 차원 검증을 넣어 응답이 1024가 아니면
적재 전에 예외로 잡는다.

**테스트가 폐지된 task 이름을 검사하고 있었다.** `model-config.test.ts`는
`chatbot_easy`·`chatbot_hard`를 조회하면서 "문자열이면 통과"만 확인했다. 그 두 이름은
2026-08-25에 폐지됐고, 존재하지 않는 task는 조용히 폴백을 탄다 —
`model-routing.test.ts`가 잡아낸 바로 그 회귀를 이 테스트는 통과시키고 있었다.
실제 매핑 키와 ID 형식을 고정하도록 다시 썼다.

**보안 훅이 SSL 검증 비활성화를 지적했다.** `rejectUnauthorized: false`는 RDS의 CA
번들을 심지 않으려던 편법이었는데, 그 상태로는 중간자 공격을 막지 못한다. Supabase
pooler는 공인 CA 인증서라 검증을 켤 수 있어 `true`로 바꿨다.

**Rate limiter의 상한이 원래 명세대로 동작하지 않고 있었다.** 프로세스 메모리 `Map`인데
PM2가 2프로세스를 띄웠으므로, 요청이 어느 워커로 가느냐에 따라 실제 상한이 분당 3회가
아니라 최대 6회까지 늘어날 수 있었다(NFR-AI-017). 컨테이너 1개가 되면서 우연히
명세값대로 맞았다 — 고친 게 아니라 실행 단위가 바뀌어 해소된 것이라 주석에 남겼다.

### 아직 못 한 것

- **A8-1 한국어 표본 검증** — `COHERE_API_KEY`가 없어 실행하지 못했다. 코드는 준비됐고,
  키를 받으면 「탁류」의 고어체·방언 문장 20~30개로 유사도 비교를 돌린다.
- **실제 호출 검증** — `ANTHROPIC_API_KEY`도 없어 스트리밍이 실제로 도는지 확인하지
  못했다. 타입·빌드·테스트(363개)는 전부 통과하지만, 그건 실호출을 대신하지 못한다.
  특히 SSE 첫 토큰 도착과 하드 상한 도달 시 `gen.return()` 조기 취소가 Anthropic SDK
  에서도 안전한지는 Phase 4에서 확인해야 한다(Bedrock에서는 이 취소가 내부 예외로 번져
  응답 전체를 500으로 만든 전례가 있어 호출부가 try/catch로 삼키고 있다).
- **AWS 배포 산출물** — `.github/workflows/deploy-backend.yml`, `infra/terraform/`는
  아직 그대로다. Phase 2에서 교체한다.

### 검증

`tsc --noEmit` 통과 · `npm run build` 통과 · 백엔드 테스트 45스위트 363개 전부 통과.
소스에서 Bedrock·AWS SDK 참조 0건(테스트의 회귀 방지 검사 문구 제외).

⚠️ 테스트 수가 이전 기록(365개)과 다른 것은 이 브랜치가 `origin/main`에서 갈라져
나와 챗봇 브랜치의 커밋 `21ab176`(테스트 3파일 추가)을 포함하지 않기 때문이다.
회귀가 아니다.

## Phase 2 — 배포 설정

<!-- Phase 2 완료 시 기록 -->

## Phase 3 — 데이터 이전

<!-- Phase 3 완료 시 기록 -->

## Phase 4 — 검증

<!-- Phase 4 완료 시 기록 -->

## Phase 5 — AWS 정리

<!-- Phase 5 완료 시 기록 -->
