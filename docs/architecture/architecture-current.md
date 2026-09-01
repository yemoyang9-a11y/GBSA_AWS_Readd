# architecture-current.md — 이전 후 인프라 구성

> 이전 전 인프라는 [`architecture-aws.md`](architecture-aws.md), 그때의 설계 의도는
> [`architecture-r2.md`](architecture-r2.md), 논리·앱·데이터 아키텍처는
> [`architecture-r1.md`](architecture-r1.md)에 있다. **왜 이렇게 옮겼는가**는
> [`migration.md`](../migration.md)가 다룬다. 이 문서는 **지금 무엇이 어떻게 떠 있는가**만 적는다.
>
> 기준일 2026-09-01. 값은 전부 실조회·실측이며, 확인하지 못한 것은 그렇다고 적는다.

---

## 1. 전체 구성

```
방문자
  │
  ├─ 정적 자산 ──────────► Cloudflare Pages  (ssabi-d4c.pages.dev)
  │                          엣지 캐시, SPA fallback(_redirects)
  │
  └─ API (XHR/SSE) ─────► Fly.io  (ssabi-api.fly.dev, nrt)
                             컨테이너 1개 · 256MB · 스케일-투-제로
                               │
                               ├─► Supabase PostgreSQL + pgvector  (Session pooler, SSL)
                               ├─► Anthropic API   (claude-haiku-4-5)   — 리캡·챗봇
                               └─► Cohere          (embed-v4.0, 1024차원) — 질의 임베딩
```

상시 가동 자원이 **없다.** 방문이 없으면 Fly 머신이 정지하고, 그 시간에 컴퓨트 과금이
붙지 않는다. 프론트는 정적이라 원본 서버가 필요 없다.

| 계층 | 서비스 | 리전 |
| --- | --- | --- |
| 정적 프론트 | Cloudflare Pages | 엣지(전역) |
| 백엔드 API | Fly.io Machines | `nrt` (도쿄) |
| DB | Supabase PostgreSQL + pgvector | 도쿄 |
| LLM | Anthropic API | — |
| 임베딩 | Cohere | — |

백엔드와 DB를 도쿄로 맞췄다. 어긋나면 요청마다 DB 왕복 지연이 붙는다.

---

## 2. 프론트 — Cloudflare Pages

| 항목 | 값 |
| --- | --- |
| 프로젝트 | `ssabi` |
| 도메인 | `ssabi-d4c.pages.dev` |
| 저장소 | `yemoyang9-a11y/GBSA_AWS_Readd` (Git 연동, 자동 배포) |
| 프로덕션 브랜치 | `chore/migrate-off-aws` |
| Root directory | `frontend` |
| Build command | `npm run build` (`tsc && vite build`) |
| Build output | `dist` |

**⚠️ 도메인에 `-d4c` 접미사가 붙어 있다.** `*.pages.dev` 서브도메인은 전역 고유인데
`ssabi` 가 이미 다른 사용자에게 쓰이고 있었다. `ssabi.pages.dev` 는 **우리 사이트가
아니다** — 배포 확인은 도메인 이름이 아니라 내용(`<title>싸비 — Reading Recap</title>`,
`lang="ko"`)으로 한다.

**⚠️ 프로덕션 브랜치가 `main` 이 아니다.** `main` 에는 `frontend/public/_redirects` 가
없어 SPA 새로고침이 404 가 나고, 사라진 S3·CloudFront 로 배포하는 옛
`deploy-frontend.yml` 이 남아 있다. main 병합 후 대시보드에서 브랜치를 바꿔야 한다.

### 2.1 빌드 환경변수

| 이름 | 값 | 비고 |
| --- | --- | --- |
| `VITE_API_URL` | `https://ssabi-api.fly.dev` | **`/api` 접두사를 붙이면 전 요청 404** |
| `VITE_USE_MOCK` | `false` | |
| `VITE_DEMO_DEVICE_ID` | `11111111-1111-4111-8111-111111111111` | 36자 UUID. 틀리면 전 요청 500 |
| `NODE_VERSION` | `24.15.0` | npm 11 확보용 — 아래 참조 |

**Vite 는 `VITE_*` 를 빌드 시점에 번들에 굽는다.** 런타임 환경변수가 아니므로 값을
바꾸면 반드시 재빌드해야 반영된다. 배포 후 확인은 화면이 아니라 **번들을 열어**
실제 구워진 값을 본다.

