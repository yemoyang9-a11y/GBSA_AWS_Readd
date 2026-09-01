# migration.md — AWS 이탈 이전 기록

> 이전 전 인프라는 [`architecture-aws.md`](architecture/architecture-aws.md), 이전 후 인프라는
> [`architecture-current.md`](architecture/architecture-current.md)에 있다. 이 문서는 **그 사이에서
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

### 재검증 (2026-08-30)

Phase 1까지 진행한 뒤 백업 항목을 처음부터 다시 확인했다. 되돌릴 수 없는 단계라
"했다고 기억하는 것"과 "실제로 남아 있는 것"이 같은지 대조할 가치가 있다.

| 항목 | 결과 |
| --- | --- |
| `.env` 키 이름 (17개) | 8/29과 동일. `SESSION_TIMEOUT_MS` 부재 재확인(`grep -c` = 0) |
| 로컬 덤프 | `backup/ssabi.dump` 2,882,480 bytes. 매직바이트 `PGDMP` 확인 |
| 덤프 내용 | `pg_restore --list`로 20개 테이블 전부 + `vector` 확장 확인 |
| 덤프 커밋 여부 | `.gitignore:64` (`*.dump`)로 제외됨 — 저장소에 안 올라간다 |
| 임베딩 적재 | 누락 0건 / 411건 |
| Route53 | 호스팅 존 0건, 등록 도메인 0건 — **잃을 도메인 없음** |
| S3 자산 | 아래 참조 — **전부 저장소에 정본 있음** |
| RDS 수동 스냅샷 | `ssabi-final-before-aws-exit-20260830` 생성 완료(available, 20GB, 16.15) |

**테이블별 행 수** (덤프에 담긴 실제 데이터 규모)

```
chatbot_conversation_turn 812   terms                246   aliases        101
recap_call_log            450   relationships        195   characters      52
pages                     411   character_notes      173   reading_session 52
session_recap_cache       370   chatbot_conversation 172   reading_position 41
                                events               151   chapters        19
                                                           chapter_summaries 19
                                                           books            3
                                                           background_and_intro 2
review_records 0 · saved_recap 0 · conversation_history 0
```

`saved_recap`이 0건인 것이 D-3에서 확인한 내용과 맞물린다 — 진입 판정이 매번 새 세션을
만들고 스위퍼가 미동작이라 저장 리캡이 한 번도 쌓이지 않았다. 브리핑이 항상 실시간
스트리밍이었다는 서술의 데이터 쪽 증거다.

**S3 자산 — 잃을 것이 없는지 실제로 대조했다.** 8/29에는 버킷 목록만 보고 "고유 자산
없음"이라고 적었는데, 근거가 약한 판단이었다. 객체를 전부 나열해 보니 보존 가치가 있는
것이 실제로 있었다.

| S3 객체 | 저장소 정본 | 판정 |
| --- | --- | --- |
| `data/raw/takryu.txt` (970 KiB) | `backend/data/raw/takryu.txt` | 커밋됨 |
| `covers/*.jpg\|webp` (5개, ~550 KiB) | `frontend/public/covers/` | 5개 전부 커밋됨 |
| `assets/ssabi-face-*.png` | `frontend/src/assets/images/ssabi-face.png` | 커밋됨 (S3 쪽은 Vite 빌드 산출물) |
| `assets/index-*.js\|css` | — | 빌드 산출물, 재생성 가능 |
| `deploy/*` | — | 구 배포 산출물, 이관으로 폐기 |

`git ls-files --error-unmatch`로 7개 파일을 하나씩 대조해 전부 추적 중임을 확인했다.
**S3에만 있는 고유 자산은 없다** — 이번엔 근거를 갖고 말할 수 있다.

**스냅샷을 새로 만든 이유** — 기존 수동 스냅샷 2개는 8/24·8/27 시점이라 현재 상태가
아니었다. 자동 스냅샷은 8/29까지 있지만 **인스턴스를 삭제하면 자동 스냅샷도 함께
사라지고 수동 스냅샷만 남는다.** Phase 5에서 RDS를 지우기 전에 최신 수동 스냅샷이
반드시 있어야 한다.

---

## Phase 0.5 — AWS 구성 기록 (2026-08-29)

### 무엇을 했나

인프라가 살아 있는 동안에만 정확히 쓸 수 있는 문서를 만들었다.
[`architecture-aws.md`](architecture/architecture-aws.md) 신규 작성 — VPC·서브넷·보안 그룹·ALB·
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

### 정정 (2026-08-31)

문서를 실제로 한 트리에 모으면서 위 구조에 오류 두 가지가 드러났다.

**`architecture-r2.md`가 빠져 있었다.** `docs` 브랜치에 「아키텍처 2회차 · 배포 설계」가
v0.7까지 개정돼 있는데 위 표에 없다. `architecture-aws.md`와 같은 인프라 층을 다루지만
성격이 다르다 — r2는 **설계 의도**(무엇을 왜 하려 했나), `architecture-aws.md`는
**실조회 기록**(실제로 무엇이 있었나)이다. AWS 종료로 r2의 서술은 전량 무효가 됐으나
12장 「채택하지 않은 구성과 그 근거」·2.2절 「스위퍼를 Lambda로 만들지 않는다」는
실측 기록이 대체할 수 없어 보존한다.

**`architecture-r1.md`는 인프라 무관이 아니다.** "건드리지 않는다"고 적었으나 실제로는
Amazon Titan Text Embeddings V2가 확정 사항으로 세 곳(406·605·760행)에 박혀 있다.
Cohere embed-v4로 바꾼 D-1과 모순되므로 Phase 6 수정 대상에 포함한다.

