# Re:Add — 싸비

**읽은 데까지만 아는 독서 보조 시스템**

[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)](https://www.typescriptlang.org/)

**라이브 데모 — <https://ssabi-d4c.pages.dev>**

> 백엔드가 스케일-투-제로로 떠 있어 **첫 요청이 약 7초** 걸린다(유휴 상태에서 컨테이너를
> 깨우는 시간). 이후 요청은 수십 ms다. 데모 작품은 채만식 「탁류」 1권이다.

---

## 무엇을 하는 서비스인가

전자책을 읽다 보면 앞 내용이 기억나지 않는다. 그렇다고 줄거리 요약을 찾아보면
**아직 안 읽은 부분까지 쏟아진다.**

싸비는 읽기 화면 옆에 붙는 사이드바다. 리캡·인물 관계도·챗봇 세 탭을 제공하되,
**독자가 마지막으로 열어본 페이지까지만** 안다.

| 탭 | 하는 일 |
| --- | --- |
| 리캡 | 기준점까지의 줄거리를 LLM 1회로 종합. 스트리밍으로 흘린다 |
| 인물 관계도 | 등장이 확립된 시점까지의 인물·관계만 표시 |
| 챗봇 | 근거 기반 질의응답. 근거가 없으면 이유를 판별하지 않고 항상 같은 문구로 답한다 |

2026년 8월 해커톤 산출물이며(7팀 중 대상), 발표 후 포트폴리오로 유지하기 위해
인프라를 AWS 밖으로 이전했다.

---

## 이 저장소에서 볼 만한 것 — 스포일러를 "구조로" 막는다

이 시스템의 존재 이유는 **읽지 않은 부분을 절대 노출하지 않는 것**이다. 기능이 잘
동작해도 스포일러가 한 건 새면 실패다. 그래서 릴리스 게이트 29개 중 절반 이상이
이 하나에 걸려 있다.

핵심은 "숨기는 코드"를 만들지 않는 것이다.

> **기준점 초과 여부를 "판별"하는 코드를 만들지 않는다.**
> 시스템의 어느 경로도 기준점 초과 데이터에 **접근하지 않으므로**, 판별할 능력 자체가
> 없어야 한다. 그게 이 조항이 성립하는 방식이다.

구체적으로 이런 규칙들이 코드 전반에 걸려 있다.

- 조회·조립 함수는 **cutoff 인자 없이** 저장소에 접근할 수 없다
- 상한은 **데이터 선택 단계**에서만 건다 — 조회는 쿼리 조건, 리캡은 입력 절단,
  챗봇은 근거 조립 범위. **프롬프트 지시로 상한을 걸지 않는다**
- 기준점을 파생하는 함수는 하나뿐이고, 프론트 포함 어디서도 `%`나 cutoff 를
  다시 계산하지 않는다
- 상한 필터를 **우회하는 폴백 경로를 두지 않는다** — 실패하면 미노출이 원칙이다

전체 목록과 근거는 [CLAUDE.md](CLAUDE.md) 2·4장에 있다.

**한계도 적어 둔다.** 「탁류」는 공개 도메인 유명 작품이라 모델이 줄거리를 이미 알 수
있다. 근거에서 빼도 자기 기억으로 답할 가능성이 남으며 **구조로 막지 못한다.**
프롬프트 규칙이 유일한 수단이고 100% 보장이 아니다.

---

## 아키텍처

```
방문자
  ├─ 정적 자산 ──► Cloudflare Pages
  └─ API (SSE) ──► Fly.io (도쿄, 컨테이너 1개, 스케일-투-제로)
                      ├─► Supabase PostgreSQL + pgvector
                      ├─► Anthropic API (claude-haiku-4-5)
                      └─► Cohere (embed-v4.0, 1024차원)
```

상시 가동 자원이 없다. 방문이 없으면 컨테이너가 정지하고 그 시간에 컴퓨트 과금이
붙지 않는다. 콜드스타트 약 7초가 그 대가다.

원래는 EC2 2대 + Multi-AZ RDS + ALB + Elastic IP 2개가 전부 상시 가동이었다.
발표가 끝난 뒤 이 구조를 유지할 이유가 사라져 옮겼다 —
**같은 동작을, 상시 과금 없이, 언제든 접근 가능한 상태로**가 목표였다.

| 계층 | 이전 | 이후 |
| --- | --- | --- |
| 정적 프론트 | S3 + CloudFront | Cloudflare Pages |
| 백엔드 | EC2 ×2 + ALB + nginx + PM2 | Fly.io 컨테이너 1개 |
| DB | RDS PostgreSQL Multi-AZ | Supabase PostgreSQL |
| LLM | Amazon Bedrock | Anthropic API |
| 임베딩 | Titan Embed v2 (1024) | Cohere embed-v4 (1024) |

이전 과정에서 내린 판단과 겪은 문제는 [docs/migration.md](docs/migration.md)에
Phase 별로 기록했다 — SSE 버퍼링, 임베딩 차원, Supabase 자체 루트 CA, 콜드스타트
실측 같은 것들이다.

---

## 기술 스택

**Backend** — Node.js 22 · TypeScript · Express · PostgreSQL + pgvector
**Frontend** — React 18 · TypeScript · Vite · Tailwind CSS · React Router
**Infra** — Docker · Fly.io · Cloudflare Pages · GitHub Actions

---

## 로컬에서 실행하기

Node 20 이상이 필요하다.

```bash
# Backend
cd backend
npm install
cp .env.example .env      # DATABASE_URL·API 키 입력
npm run dev               # http://localhost:3000

# Frontend (별도 터미널)
cd frontend
npm install
cp .env.example .env      # VITE_API_URL 확인
npm run dev               # http://localhost:5173
```

`backend/.env.example` 과 `frontend/.env.example` 에 각 값의 의미와 함정이 주석으로
적혀 있다. 특히 **`VITE_API_URL` 에 `/api` 접두사를 붙이면 전 요청이 404** 가 된다 —
예전 CloudFront 구성의 잔재다.

DB 없이 화면만 보려면 `frontend/.env` 에 `VITE_USE_MOCK=true` 를 둔다.

```bash
npm test          # 각 디렉터리에서
npx tsc --noEmit
```

---

## 문서

| 문서 | 내용 |
| --- | --- |
| [CLAUDE.md](CLAUDE.md) | 절대 규칙·시스템 불변식 R1~R12·용어. **가장 먼저 읽을 문서** |
| [docs/architecture/architecture-r1.md](docs/architecture/architecture-r1.md) | 논리·앱·데이터 아키텍처 (설계 1회차) |
| [docs/architecture/architecture-r2.md](docs/architecture/architecture-r2.md) | 이전 전 배포 설계 — 의도. 현재 무효이나 판단 근거로 보존 |
| [docs/architecture/architecture-aws.md](docs/architecture/architecture-aws.md) | 이전 전 인프라 실측 기록 |
| [docs/architecture/architecture-current.md](docs/architecture/architecture-current.md) | **현재 인프라 구성** |
| [docs/migration.md](docs/migration.md) | 이전 과정과 판단 근거 |

기획 단계 산출물(PRD·유스케이스·FR/NFR·개발 명세)은 `docs` 브랜치에 있다.

---

## 팀

2026년 8월 해커톤 4인 팀으로 만들었다.

| 파트 | 담당 | 책임 |
| --- | --- | --- |
| R1 | 권희준 | 데이터·전처리 파이프라인 |
| R2 | 진승호 | 독서 상태·기준점·리캡 |
| R3 | 이예나 | AI 경로·LLM 게이트웨이·챗봇 |
| R4 | 양예모 | 프론트엔드·조회 API |

발표 이후의 AWS 이탈 이전은 양예모가 단독으로 진행했다.