**⚠️ `NODE_VERSION` 이 없으면 빌드가 죽는다.** Pages 기본은 Node 22.16.0 + npm 10.9.2
인데, 이 저장소의 `frontend/package-lock.json` 은 npm 11 이 만든 것이라 npm 10 이
`EUSAGE ... Missing: esbuild@0.28.2 from lock file` 로 거부한다. lock 이 낡은 게 아니라
두 npm 의 의존성 해석이 다르다. Node 24 가 npm 11 을 번들하므로 이 값으로 해결한다
(`NPM_VERSION` 은 Pages 가 지원하지 않는다). 상세는 `lessons.md` 2026-09-01 항목.

**이 값이 대시보드에만 있다.** 프로젝트를 다시 만들면 유실되므로 `frontend/.nvmrc` 에
박아 두는 편이 견고하다 — 미적용.

### 2.2 SPA fallback

`frontend/public/_redirects` 의 `/*  /index.html  200` 한 줄. Vite 가 빌드 시 `dist/` 로
그대로 복사한다. 200 은 리다이렉트가 아니라 **rewrite** 다 — 주소창 경로를 유지한 채
`index.html` 을 돌려줘야 React Router 가 그 경로를 읽는다. 301/302 로 두면 주소가 `/` 로
바뀌어 항상 대시보드로 떨어진다.

검증 — `/books/takryu/read`, `/books/takryu/briefing` 직접 접근 모두 **200**.

---

## 3. 백엔드 — Fly.io

| 항목 | 값 |
| --- | --- |
| 앱 | `ssabi-api` (org `personal`) |
| 호스트명 | `ssabi-api.fly.dev` |
| 리전 | `nrt` (도쿄) |
| 머신 | **1개**, `shared-cpu-1x` / 256MB |
| 볼륨 | **없음** |
| 이미지 | 53MB (`node:22-alpine` 2단계 빌드) |
| IPv6 | `2a09:8280:1::180:81e8:0` (dedicated) |
| IPv4 | `66.241.125.240` (shared) |

IPv4 가 **공유**라 별도 과금이 없다. dedicated IPv4 는 유료다.

### 3.1 스케일-투-제로

`fly.toml` 의 세 줄이 이번 이전의 핵심이다.

```toml
auto_stop_machines = 'stop'
auto_start_machines = true
min_machines_running = 0
```

"언제 볼지 모르는 포트폴리오"와 "상시 과금 회피"라는 충돌하는 두 제약을 동시에 만족시키는
유일한 방법이었다. 트래픽이 없으면 머신이 멈추고, 요청이 오면 자동으로 깨어난다.

**실측** — 유휴 약 8분이면 `stopped` 로 내려간다. 정지 상태에서 첫 요청은 **7.38초**
(콜드스타트 포함), 깨어난 뒤 재요청은 **41ms**.

Fly 대시보드가 이 상태를 `Suspended` 로 표시한다 — 과금 정지가 아니라 정상 동작이다.

**⚠️ `fly deploy` 는 기본으로 머신을 2개 만든다**(HA). `min_machines_running = 0` 은
"몇 개를 켜 둘 것인가"이고 머신 **개수**는 `fly scale count` 가 정한다. 목표 구성이
컨테이너 1개이므로 배포 후 `fly scale count 1` 로 줄였다. 재배포 때 다시 늘어나는지
확인할 것.

### 3.2 컨테이너 이미지

2단계 빌드. builder 에서 `npm ci` + `tsc`, runtime 에는 prod 의존성만.

런타임 단계가 복사하는 것 — `dist`, `migrations`, `scripts`, `public`, **`certs`**.

**⚠️ `certs` 를 빼면 프로덕션 DB 연결이 통째로 실패한다.** 4.2절 참조. Phase 2 에서
빠뜨렸다가 배포 직전에 잡았다.

`data/`(「탁류」 원문 970KB)는 제외한다 — 배치 파이프라인에서만 쓰고 API 서버 런타임에는
필요 없다. 배치는 로컬에서 Supabase 를 향해 돌린다.

`USER node` 로 비루트 실행. `0.0.0.0` 바인딩을 명시했다 — 컨테이너에서 루프백에만 붙으면
프록시가 도달하지 못하고 **헬스체크만 계속 실패하는** 형태로 조용히 깨진다.

### 3.3 헬스체크

`GET /health`, 30초 간격, timeout 5초, grace 10초. DB·LLM 을 건드리지 않는 순수 응답이라
깨우기 비용이 싸다.

### 3.4 시크릿

`fly secrets` 로만 주입한다. 이미지에 굽지 않고 저장소·문서에 값을 남기지 않는다.