**위치도 갈라져 있었다.** r1·r2는 `docs` 브랜치에만, `architecture-aws.md`·`migration.md`는
작업 브랜치에만 있어 상호참조가 브랜치를 건너뛰었다. `docs` 브랜치를 통째로 merge하면
`15d567a`("Remove documentation files")에서 의도적으로 지운 26개 문서가 되살아나므로,
r1·r2만 가져와 `docs/architecture/` 아래로 모았다(출처: `origin/docs` `6ab6dc0`).
나머지 문서는 `origin/docs`에 그대로 둔다 — r2의 v0.5→v0.7 개정 이력도 그쪽에서 조회한다.

```
docs/architecture/architecture-r1.md       논리·앱·데이터 (Titan 3곳 수정 필요)
docs/architecture/architecture-r2.md       이전 전 배포 설계 — 의도
docs/architecture/architecture-aws.md      이전 전 인프라 — 실측     ← Phase 0.5
docs/architecture/architecture-current.md  이전 후 인프라            ← Phase 6
docs/migration.md                          이전 과정·판단 근거       ← 이 문서
```

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

## Phase 2 — 배포 설정 (2026-08-30)

### 무엇을 만들었나

| 파일 | 역할 |
| --- | --- |
| `backend/Dockerfile` | 2단계 빌드 — builder(`npm ci` + `tsc`) → runtime(prod 의존성만) |
| `backend/.dockerignore` | `.env`·`node_modules`·테스트·`data/` 제외 |
| `backend/fly.toml` | 도쿄(`nrt`), 스케일-투-제로, 256MB, `/health` 체크 |
| `frontend/public/_redirects` | Cloudflare Pages SPA fallback |
| `.github/workflows/deploy-backend.yml` | SSM+PM2 → Fly 배포로 교체 |
| `.github/workflows/ci-frontend.yml` | 배포 제거, 빌드·테스트만 (신규) |
| `.github/workflows/deploy-frontend.yml` | 삭제 |

코드 변경은 `backend/src/index.ts` 두 곳이다 — CORS 오리진 허용 목록과 `0.0.0.0` 바인딩.

### 왜 그렇게 정했나

**프론트 배포를 GitHub Actions에서 걷어냈다.** 예전 `deploy-frontend.yml`은 빌드 시
`VITE_API_URL`을 **워크플로 파일에 하드코딩**해 번들에 구웠다
(CloudFront 도메인 + `/api` 접두사). Vite는 이 값을 빌드 시점에 굽기 때문에
주소가 바뀌면 워크플로를 고쳐 다시 빌드해야 한다. Cloudflare Pages의 Git 연동을 쓰면
그 값이 Pages 대시보드의 빌드 환경변수로 가서 배포 설정과 한 곳에 모이고, 프리뷰
배포도 자동으로 붙는다. Actions에는 빌드·테스트만 남겼다.

**⚠️ 주소 형태가 바뀐다.** CloudFront 구성에서는 프론트와 API가 같은 오리진이라
`/api` 접두사를 붙였는데, Fly는 별도 오리진이고 접두사가 없다. Pages 환경변수에
`/api`를 붙이면 **전 요청이 404**가 된다. `.env.example`에 경고를 적어 뒀다.

**CORS를 실제로 배선했다.** `CORS_ORIGIN`은 프로덕션 `.env`에 값이 있었는데
**코드가 읽지 않고 있었다** — `SESSION_TIMEOUT_MS`와 똑같은 패턴이다(선언은 있는데
사용처가 없음). 예전엔 CloudFront 하나가 `/`(S3)와 `/api`(ALB)를 함께 서빙해 같은
오리진이었으므로 CORS가 사실상 무의미했고, 그래서 `*`로 열린 채 "개발용"이라고만
적혀 있었다. 이제 프론트(Pages)와 백엔드(Fly)가 다른 오리진이라 실제로 동작하는
설정이 됐다. 허용 목록에 없으면 CORS 헤더를 아예 붙이지 않고, 목록을 쓸 때는
`Vary: Origin`을 함께 보낸다(없으면 CDN이 한 오리진의 응답을 다른 오리진에 재사용해
산발적으로 깨진다).

**`0.0.0.0`을 명시했다.** Node 기본값도 전 인터페이스지만, 컨테이너에서 루프백에만
붙으면 프록시가 도달하지 못하고 **헬스체크만 계속 실패하는** 형태로 조용히 깨진다.

**`data/`를 이미지에서 뺐다.** 「탁류」 원문 970KB는 배치 파이프라인(장 요약·임베딩
생성)에서만 쓰고 API 서버 런타임에는 필요 없다. 배치는 로컬에서 Supabase를 향해 돌린다.

### 검증 (로컬에서 실제로 확인한 것)

배포는 안 했지만 이미지가 실제로 도는지는 여기서 확인할 수 있다.

- `docker build` 성공 — 이미지 **263MB**
- 컨테이너 기동 성공 — Node 22.23.2, 게이트웨이가 `claude-haiku-4-5` / 폴백 없음으로 뜸
- `/health` 200
- `/books` — 로컬 DB까지 관통해 실데이터 반환(「탁류」, 411페이지, 100%)
- CORS **허용 오리진** → `Access-Control-Allow-Origin` + `Vary: Origin` 정상
- CORS **비허용 오리진** → CORS 헤더 없음(브라우저가 차단) 정상

**`NODE_ENV=production`에서 로컬 DB 연결이 거부되는 것도 확인했다** —
`The server does not support SSL connections`. Phase 1에서 SSL 인증서 검증을 켠 것이
의도대로 동작한다는 뜻이다(로컬 Docker Postgres는 SSL 미지원, Supabase는 지원).
로컬에서 컨테이너를 띄울 때는 `NODE_ENV=development`로 둬야 한다.

### 아직 못 한 것 — 사람이 해야 하는 부분

flyctl이 이 PC에 설치돼 있지 않고, **앱 생성은 계정에 리소스를 만드는 작업이라
실행하지 않았다.** 아래는 사람이 직접 한다.

1. `fly launch --no-deploy` (backend/ 에서) — 앱 이름이 이미 쓰이면 다른 이름을 고르고
   `fly.toml`의 `app` 값도 함께 고칠 것
2. `fly secrets set` 으로 비밀값 주입 — `ANTHROPIC_API_KEY` `COHERE_API_KEY`
   `DATABASE_URL` `CORS_ORIGIN` (값은 코드·문서에 남기지 않는다)
3. GitHub 저장소에 `FLY_API_TOKEN` 시크릿 등록
   (`fly tokens create deploy -x 999999h`)
4. Cloudflare Pages 프로젝트 생성 — Root `frontend`, Build `npm run build`,
   Output `dist`, 환경변수 `VITE_API_URL`(Fly 주소) · `VITE_USE_MOCK=false`

### Phase 4로 넘기는 확인 사항

- **SSE 버퍼링** — 예전엔 nginx `proxy_buffering off`와 CloudFront TTL 0 **두 계층**에
  의존했다. Fly 프록시에서 같은 동작이 나는지는 배포해야 안다. 버퍼링이 켜져 있으면
  첫 토큰이 안 나오고 응답이 끝날 때 한꺼번에 오는데, **로컬에서는 재현되지 않는다.**
- **메모리 256MB** — 리캡 입력이 2만 토큰을 넘는 경우가 있어(실측: cutoff=400에서
  19,228 토큰) 모자라면 OOM으로 죽는다.
- **스케일-투-제로가 실제로 정지하는지** — 안 켜져 있으면 상시 과금이다. 대시보드에서
  확인할 것.
- **콜드스타트 시간** — 스케일-투-제로의 대가다.

---

## Phase 3 — 데이터 이전 (2026-08-30, **완료**)

| 단계 | 결과 |
| --- | --- |
| 1. `CREATE EXTENSION vector` | vector 0.8.2 설치 (빈 스키마에서 시작) |
| 2. 덤프 복원 | 20개 테이블, **행 수 전부 백업 시점과 일치** |
| 3. HNSW 인덱스 | `ix_pages_embedding` 덤프 따라 들어옴, 컬럼 `vector(1024)` 유지 |
| 4. Titan 임베딩 무효화 | `UPDATE 411` — 사용자 승인 후 실행 |
| 5. Cohere 재임베딩 | 411페이지 전량, 누락 0건 |
| 6. 차원 확인 | 411개 **전부** 1024, 이상 벡터 0건 |
| 7. 커넥션 검증 | prepared statement 정상, 동시 20건 성공, 지연 45ms |

대상은 Supabase **PostgreSQL 17.6**(덤프는 16.15 — 상위 버전 복원은 정상 경로).

### 접속 — 직접 연결이 아니라 Session pooler

처음 받은 `db.<ref>.supabase.co:5432`(직접 연결)는 **DNS에 레코드 자체가 없었다.**
신규 프로젝트는 직접 연결이 IPv6 전용이라 IPv4 환경에서 해석되지 않는다. Session
pooler(`aws-0-ap-northeast-1.pooler.supabase.com:5432`)로 교체해 해결했다 — 사용자명이
`postgres.<ref>` 형식으로 달라지는 점이 함정이다.

포트 5432(session 모드)를 쓴 덕에 **prepared statement 문제가 없다.** 6543(transaction
모드)이었다면 매 트랜잭션마다 다른 백엔드가 배정돼 깨졌을 것이다.

### ⚠️ SSL — Phase 1의 판단이 틀렸다

Phase 1에서 "Supabase pooler는 공인 CA 인증서라 검증을 켤 수 있다"고 적고
`rejectUnauthorized: true`로 바꿨는데, **틀렸다.** 실제로 붙으니
`SELF_SIGNED_CERT_IN_CHAIN`으로 거부됐고 체인을 열어 보니 Supabase 자체 CA였다:

```
0  CN=*.pooler.supabase.com
1  CN=Supabase Intermediate 2021 CA
2  CN=Supabase Root 2021 CA        ← self-signed 루트 (공개 CA 아님)
```

`rejectUnauthorized: false`로 되돌리는 대신 **루트 CA를 저장소에 넣고 신뢰 대상으로
명시**했다(`backend/certs/supabase-root-2021-ca.crt`). 검증을 끄는 게 아니라 신뢰
범위를 이 CA 하나로 좁히는 방식이라, 공인 CA 검증보다 오히려 엄격하다 — 다른 어떤
CA가 서명한 인증서도 거부한다.

이 인증서는 서버가 제시한 체인에서 추출했다. 대시보드(Settings → Database → SSL
Configuration)에서 받은 파일과 SHA-256 지문을 대조하면 검증이 완결된다:
`80:70:25:AD:...:CA:FA` (유효기간 2021-04-28 ~ 2031-04-26).

### ⚠️ 토큰 유량 한도 — 호출 수만 보면 안 됐다