| 이름 | 용도 |
| --- | --- |
| `ANTHROPIC_API_KEY` | LLM |
| `ANTHROPIC_WORKSPACE_ID` | **identity-linked 키에 필수** — 5.1절 |
| `COHERE_API_KEY` | 임베딩 |
| `DATABASE_URL` | Supabase Session pooler URL |
| `CORS_ORIGIN` | `https://ssabi-d4c.pages.dev` |

`fly.toml` 의 `[env]` 에는 비밀이 아닌 `NODE_ENV=production` 과 `PORT=3000` 만 둔다.
`MOCK_MODE` 는 설정하지 않는다 — 켜지면 챗봇이 실제 기준점 대신 고정 K 를 써서 상한 게이트
검증이 무의미해진다.

### 3.5 CORS

`CORS_ORIGIN` 을 쉼표로 나눠 허용 목록을 만들고, `Origin` 헤더와 **정확히 일치**할 때만
`Access-Control-Allow-Origin` 에 그 오리진을 실어 보낸다(끝 슬래시를 붙이면 안 된다).
함께 `Vary: Origin` 을 보낸다 — 없으면 CDN 이 한 오리진의 응답을 다른 오리진에 재사용해
산발적으로 깨진다. 목록에 없으면 CORS 헤더를 **아예 붙이지 않아** 브라우저가 차단한다.

AWS 구성에서는 CloudFront 하나가 `/`(S3)와 `/api`(ALB)를 함께 서빙해 같은 오리진이었으므로
CORS 가 사실상 무의미했고 `*` 로 열려 있었다. 이제 프론트와 백엔드가 다른 오리진이라
실제로 동작하는 설정이 됐다.

**미등록 — Pages 프리뷰 도메인.** 브랜치·커밋별 프리뷰 URL은 허용 목록에 없어 차단된다.
필요해지면 쉼표로 추가한다.

---

## 4. 데이터 — Supabase PostgreSQL + pgvector

20개 테이블, 「탁류」 411페이지 전량 임베딩(1024차원, 누락 0건), HNSW 인덱스.

### 4.1 접속 — Session pooler

**⚠️ 직접 연결 문자열을 쓰면 안 된다.** Supabase 직접 연결은 IPv6 전용이라 IPv4 환경에서
호스트명 해석이 실패한다. Session pooler 를 쓰며, 사용자명이 `postgres.<프로젝트ID>`
형식인 점이 다르다.

**transaction 모드(6543)가 아니라 session 모드(5432)를 쓴다.** transaction 모드는 매
트랜잭션마다 다른 백엔드 연결을 배정해 prepared statement 가 깨진다
(`prepared statement "..." does not exist`). pg 드라이버가 파라미터 쿼리를 unnamed
prepared statement 로 보내 대체로 안전하지만, **조용히 깨지는 종류의 실패**라 모드를
어긋내지 않는다.

**커넥션 풀 상한 5**(`DB_POOL_MAX`, 기본값). RDS 시절의 20을 그대로 쓰면 안 된다 —
Supabase 는 동시 연결 상한이 낮고, 실행 단위도 PM2 클러스터 2 프로세스에서 컨테이너
1개로 줄어 프로세스당 풀을 키울 이유가 없어졌다(예전엔 20 × 2 = 40이 떴다).

### 4.2 SSL — 자체 루트 CA를 신뢰 대상으로 명시한다

`NODE_ENV=production` 이면 `rejectUnauthorized: true` 로 인증서를 검증한다.

**Supabase 는 공인 CA 를 쓰지 않는다.** 체인이 `*.pooler.supabase.com` →
`Supabase Intermediate 2021 CA` → `Supabase Root 2021 CA`(self-signed)로, Node 기본
신뢰 저장소로는 `SELF_SIGNED_CERT_IN_CHAIN` 이 난다.

그래서 루트 CA 를 `backend/certs/supabase-root-2021-ca.crt` 에 넣고 **신뢰 대상으로
명시**한다. 검증을 끄는(`rejectUnauthorized: false`) 대신 신뢰 범위를 이 CA 하나로 좁히는
방식이라 **공인 CA 검증보다 오히려 엄격하다** — 다른 어떤 CA 가 서명한 인증서도 거부한다.

지문 `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`,
유효기간 2021-04-28 ~ **2031-04-26**.

**⚠️ 이 파일이 이미지에 없으면 `loadDbCa()` 가 `undefined` 를 돌려 기본 신뢰 저장소로
폴백하고, 그 결과 DB 연결이 전부 실패한다.** 조용히 검증을 건너뛰지 않는다는 뜻이라
이게 맞는 동작이다. Dockerfile 의 `COPY certs ./certs` 가 이 조항을 지킨다.