Phase 3 준비 때 "호출 수" 한도(월 1,000회)만 보고 배치를 96건으로 잡았는데, 실제로
돌리니 **429 `trial token rate limit exceeded, limit is 100000 tokens per minute`**가
났다. 체험 티어는 호출 수와 **분당 토큰** 두 축으로 제한되고, 후자가 먼저 걸린다.

「탁류」 실측 — 411페이지 총 410,783자, 페이지당 평균 999자. 96건이면 한 호출이
10만 토큰을 넘긴다. 배치를 **64건**으로 줄이니 호출당 약 47,000 토큰으로 들어왔다.

배치 축소만으로는 부족하다(연속 호출이 누적돼 분당 한도를 넘긴다). `embedding.ts`에
**토큰 유량 페이서**를 넣었다 — 최근 60초 사용량을 기억하고, 다음 호출이 한도를
넘길 것 같으면 창이 열릴 때까지 기다린다. 사용량은 어림이 아니라 응답이 알려 주는
실측치(`meta.billed_units.input_tokens`)로 갱신해 오차가 누적되지 않게 했다.

재시도(`withRetry`)만으로는 못 막는다 — 백오프 상한이 10초라 **분 단위 창이 회복되기
전에 재시도를 다 써 버린다.** 실제 로그:

```
[완료] 97~160페이지 (64/315)
[embedding] 분당 토큰 한도 대기 — 최근 60초 46,910 토큰 사용, 57초 후 재개
[완료] 161~224페이지 (128/315)
[embedding] 분당 토큰 한도 대기 — 최근 60초 45,960 토큰 사용, 55초 후 재개
...
[OK] "takryu" 전체 페이지 임베딩 완료 (1024차원)
```

첫 실패 때 96페이지가 이미 적재돼 있어 315페이지만 남았다 — `embedding IS NULL`
재개 방식이 의도대로 동작했다.

`backend/scripts/migrate-to-supabase.sh`에 1~4단계를 담아 뒀다(이번엔 단계별로
수동 실행했다 — 4단계 전에 사용자 승인을 받기 위해).

### 준비 중에 고친 것 — 재임베딩이 Cohere 한도를 넘길 뻔했다

`run-embed-pages.ts`가 **페이지마다 `embedText`를 1회씩** 부르고 있었다. 411페이지면
411회다. Titan(Bedrock) 시절엔 호출 수가 문제되지 않았지만, **Cohere 체험 티어는
월 1,000회**가 한도라 한 번 돌리는 데 41%를 쓰고 재실행하면 바로 걸린다.

Phase 1에서 `embedDocuments`(96건 배치)를 만들어 뒀는데 정작 이 스크립트가 안 쓰고
있었다 — 만들어만 두고 배선을 안 한 셈이다. 배치로 고쳤다:

- 96건씩 묶어 호출 → 411페이지가 **5회**로 끝난다
- 배치 하나를 한 트랜잭션으로 적재 — 중간에 끊기면 그 배치만 롤백되고 다음 실행에서
  `embedding IS NULL`로 다시 잡힌다(기존 재개 방식 유지)
- 응답 개수와 요청 개수를 한 번 더 대조 — 어긋나면 **잘못된 벡터가 엉뚱한 페이지에**
  들어가는데, 그건 에러 없이 검색 품질만 조용히 망가뜨린다

`embedText`는 이제 사용처가 없다(`embed.ts`에 정의만 남음).

---

## Phase 4 — 검증 (2026-08-30, **부분 완료**)

Anthropic 키가 없어 LLM 경로는 미검증이다. 키 없이 가능한 것만 수행했다.

### 8. 조회형 API — 통과 (단, **로컬 DB 기준**)

기준점에 따라 결과가 실제로 갈리는지 확인했다.

| K | 관계도 노드 | 간선 | 응답에 나온 최대 확립 페이지 |
| --- | --- | --- | --- |
| 40 | 15 | 21 | 25 |
| 80 | 23 | 44 | 79 |

DB에는 확립 페이지 40 초과 인물이 **42명** 있는데 K=40 응답에는 **한 명도 나오지
않았다.** 사전 필터가 실제로 걸린다(FR-SPL, FR-CHR).

응답 지연 — `/books` 15ms, `/info` 38ms, `/chapters` 12ms, `/ssabi/graph` 30ms,
`/pages/50` 23ms. 전부 NFR-PERF-001(1.0초) 안이다.

**Supabase 실측 재측정 (2026-08-30)** — Phase 3 완료 후 도쿄 리전에 붙어 다시 쟀다.

| 쿼리 | 중앙값 | 최소~최대 |
| --- | --- | --- |
| `SELECT 1` (순수 왕복) | 45ms | 42~51ms |
| 도서 목록 | 44ms | 43~48ms |
| 인물 조회 (K 필터) | 46ms | 44~49ms |

**왕복 지연이 약 45ms이고 쿼리 종류와 무관하다** — 대부분이 네트워크 왕복이고 쿼리
실행 시간은 무시할 수준이라는 뜻이다. 한국↔도쿄 물리 거리 기준으로 타당한 값이며,
리전이 어긋났다면(예: us-east-1) 150ms 이상이 나왔을 것이다. **리전 선택이 맞았다.**

NFR-PERF-001(1.0초) 대비 여유가 크다. 다만 API 한 요청이 쿼리를 여러 번 날리면
45ms가 곱해지므로, 조회형 엔드포인트의 실제 응답 시간은 배포 후 다시 봐야 한다.

### 9. 벡터 검색 — 통과 (Supabase + Cohere 실측, 2026-08-30)