---

## 5. 외부 API

### 5.1 Anthropic — 리캡·챗봇

모델 `claude-haiku-4-5` (`ANTHROPIC_MODEL` 로 오버라이드 가능). 폴백 없이 재시도만 한다.

**⚠️ 날짜 접미사를 붙이면 안 된다.** Bedrock 시절엔
`global.anthropic.claude-haiku-4-5-20251001-v1:0` 처럼 리전 접두사·날짜·버전이 붙었지만
Anthropic API 의 정식 ID 는 `claude-haiku-4-5` 하나로 완결돼 있다.
`claude-haiku-4-5-20251001` 은 존재하지 않는 ID다.

**⚠️ `ANTHROPIC_WORKSPACE_ID` 헤더.** identity-linked 키는 이 헤더 없이는 `/v1/models` 를
포함한 **모든 엔드포인트가 400** 이다. SDK 가 인증·버전·content-type 은 자동으로 붙이지만
이건 안 붙인다. 키의 워크스페이스 범위를 Default 로 바꿔도 소용없다 — identity-linked 는
범위가 아니라 **발급 방식의 속성**이다. `gateway.ts` 가 값이 있을 때만 헤더를 싣는
조건부 배선이라, 워크스페이스에 묶인 일반 키를 쓸 때는 비워 둬야 한다(넣으면 깨진다).

**분당 3회 제한**(NFR-AI-017)이 살아 있다 — 연속 질의 시 429 와 `retry_after` 를 돌려준다.

### 5.2 Cohere — 임베딩

모델 `embed-v4.0`, 출력 **1024차원**. Titan 과 차원을 맞춰 **재임베딩만으로 이전이
끝났다** — 달랐다면 HNSW 인덱스와 스키마까지 손봐야 했다.

용도별로 `input_type` 을 나눈다(적재용 문서 / 검색 질의). 배치 적재는 구조적 상한(96건)
보다 **토큰 유량 한도가 먼저 걸린다** — `COHERE_TPM_LIMIT` 기본 100,000 TPM.

---

## 6. 배포 파이프라인

| 대상 | 트리거 | 수행 |
| --- | --- | --- |
| 프론트 | `chore/migrate-off-aws` push | Cloudflare Pages Git 연동이 빌드·배포 |
| 백엔드 | `main` push + `backend/**` 변경 | `.github/workflows/deploy-backend.yml` → `flyctl deploy --remote-only` |
| 프론트 CI | `main` push | `ci-frontend.yml` — 빌드·테스트만, 배포하지 않음 |

백엔드 워크플로는 배포 전에 **타입체크와 테스트를 게이트로 둔다** — 스포일러 차단이 이
프로젝트의 본질이므로 게이트 테스트가 깨진 채로 배포하지 않는다.

**⚠️ `FLY_API_TOKEN` 미등록.** 자동 배포가 아직 연결되지 않았다. 현재 떠 있는 이미지는
로컬에서 `fly deploy` 로 올린 것이다. 발급은
`fly tokens create deploy -x 999999h --app ssabi-api`, 등록은 저장소 Settings →
Secrets and variables → Actions.

앱의 런타임 비밀값은 GitHub 에 두지 않는다 — `fly secrets` 에 직접 넣고 배포가 물려받는다.

---

## 7. 비용

**유휴 시 월 $0.1 안팎.**

| 항목 | 근거 |
| --- | --- |
| 정지된 머신 | CPU·RAM 과금 없음. rootfs 스토리지만 GB당 월 $0.15 → 53MB ≈ **$0.01** |
| 가동 중 | `shared-cpu-1x` 256MB 상시 기준 월 약 $2. 스케일-투-제로라 깨어 있는 동안만 |
| 볼륨 | **없다.** 정지 상태에서도 계속 청구되는 유일한 항목인데 이 구성은 해당 없음 |
| IPv4 | 공유라 무료 |
| Cloudflare Pages | 정적 자산 서빙 |
| Supabase | 무료 등급 |
| Anthropic · Cohere | 사용량 기반 |

**⚠️ Fly 는 카드 등록이 필수다.** Linked Organization 을 제외한 모든 조직이 카드를
요구하며, 2024년에 영구 무료 티어가 없어졌다. "유휴 시 과금 없음"은 정확히는
**"유휴 시 컴퓨트 과금 없음"** 이다.

이전 전 AWS 비용의 실측치는 확보하지 못했다 — 계정이 Organizations 멤버였고 상위 SCP 가
`ce:GetCostAndUsage` 를 명시적으로 거부했다. **추정치를 실측치처럼 적지 않는다.**
과금 대상 리소스 목록은 [`architecture-aws.md`](architecture-aws.md) 7장에 있다.