Cohere로 질의를 임베딩하고 pgvector 코사인 거리로 검색까지만 돌렸다(LLM 응답 생성
없음). 원문 세부 질의로 **관련 페이지가 실제로 선정된다.**

| 질의 | 기대 위치 | 선정 결과 (거리) |
| --- | --- | --- |
| 정주사가 미두장에서 멱살을 잡힌 장면 | 1장 (1~17p) | **p3**(0.426) p2 p4 p5 p9 p11 |
| 초봉이가 형보를 때려 죽이는 장면 | 18장 (388~405p) | **p397**(0.399) p399 p268 p350 |
| 초봉이가 제호를 만나 서울로 가는 대목 | 12장 (214~237p) | **p214**(0.368) p216 p219 p232 |

세 질의 모두 1위가 기대 구간 안이고, 1위 페이지 원문을 열어 보면 실제로 그 장면이다
(예: 형보 질의 1위 p397 = "방바닥에 나가동그라진 형보는 두 손으로…"). **Cohere
embed-v4의 한국어 성능이 1937년 표기의 고어체·방언 텍스트에서도 동작한다** —
A8-1이 확인하려던 것이 이걸로 실증됐다.

**FR-QNA-006 🚦 사전 필터** — 같은 질의를 K로 잘라 확인했다.

```
K= 40 → p24 p32 p26 p4  p19 p29  | 초과 노출 0건
K=200 → p167 p129 p200 p168 p180 | 초과 노출 0건
K=411 → p397 p399 p268 p350 p265 | 초과 노출 0건
```

K가 낮을 때 "형보 살해"(p397)가 결과에서 사라지고 그 범위 안의 다른 페이지로 대체된다.
유사도 계산 **이전에** `WHERE page_no <= K`가 걸리므로 사후 필터의 결과 고갈·순위
왜곡이 없다.

### 10. SSE 버퍼링 — 앱·컨테이너 계층은 통과, **Fly 프록시는 미검증**

진단용 엔드포인트 `GET /diag/sse`를 추가했다. 300ms 간격으로 더미 청크 10개를 흘리고
각 청크에 서버 발신 시각을 실어 보낸다. DB·LLM·사용자 데이터를 건드리지 않으므로
배포 후에도 남겨 둔다.

Docker 컨테이너를 관통해 측정한 수신 간격:

```
seq 1  →  (기준)
seq 2  →  278ms
seq 3  →  298ms
seq 4  →  302ms
seq 5  →  326ms
seq 6  →  302ms
seq 7  →  298ms
seq 8  →  291ms
seq 9  →  309ms
seq 10 →  302ms
```

서버 발신 간격(300ms)과 일치한다. **앱과 컨테이너 계층에는 버퍼링이 없다.**
Express `flushHeaders()`와 `X-Accel-Buffering: no`가 이미 들어 있고 정상 동작한다.

⚠️ **남은 미지수는 Fly 프록시 하나로 좁혀졌다.** `X-Accel-Buffering`은 nginx 계열
전용 헤더라 Fly는 읽지 않는다. 배포 후 `curl -N https://<host>/diag/sse`로 같은
측정을 반복해, 간격이 300ms 근처면 정상이고 전부 마지막에 몰려 오면 버퍼링이다.

### 11. 정적 테스트 — 통과

`derived-value-single-source.test.ts` 3개 전부 통과. 기준점 결정기 밖의 파생값
재계산 0건, 그리고 "검사가 공집합을 통과하지 않는다"는 메타 검증도 함께 통과.

백엔드 전체 45스위트 363테스트도 통과.

### LLM 경로 — 통과 (2026-08-30, Anthropic 키 확보 후)

#### 키 설정 — `ANTHROPIC_WORKSPACE_ID`가 필요했다

발급한 키가 **identity-linked 방식**이라 `anthropic-workspace-id` 헤더 없이는
`/v1/models`를 포함한 **모든 엔드포인트가 400**을 낸다. SDK가 인증·버전·content-type은
자동으로 붙이지만 이건 안 붙인다. 키의 워크스페이스 범위를 Default로 바꿔도 소용없다 —
`identity-linked`는 범위가 아니라 **발급 방식**의 속성이다.

`gateway.ts`에 조건부로 배선했다(값이 있을 때만 헤더를 싣는다) — 워크스페이스에 묶인
일반 키는 이 헤더가 필요 없고 넣으면 오히려 깨지기 때문이다.

#### 리캡 생성 — 스트리밍 정상

캐시 없는 K=55에서 실제 생성:

```
delta #1 @2491ms  2자     delta #5 @3447ms  22자
delta #2 @2517ms  2자     delta #6 @3802ms  38자
delta #3 @2804ms 26자     delta #7 @4103ms  27자
delta #4 @3106ms 24자     delta #8 @4440ms  34자
done @6742ms — 총 delta 15개 / 375자
```

**첫 토큰 2.5초, 이후 점진 도착.** Bedrock보다 청크가 굵다(Anthropic API가 텍스트
delta를 더 크게 묶어 보낸다) — 게이트웨이를 우회한 SDK 직접 호출도 동일해서
게이트웨이 문제가 아님을 확인했다. 사용자 체감에는 영향이 없다.

내용도 K=55 범위와 맞는다(초봉이 서울행, 승재 등장 — 1~3장).

⚠️ **처음엔 delta가 1개로 나와 스트리밍이 깨진 줄 알았다.** 원인은 K=40에 세션 캐시가
있어서 재사용 경로(`kind: 'reused'`)를 탄 것이었다 — 그 경로는 완성 텍스트를 단일
delta로 보내는 게 설계다(routes.ts:508). 오히려 R8/UC-09 A7 재사용이 정상 동작한다는
증거였다.