---

## 8. 실측 성능 (2026-09-01)

| 항목 | 값 |
| --- | --- |
| `/health` (깨어 있음) | 41ms |
| `/health` (71분 유휴 후) | **7,380ms** — 콜드스타트 포함 |
| 콜드스타트 (머신 도달) | 5.37초 |
| `/books` (Supabase 관통) | 2,076ms |
| SSE 청크 간격 | **304ms** (서버 발신 300ms) — 버퍼링 없음 |
| 리캡 (cutoff=50) | 첫 delta 2,072ms, delta 18개 / 437자, 총 7,463ms |
| 리캡 (cutoff=400, 최악) | 입력 **19,227 토큰**, 출력 373, LLM 5,536ms |
| 256MB OOM | **없음** — 위 최악 조건 통과 |

**SSE 버퍼링이 이번 이전의 최대 미지수였고 통과했다.** AWS 구성은 nginx
`proxy_buffering off` 와 CloudFront TTL 0 **두 계층**에 의존해 겨우 흘렸는데, Fly 프록시는
별도 설정 없이 기본값으로 흘린다. 코드가 보내는 `X-Accel-Buffering: no` 헤더를 Fly 는
읽지 않지만 애초에 필요가 없었다.

**콜드스타트 7.4초가 스케일-투-제로의 대가다.** 다만 프론트가 엣지에서 정적으로 즉시
서빙되므로 방문자 체감은 "빈 화면 7초"가 아니라 "화면은 즉시, 데이터가 7초 뒤"다.

---

## 9. AWS 구성에서 달라진 것

| | 이전 (AWS) | 이후 |
| --- | --- | --- |
| 상시 가동 | EC2 ×2, RDS Multi-AZ, ALB, EIP ×2 | **없음** |
| 계층 격리 | 보안 그룹 3단 사슬 (ALB→EC2→RDS) | 관리형 서비스 경계 + CORS 허용 목록 |
| 관리 접근 | SSM (포트 개방 없음) | `flyctl` (Fly 인증) |
| 리버스 프록시 | nginx (`/api` 접두사 제거, 버퍼링 off) | 없음 — Fly 프록시가 컨테이너에 직결 |
| 프로세스 관리 | PM2 클러스터 2 | 컨테이너 1 (Fly 머신이 재시작 담당) |
| DB 이중화 | Multi-AZ | 단일 (Supabase 관리형) |
| 배포 | S3 + SSM RunCommand + PM2 재시작 | 이미지 빌드 + 머신 교체 |

**없어진 것 중 의식적으로 포기한 것** — DB 이중화와 무중단 배포다. 포트폴리오 트래픽에서
얻는 값어치보다 비용·복잡도가 크다. 무중단 배포는 `fly scale count 2` 로 언제든 되돌릴 수
있다.

**새로 생긴 제약** — 롤백할 AWS 환경이 없다. 2026-08-31 에 교육 과정 관리자가 리소스를
내렸고 자격증명도 무효화됐다. 로컬 백업(`backup/ssabi.dump` 2.8MB, S3 객체 14개, 구성
JSON 21개)이 유일본이지만, **Supabase 가 이미 정본**이라 덤프 없이도 서비스가 돈다.

---

## 10. 알려진 제약과 다음 과제

| 항목 | 상태 |
| --- | --- |
| `FLY_API_TOKEN` | 미등록 — `main` push 자동 배포 미연결 |
| Pages 프로덕션 브랜치 | `chore/migrate-off-aws`. main 병합 후 변경 필요 |
| `frontend/.nvmrc` | 미적용 — `NODE_VERSION` 이 대시보드에만 있어 재생성 시 유실 |
| Pages 프리뷰 도메인 | `CORS_ORIGIN` 미등록 — 프리뷰 배포에서 API 차단됨 |
| 세션 종료 스위퍼 | **미가동** — 배선 없음. 저장 리캡(R7)이 생성되지 않는다 (`architecture-r1.md` 4.4.1 정정) |
| NFR-SEC-006 인젝션 10건 | 미검증 — 별도 시나리오 문서 필요 |
| `fly scale count` | 재배포 시 머신이 2개로 늘어나는지 미확인 |
| Supabase 무료 등급 한도 | 프로젝트 일시 정지 조건·백업 정책 미확인 |

마지막 두 줄은 **확인하지 못한 것**이지 문제가 없다는 뜻이 아니다.