#### 챗봇 — 상한이 실제로 갈린다

같은 질문 "고태수는 어떤 사람인가요?"를 K를 달리해 물었다.

| K | 답변 범위 |
| --- | --- |
| 40 | 은행원(p.4), 외모·성격(p.29), 한참봉네 하숙·양약국 단골(p.23·29) |
| 80 | 위 내용 + **초봉이와의 관계** — "사랑하는 여인으로 여기고 있어요", 결혼 언급 |

K=80에서만 나오는 내용이 실제로 추가된다. 스포일러 게이트가 조회형뿐 아니라
챗봇 근거 조립에서도 동작한다.

#### R10 / FR-QNA-004 🚦 — 고정 문구 6/6 수렴

K=40에서 후반부 사건 6종을 물었다: 초봉이가 죽이는 사람 · 고태수의 죽음 ·
장형보의 최후 · 송희의 아버지 · 소설의 결말 · 박제호와의 이별.

**6건 전부 동일한 40자 문구**로 답했다:
`🔒 지금까지 읽은 내용으로는 알 수 없어요 🤔 다른 질문을 해보시겠어요?`

이유를 판별하지 않고 항상 같은 문구를 낸다. Haiku 4.5를 고른 근거(Sonnet 5는 매번
다르게 답해 배제)가 Anthropic API로 옮긴 뒤에도 유지된다.

#### 로그 적재 — NFR-OBS 게이트

검증 중 `recap_call_log` 2건, `chatbot_conversation_turn` 22건이 실제로 쌓였다.
로그가 없으면 게이트 판정 자체가 불가능하므로 이것도 확인 대상이다.

#### ⚠️ 검증 중 겪은 함정 두 가지 (제품 버그 아님, 검증 방법의 문제)

**셸 인코딩으로 한글 질의가 깨졌다.** Git Bash에서 `curl -d '{"query":"고태수는…"}'`로
보내니 서버에 깨진 문자열이 도착해 벡터 검색 거리가 0.73까지 벌어지고
`[NO_EVIDENCE]`가 나왔다. 정상 질의는 0.37~0.43이다. 처음엔 모델 문제로 의심했는데
로그의 `[VectorSearch] Normalized:` 줄에 깨진 문자가 그대로 찍혀 있었다.
**JSON 본문을 Node로 파일에 쓰고 `--data-binary @파일`로 보내면 해결된다.**

**랜덤 `seq`로 진도 갱신이 조용히 막혔다.** 테스트 편의로 `$RANDOM$RANDOM`을 썼더니
한 번 26억이 들어가 버렸고, 이후 진도 이벤트가 전부 FR-PRG-002의 "더 새로운 seq만
수용"에 걸려 **200 OK인데 아무것도 저장되지 않았다.** `applied_cutoff`가 계속 40으로
나와서 발견했다. lessons.md에 기록된 그 실패 모드를 그대로 재현한 셈이다.

**분당 3회 제한(NFR-AI-017)도 정상 동작한다** — 연속 질의 시 429와
`retry_after`를 돌려준다. 검증할 때 간격을 둬야 한다.

### 여전히 미완료

- **NFR-SEC-006 인젝션 10건** — 별도 시나리오 문서가 필요해 이번 범위에서 제외
- **배포 후 확인** — Fly 프록시 SSE 버퍼링(`/diag/sse`), 조회형 API 실지연,
  콜드스타트 시간, 스케일-투-제로 실제 정지 여부

---

## 배포 실행 (2026-09-01)

Phase 2에서 만들어만 두고 "사람이 해야 한다"고 남겨 둔 것을 실제로 실행했다.
`https://ssabi-api.fly.dev` 가 live 다.

### 막힌 것과 해결

**flyctl 설치 — `pwsh` 를 못 찾는다.** Fly 문서가 안내하는
`pwsh -Command "iwr https://fly.io/install.ps1 -useb | iex"` 가
`CommandNotFoundException` 으로 죽었다. `pwsh` 는 PowerShell 7 의 실행 파일명인데
이 PC 에는 Windows PowerShell 5.1 만 있다. **이미 PowerShell 안이므로 래퍼를 벗기고
알맹이만 실행하면 된다.** 스크립트 자체는 5.1 을 명시적으로 지원한다(55행에
`PSVersion.Major -lt 7` 분기가 있다).

**Fly 는 카드가 없으면 앱을 못 만든다.** `We need your payment information to continue`.
공식 문서상 Linked Organization 을 뺀 모든 조직이 카드를 요구하고, 2024 년에 영구
무료 티어가 없어졌다. 제약 조건 2번("유휴 시 과금 없음")을 다시 재보면 —
정지된 머신은 CPU·RAM 과금이 없고 rootfs 스토리지만 GB당 월 $0.15 다. 이미지가
53MB 이고 **볼륨을 안 쓰므로**(`[mounts]` 없음) 유휴 비용은 월 $0.01 수준이다.
정지 상태에서 계속 청구되는 유일한 항목이 볼륨인데 그 구멍을 피해 간 구성이다.

**⚠️ `fly launch` 대신 `fly apps create` 를 썼다.** `fly launch` 는 fly.toml 을
생성해 주는 스캐폴딩 명령이라, 이미 완성된 fly.toml 이 있는 상태에서 돌리면 덮어쓸지
묻고 Postgres·Redis 를 붙일지 줄줄이 물어본다. DB 는 Supabase 를 쓰므로 전부 거절해야
하고 하나라도 잘못 수락하면 원치 않는 리소스가 생긴다. `fly apps create` 는 이름만
등록하고, 이후 `fly deploy` 가 fly.toml 을 그대로 읽는다.

**⚠️ `DATABASE_URL` 재매핑 — `.env` 를 그대로 넣으면 프로덕션이 localhost 를 본다.**
코드는 `DATABASE_URL` 하나만 읽는데(`database.ts:99`), 로컬 `.env` 의 그 값은 로컬
Docker Postgres 를 가리키고 Supabase 주소는 `SUPABASE_DB_URL` 에 따로 들어 있다.
`fly secrets import` 로 `.env` 를 통째로 밀어 넣었으면 조용히 잘못된 DB 를 봤을 것이다.
`DATABASE_URL` ← `SUPABASE_DB_URL` 로 재매핑해 주입했다. `SUPABASE_DB_URL` 은 `src/`
어디에서도 읽지 않는다 — 이전 작업용 보관 변수다.

**PowerShell 5.1 이 stdin 에 BOM 을 붙인다.** `fly secrets import` 에 파이프로 넘기니
첫 키가 `<BOM>ANTHROPIC_API_KEY` 가 돼 거부됐다. `$OutputEncoding` 을 바꿔도 안 잡힌다.
인자 전달(`fly secrets set "K=V"`)로 우회했다. 상세는 `lessons.md` 2026-08-31 항목.

### ⚠️ 배포를 막을 뻔한 버그 — `certs/` 가 이미지에 없었다

Dockerfile 런타임 단계가 `dist`·`migrations`·`scripts`·`public` 만 복사하는데,
`database.ts` 의 `loadDbCa()` 는 `certs/supabase-root-2021-ca.crt` 를 읽는다. 파일이
없으면 `undefined` 를 돌려 Node 기본 신뢰 저장소로 폴백하고, Supabase 는 공인 CA 가
아니라 자체 루트로 서명하므로 `SELF_SIGNED_CERT_IN_CHAIN` 으로 거부된다 — **DB 연결이
통째로 실패한다.**

Phase 2 에서 Dockerfile 을 만든 것이 8/30 오전이고 CA 요구사항은 같은 날 Phase 3 에서
발견됐는데 Dockerfile 이 갱신되지 않았다. **Phase 2 의 로컬 컨테이너 검증이 이걸 못
잡은 이유가 있다** — 로컬 Postgres 는 SSL 을 지원하지 않아 `NODE_ENV=development` 로
띄웠고, `useSSL` 이 false 라 CA 로딩 경로 자체를 안 탔다. 즉 **프로덕션 SSL 경로는 한
번도 실행된 적이 없었다.**

`COPY certs ./certs` 를 추가했다. 인증서 지문은 코드 주석과 대조 확인했다
(`80:70:25:AD:…:CA:FA`, 유효기간 2031-04-26).

교훈 — 로컬 검증에서 `NODE_ENV` 를 낮춰 우회한 경로가 있다면, **그 경로는 검증되지
않은 것**이다. 우회했다는 사실 자체를 배포 전 확인 목록에 남겨야 한다.

### 예상과 달랐던 것 — 머신이 2개 생겼다

`fly deploy` 가 "Creating a second machine for high availability" 로 HA 쌍을 자동
생성했다. fly.toml 에 `min_machines_running = 0` 이 있어도 이건 별개다 — 그 값은
"몇 개를 켜 둘 것인가"이고, 머신 개수 자체는 `fly scale count` 가 정한다. 목표 구성이
"컨테이너 1개"였으므로 `fly scale count 1` 로 줄였다. 유휴 시엔 어차피 둘 다 멈추므로
컴퓨트 차이는 없고 스토리지만 두 배였다.

### 검증 (실측)

| 항목 | 결과 |
| --- | --- |
| `/health` | 200 |
| `/books` | 200, 「탁류」 실데이터 — **Supabase SSL 관통 확인** (한글 정상) |
| **SSE 버퍼링** | **없음.** `/diag/sse` 청크 간 평균 **304ms** (서버 발신 300ms), 헤더 197ms 선도착 |
| **리캡 (최악 조건)** | cutoff=400, **inputTokens 19,227** / output 373 / 5,536ms, delta 14개 점진 도착 |
| **256MB OOM** | **없음.** 위 리캡을 통과했고 로그에 `Out of memory`·code 137·SIGKILL 전무 |
| **스케일-투-제로** | **실제로 정지한다.** 04:49:00 자동 정지 → 04:50:26 요청으로 기동. 유휴 약 8분이면 `stopped` |
| **콜드스타트** | **7.38초** (71분 유휴 후 클라이언트 실측, `/health`). 깨어난 뒤 재요청은 **41ms** |

**SSE 는 이번 이전의 최대 미지수였는데 통과했다.** 예전 구성이 nginx `proxy_buffering
off` 와 CloudFront TTL 0 **두 계층**에 의존해 겨우 흘리던 것을, Fly 프록시는 별도
설정 없이 기본값으로 흘린다. `X-Accel-Buffering: no` 헤더는 Fly 가 읽지 않지만 애초에
필요가 없었다.

**스케일-투-제로 확인은 우연히 결정적으로 됐다.** 리캡 부하 테스트를 돌렸더니 헤더가
8,576ms 에 왔는데, 로그를 보니 그 요청이 **정지돼 있던 머신을 깨운** 것이었다
(04:49 정지 → 04:50:31 부팅 → 04:50:32 도달 가능). 즉 한 번의 호출로 "정지한다",
"요청이 깨운다", "콜드스타트가 5.4초다" 셋이 동시에 증명됐다. 리캡 자체의 지연은
LLM 5,536ms 이고 나머지가 콜드스타트다.

**진도 상태는 건드리지 않았다.** 부하 테스트는 데모 디바이스가 아닌 새 UUID
(`dcf4a484-…`)로 돌렸다. 「탁류」 데모 진도는 50페이지 그대로다.

### 아직 못 한 것

- **`FLY_API_TOKEN`** — 미발급. 현재는 로컬에서 `fly deploy` 로 배포했고, `main` push
  자동 배포를 켜려면 필요하다
- **NFR-SEC-006 인젝션 10건** — 여전히 범위 밖

(`CORS_ORIGIN` 과 Cloudflare Pages 는 아래에서 마무리했다.)

---

## 프론트 배포 — Cloudflare Pages (2026-09-01)

`https://ssabi-d4c.pages.dev` 가 live 다. 이로써 프론트·백엔드·DB 가 전부 AWS 밖에서 돈다.

**도메인에 접미사가 붙었다.** 프로젝트 이름은 `ssabi` 로 만들었는데 배정된 주소는
`ssabi-d4c.pages.dev` 다. `*.pages.dev` 서브도메인은 **전역 고유**라 `ssabi` 가 이미
쓰이고 있었기 때문이다. 검증 중에 `ssabi.pages.dev` 를 우리 배포로 착각할 뻔했는데,
`<html lang>` 이 `en`(우리는 `ko`)이고 `vendor-supabase` 청크가 있어(프론트에 supabase
의존성이 없다) 남의 사이트임을 가려냈다. **배포 확인은 도메인 이름이 아니라 내용으로 한다.**

**프로덕션 브랜치를 `main` 이 아니라 `chore/migrate-off-aws` 로 걸었다.** `main` 에는
`frontend/public/_redirects` 가 없어 SPA 새로고침이 404 가 나고, 사라진 S3·CloudFront 로
배포하는 옛 `deploy-frontend.yml` 이 남아 있다. main 병합 후 대시보드에서 브랜치만 바꾼다.

### 막힌 것과 해결

**Root directory 오타.** `frontdend` 로 입력해 `Cannot find cwd:
/opt/buildhome/repo/frontdend` 로 죽었다. 모노레포라 이 값(`frontend`)은 필수다.

**⚠️ `npm ci` 가 Cloudflare 에서만 실패했다.** `EUSAGE ... Missing: esbuild@0.28.2 from
lock file`. lock 이 낡은 게 아니었다 — 재생성했더니 파일이 한 바이트도 안 바뀌었다.
로컬 npm 11 과 Cloudflare npm 10.9.2 의 의존성 해석 차이였다. 환경변수
**`NODE_VERSION = 24.15.0`** 으로 해결(Node 24 가 npm 11 을 번들한다).
`NPM_VERSION` 은 Pages 가 지원하지 않는다. 상세는 `lessons.md` 2026-09-01 항목.

**⚠️ `VITE_DEMO_DEVICE_ID` 가 37자로 구워져 전 요청이 500 이었다.** 손으로 입력하다
마지막 그룹에 `1` 이 하나 더 들어갔다(UUID 는 `8-4-4-4-12`, 36자). Postgres uuid 캐스팅이
실패해 빈 화면이 아니라 **500** 이 났다. 값을 고치고 **재빌드**했다 — Vite 는 `VITE_*` 를
빌드 시점에 굽기 때문에 환경변수 저장만으로는 반영되지 않는다.

### 검증 (실측)

| 항목 | 결과 |
| --- | --- |
| 앱 정체 | `<title>싸비 — Reading Recap</title>`, `lang="ko"` |
| `VITE_API_URL` | 번들에 `ssabi-api.fly.dev` 구워짐. `localhost`·`/api` 접두사 흔적 **없음** |
| `VITE_DEMO_DEVICE_ID` | 재배포 후 번들에서 `8-4-4-4-12`, 36자 확인 |
| CORS 허용 | Pages 오리진에 `Access-Control-Allow-Origin` + `Vary: Origin` |
| CORS 차단 | 비허용 오리진에는 헤더 미부착 — 브라우저가 차단 |
| **SPA fallback** | `/books/takryu/read`·`/books/takryu/briefing` 직접 접근 **200** — `_redirects` 동작 |
| **리캡 관통** | Pages 오리진 + 데모 디바이스로 `POST /recap/stream` → 200, 첫 delta 2,072ms, **delta 18개 / 437자**, `applied_cutoff: 50` |

마지막 줄이 이번 이전의 결승점이다 — **브라우저와 동일한 조건에서 리캡이 점진적으로
도착한다.** Cloudflare 엣지 → Fly 프록시 → 컨테이너 → Anthropic API → Supabase 가
한 줄로 이어졌다는 뜻이다.

### 남은 것

- **`FLY_API_TOKEN`** — 자동 배포 미연결. 지금은 로컬 `fly deploy` 로만 올린다
- **`main` 병합** — 병합 후 Pages 프로덕션 브랜치를 `main` 으로 변경
- **`frontend/.nvmrc`** — `NODE_VERSION` 이 대시보드에만 있어 프로젝트 재생성 시 유실된다.
  저장소에 `24.15.0` 을 박아 두는 편이 견고하다

---

## Phase 5 — AWS 정리

<!-- Phase 5 완료 시 기록 -->
