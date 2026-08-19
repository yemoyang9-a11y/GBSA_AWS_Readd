# 싸비(Reading Recap) — 기술 스택 & 환경 구성

**버전**: v1.0  
**최종 확정**: 2026-08-19  
**팀 확정 사항**: CP0 완료

---

## 📋 목차

1. [프로젝트 개요](#프로젝트-개요)
2. [확정된 기술 스택](#확정된-기술-스택)
3. [아키텍처 다이어그램](#아키텍처-다이어그램)
4. [개발 환경 세팅](#개발-환경-세팅)
5. [프로젝트 구조](#프로젝트-구조)
6. [파트별 담당 및 의존성](#파트별-담당-및-의존성)
7. [AWS 리소스 목록](#aws-리소스-목록)
8. [체크포인트 및 일정](#체크포인트-및-일정)

---

## 📌 프로젝트 개요

**프로젝트명**: 싸비(Reading Recap)  
**목적**: 전자책 독자를 위한 진도 인식 사이드바 (스포일러 완전 차단)  
**데모**: 채만식 「탁류」 1권, 태블릿 PC 우선 반응형 웹앱  
**발표일**: 2026-08-28

### 핵심 컨셉
- 독자가 **읽은 페이지까지만** 정보 제공
- 기준점(cutoff) = 현재 페이지 - 1
- 스포일러 누설 0건이 최우선 목표

---

## 🛠️ 확정된 기술 스택

### Backend

```yaml
언어/런타임: Node.js 20 LTS + TypeScript 5
웹 프레임워크: Express.js 4.x
패키지 매니저: npm
```

### Database

```yaml
관계형 DB: Amazon RDS PostgreSQL 15
벡터 확장: pgvector 0.5+
임베딩 차원: 1024 (Amazon Titan Text Embeddings V2)
```

**왜 PostgreSQL + pgvector?**
- 단일 SQL로 벡터 검색 + 필터링 완료
- 관계형 데이터와 벡터 데이터 통합 관리
- 팀원 모두 익숙한 SQL 사용

### AI/LLM

```yaml
LLM 제공자: Amazon Bedrock
모델:
  - Claude Sonnet 4.5: us.anthropic.claude-sonnet-4-5-20250929-v1:0
  - Claude Haiku 4.5: us.anthropic.claude-haiku-4-5-20251001-v1:0
임베딩 모델: Amazon Titan Text Embeddings V2 (amazon.titan-embed-text-v2:0)
```

### Frontend (R4 담당)

```yaml
프레임워크: React 18 + TypeScript
빌드 도구: Vite
스타일링: Tailwind CSS (또는 팀 협의)
그래프 라이브러리: React Flow 또는 Cytoscape.js (관계도용)
```

### DevOps & Infrastructure

```yaml
클라우드: AWS
컴퓨트:
  - API 서버: EC2 (t3.medium)
  - 스위퍼: EventBridge + Lambda
  - 파이프라인: EC2에서 수동 스크립트 실행
스토리지: S3 (원문 파일)
프로세스 관리: PM2
웹 서버: Nginx (리버스 프록시)
배포: Git + SSH (또는 GitHub Actions)
```

### 개발 도구

```yaml
버전 관리: Git + GitHub
코드 포맷터: Prettier
린터: ESLint
테스트: Jest
API 문서: (선택) Swagger/OpenAPI
```

---

## 🏗️ 아키텍처 다이어그램

### 전체 시스템 구조

```
┌─────────────────────────────────────────────────────────┐
│                  Frontend (React)                       │
│              태블릿 PC 우선 반응형                        │
└────────────────────┬────────────────────────────────────┘
                     │ HTTPS / SSE
┌────────────────────▼────────────────────────────────────┐
│                   Nginx                                 │
│              (리버스 프록시)                              │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│           Backend (EC2 - t3.medium)                     │
│         모듈러 모놀리스 (Node.js + TypeScript)           │
│                  PM2로 프로세스 관리                      │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │ ① 콘텐츠  │  │ ② 독서    │  │ ③ 싸비    │             │
│  │   조회   │  │   상태    │  │   조회    │             │
│  │  (R4)   │  │  (R2)    │  │  (R4)    │             │
│  └──────────┘  └──────────┘  └──────────┘             │
│                     ▲                                   │
│  ┌──────────┐  ┌───┴──────┐  ┌──────────┐             │
│  │ ④ 리캡    │  │ ⑤ 챗봇    │  │ ⑥ LLM    │             │
│  │  서비스   │  │  서비스   │  │ 게이트웨이 │             │
│  │  (R2)    │  │  (R3)    │  │  (R3)    │             │
│  └──────────┘  └──────────┘  └──────────┘             │
└────────────────────┬────────────────────────────────────┘
                     │
      ┌──────────────┼──────────────┐
      │              │              │
┌─────▼─────┐  ┌────▼────┐  ┌─────▼─────┐
│    RDS    │  │ Bedrock │  │    S3     │
│PostgreSQL │  │ (Claude)│  │  원문 저장 │
│+ pgvector │  │         │  │           │
└───────────┘  └─────────┘  └───────────┘

┌──────────────────────────────────────────────────────────┐
│           별도 실행 단위 (배치/스케줄)                     │
│                                                           │
│  ⑦ 콘텐츠 파이프라인 (R1)    ⑧ 세션 종료 스위퍼 (R2)      │
│     EC2 수동 스크립트            Lambda (1분 주기)        │
└──────────────────────────────────────────────────────────┘
```

### 배포 단위

```
1개 배포 단위 (모듈러 모놀리스):
  - API 서버 (EC2, PM2로 실행)
  - 컴포넌트 ①~⑥ 모두 포함

2개 실행 단위:
  - 세션 종료 스위퍼 (EventBridge + Lambda)
  - 콘텐츠 파이프라인 (EC2에서 스크립트 수동 실행)
```

---

## 💻 개발 환경 세팅

### 사전 요구사항

- **Node.js**: 20 LTS 이상
- **Git**: 2.x 이상
- **AWS CLI**: 2.x (배포 시)
- **Docker**: 선택사항 (로컬 PostgreSQL 실행용)
- **PostgreSQL 클라이언트**: psql (선택사항)

### 로컬 환경 구축

#### 1. 저장소 클론

```bash
git clone https://github.com/your-org/ssabi-backend.git
cd ssabi-backend
```

#### 2. 의존성 설치

```bash
npm install
```

#### 3. 환경 변수 설정

```bash
# .env 파일 생성
cp .env.example .env

# .env 파일 편집 (각자의 AWS 키 입력)
```

**.env 예시:**

```bash
# Database
DATABASE_URL=postgresql://ssabi:dev123@localhost:5432/ssabi

# AWS
AWS_REGION=ap-northeast-2
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key

# Bedrock Models
BEDROCK_EMBED_MODEL=amazon.titan-embed-text-v2:0
BEDROCK_CLAUDE_SONNET=us.anthropic.claude-sonnet-4-5-20250929-v1:0
BEDROCK_CLAUDE_HAIKU=us.anthropic.claude-haiku-4-5-20251001-v1:0

# Server
PORT=3000
NODE_ENV=development
```

#### 4. 데이터베이스 연결

**Option A: 개발용 RDS 공유 (추천 ⭐)**

```bash
# .env에 팀 공유 RDS 주소 입력
DATABASE_URL=postgresql://admin:password@ssabi-dev.xxx.rds.amazonaws.com:5432/ssabi
```

**Option B: 로컬 PostgreSQL (Docker)**

```bash
# Docker로 로컬 PostgreSQL 실행
docker run -d --name pgvector \
  -e POSTGRES_USER=ssabi \
  -e POSTGRES_PASSWORD=dev123 \
  -e POSTGRES_DB=ssabi \
  -p 5432:5432 \
  pgvector/pgvector:pg15

# .env 설정
DATABASE_URL=postgresql://ssabi:dev123@localhost:5432/ssabi
```

**Option C: 로컬 PostgreSQL (직접 설치)**

```bash
# macOS
brew install postgresql@15
brew services start postgresql@15

# Ubuntu
sudo apt install postgresql-15 postgresql-15-pgvector
sudo systemctl start postgresql

# pgvector 확장
psql -U postgres
CREATE EXTENSION vector;
```

#### 5. DB 초기화

```bash
# 스키마 생성
npm run db:migrate

# 시드 데이터 적재
npm run db:seed
```

#### 6. 개발 서버 실행

```bash
# 개발 모드 (hot reload)
npm run dev

# 빌드
npm run build

# 프로덕션 모드
npm start
```

#### 7. 헬스 체크

```bash
curl http://localhost:3000/health
# 응답: {"status":"ok"}
```

---

## 📁 프로젝트 구조

```
ssabi-backend/
├── src/
│   ├── index.ts                        # 앱 진입점
│   ├── config/
│   │   ├── database.ts                 # PostgreSQL 연결
│   │   └── aws.ts                      # AWS SDK 클라이언트
│   │
│   ├── modules/
│   │   ├── content/                    # ① 콘텐츠 조회 (R4)
│   │   │   ├── service.ts
│   │   │   └── repository.ts
│   │   │
│   │   ├── reading-state/              # ② 독서 상태 (R2)
│   │   │   ├── cutoff.service.ts       # ⭐ 기준점 결정기
│   │   │   ├── progress.service.ts
│   │   │   └── session.service.ts
│   │   │
│   │   ├── ssabi/                      # ③ 싸비 조회 (R4)
│   │   │   ├── graph.service.ts        # 관계도 조립
│   │   │   └── character.service.ts
│   │   │
│   │   ├── recap/                      # ④ 리캡 서비스 (R2)
│   │   │   ├── assembly.service.ts
│   │   │   └── stream.service.ts
│   │   │
│   │   ├── chatbot/                    # ⑤ 챗봇 서비스 (R3)
│   │   │   ├── service.ts
│   │   │   ├── context-assembly.ts     # 근거 조립
│   │   │   ├── vector-search.ts        # 벡터 검색
│   │   │   └── difficulty-router.ts    # 난이도 분기
│   │   │
│   │   └── llm-gateway/                # ⑥ LLM 게이트웨이 (R3)
│   │       ├── gateway.ts              # 핵심 게이트웨이
│   │       ├── bedrock-client.ts
│   │       ├── retry.ts
│   │       └── rate-limiter.ts
│   │
│   ├── batch/                          # 배치 작업
│   │   ├── pipeline/                   # ⑦ 콘텐츠 파이프라인 (R1)
│   │   │   ├── split.ts                # 페이지 분할
│   │   │   ├── generate.ts             # 생성 6종
│   │   │   └── review.ts               # 검수
│   │   │
│   │   └── sweeper/                    # 세션 종료 스위퍼 (R2)
│   │       └── handler.ts              # Lambda 핸들러
│   │
│   ├── api/
│   │   └── routes.ts                   # API 라우트
│   │
│   ├── shared/
│   │   ├── types.ts                    # 공통 타입 정의
│   │   ├── constants.ts                # 상수
│   │   └── logger.ts                   # 로깅
│   │
│   └── utils/
│       ├── embeddings.ts               # 임베딩 헬퍼
│       └── validation.ts               # 검증
│
├── tests/                              # 테스트
│   ├── unit/
│   └── integration/
│
├── migrations/                         # DB 마이그레이션
│   └── 001_init.sql
│
├── seeds/                              # 시드 데이터
│   └── dev_data.sql
│
├── .env.example                        # 환경 변수 템플릿
├── .gitignore
├── docker-compose.yml                  # 로컬 개발 환경
├── Dockerfile                          # 프로덕션 빌드
├── package.json
├── tsconfig.json
└── README.md
```

---

## 👥 파트별 담당 및 의존성

### R1 — 데이터·파이프라인 (크리티컬 패스)

**담당**: 콘텐츠 파이프라인 ⑦

**책임**:
- 원문 등록 및 페이지 분할 (700~1400자)
- 생성 6종 순차 실행 (장 요약, 인물, 관계, 배경지식, 용어, 사건)
- 임베딩 배치 적재 (페이지 = 청크, 1:1)
- 검수 및 공개 전환

**의존성**:
- **R3의 LLM 게이트웨이** (8/19 오전 필요) → 생성 6종이 게이트웨이 경유 필수

**제공**:
- 시드 데이터 (R2, R3, R4가 개발용으로 사용)
- 실데이터 (8/21)
- 성능 예산 입력: 가장 긴 장의 원문 크기 (R3에게 전달)

---

### R2 — 코어 상태·리캡 (시스템의 축)

**담당**: 독서 상태 ② + 리캡 서비스 ④ + 세션 종료 스위퍼

**책임**:
- ⭐ **기준점 결정기** (시스템의 유일한 계산 지점)
- 진도 이벤트 처리 + seq 순서 보장
- 세션 종료 스위퍼 (30분 무조작, 1분 주기)
- 리캡 입력 조립 + LLM 호출

**의존성**:
- **R3의 LLM 게이트웨이** (8/20 필요)
- R1의 시드 데이터 (8/19)

**제공**:
- **기준점 스냅샷 인터페이스** (8/19 오전 최우선) → R3, R4가 대기 중
  ```typescript
  getCutoffSnapshot(deviceId, bookId) -> { 
    current_page, cutoff, percent, chapter 
  }
  ```

---

### R3 — AI 경로 (게이트 밀도 최고)

**담당**: 챗봇 서비스 ⑤ + LLM 게이트웨이 ⑥

**책임**:
- ⚡ **LLM 게이트웨이** (모든 LLM 호출이 경유)
- 챗봇 근거 조립기 (질의 텍스트는 범위에 관여 불가)
- 벡터 검색 + 사전 필터 (`WHERE page_no <= K`)
- 인젝션 방어 10종 테스트

**의존성**:
- **R2의 기준점 스냅샷** (8/19 시그니처만 받으면 스텁으로 진행 가능)
- R1의 임베딩 데이터 (8/21)

**제공**:
- **최소 게이트웨이** (8/19 오전) → R1, R2가 대기 중
  ```typescript
  call(task: string, prompt: string) -> response
  stream(task: string, prompt: string) -> AsyncGenerator
  ```

---

### R4 — 프론트엔드·조회

**담당**: 프론트엔드 전체 + 콘텐츠 조회 ① + 싸비 조회 ③

**책임**:
- 화면 4종 (대시보드, 브리핑, 읽기, 싸비 사이드창)
- 조회 API (카탈로그, 페이지, 관계도 JSON)
- SSE 스트리밍 렌더링
- ⚠️ **프론트는 파생값 재계산 금지** (서버 값 그대로 렌더)

**의존성**:
- R2의 진입 판정, 진도, 브리핑 API
- R3의 챗봇 SSE API
- R1의 시드 데이터

**제공**:
- CP3(8/21)에서 **관통 책임** (대시보드 → 브리핑 → 읽기 → 싸비)

---

## ☁️ AWS 리소스 목록

### 필수 리소스

| 서비스 | 용도 | 사양 | 비용 (월) |
|--------|------|------|----------|
| **RDS PostgreSQL** | 메인 DB + pgvector | db.t4g.small (2vCPU, 2GB) | ~$30 |
| **EC2** | API 서버 | t3.medium (2vCPU, 4GB) | ~$30 |
| **Lambda** | 세션 종료 스위퍼 | 128MB, 1분 주기 | ~$1 |
| **S3** | 원문 파일 저장 | Standard | ~$1 |
| **Bedrock** | Claude + Titan | 종량제 | 사용량 기반 |
| **EventBridge** | 스케줄러 (1분 주기) | - | ~$1 |

**예상 월 비용**: ~$63 + LLM 호출 비용

### 선택 리소스

| 서비스 | 용도 | 비고 |
|--------|------|------|
| **ElastiCache Redis** | 세션 캐시 | 성능 개선 시 |
| **CloudWatch** | 로그 집계 | 기본 제공 |
| **Elastic IP** | 고정 IP | EC2 재시작 시 IP 유지 |
| **Route 53** | DNS 관리 | 도메인 사용 시 |

### 리전 선택

**확정**: `ap-northeast-2` (서울)
- Bedrock Claude 모델 사용 가능 (확인 필요)
- 낮은 레이턴시 (한국 사용자)
- 데이터 주권 고려

---

## 📅 체크포인트 및 일정

### CP0 (8/19 오전) — 계약 동결

**통과 조건**:
- ✅ 스택 확정 (이 문서)
- ✅ 2장 계약 동결 (공통 계약 문서)
- ✅ 시드 데이터 적재
- ✅ **R3**: 최소 게이트웨이 시그니처 공개
- ✅ **R2**: 기준점 스냅샷 시그니처 공개

### CP1 (8/19 저녁) — 분할 실측

**통과 조건**:
- ✅ **R1**: 분할 실측 3건 보고 (페이지 수, 분포, 최대 크기)
- 페이지 크기 확정 (700~1400자 또는 조정)

### CP2 (8/20 저녁) — 경로별 단독 동작

**통과 조건**:
- ✅ **R2**: 진도 이벤트 → cutoff 갱신
- ✅ **R3**: 챗봇 근거 조립 → 응답 (시드 기준)
- ✅ **R4**: 관계도 렌더 (시드의 후반부 관계가 앞에서 안 보임)

### CP3 (8/21 저녁) — 관통 + 실데이터 전환

**통과 조건**:
- ✅ **R4**: 대시보드 → 브리핑 → 읽기 → 싸비 3탭 (관통 책임)
- ✅ **R1**: 실데이터 공개 전환 완료
- ✅ 전원: 시드 → 실데이터 전환

### CP4 (8/22) — Freeze ⛔

**통과 조건**:
- ✅ **교차 리뷰 완료** (기록 필수, NFR-SEC-006 판정 ①):
  - R4 → R2의 리포지토리 `(도서, cutoff)` 리뷰
  - R2 → R3의 리캡 입력 절단 리뷰
  - R3 → R4의 조립·검색 상한 리뷰
  - R4 → R3... (순환)
- ⛔ 이후 기능 추가 금지, 버그 수정만

### CP5 (8/25) — 게이트 판정 1차

**통과 조건**:
- ✅ 리그레션 30건 실행
- ✅ 인젝션 10건 실행 (R3)
- ✅ 성능 측정 (NFR-PERF 전체)

### CP6 (8/27) — 리허설

**통과 조건**:
- ✅ 인젝션 재실행
- ✅ 같은 질문 반복 실행 (A10 잔여 위험 확인)
- ✅ 발표 시나리오 리허설

### 발표 (8/28) 🎯

---

## 🔑 핵심 규칙 (필독)

### 절대 규칙 10개 (어기면 게이트 실패)

1. ❌ cutoff 인자 없는 저장소 접근
2. ❌ 기준점 결정기 밖에서 `page - 1` 계산 (프론트 포함)
3. ❌ 프롬프트 지시로 상한 걸기
4. ❌ LLM 게이트웨이 우회
5. ❌ 파이프라인 외 공개 콘텐츠 쓰기
6. ❌ 상한 우회 폴백 경로
7. ❌ 기준점 초과 여부 "판별" 코드
8. ❌ 클라이언트가 기준점 직접 전송 API
9. ❌ 페이지 내 스크롤로 서버 이벤트
10. ❌ 프론트에서 페이지 재분할

### 작업 규칙

- **조항 ID 주석 필수**: `// FR-SPL-002 🚦`
- **명세 외 지어내지 말 것**: 질문하고 멈춤
- **남의 파트 파일 수정 금지**: 각자 범위 엄수
- **한 세션에 작업 단위 하나**: S1, S2... 단위로
- **로그 적재는 기능의 일부**: 없으면 게이트 판정 불가

---

## 🚀 AWS EC2 배포 가이드

### 1단계: EC2 인스턴스 생성

```bash
# AWS 콘솔 또는 CLI로 EC2 생성
aws ec2 run-instances \
  --image-id ami-0c55b159cbfafe1f0 \  # Ubuntu 22.04 LTS
  --instance-type t3.medium \
  --key-name your-key-pair \
  --security-group-ids sg-xxx \  # 포트 22, 80, 443, 3000 오픈
  --subnet-id subnet-xxx

# Elastic IP 할당 (선택사항)
aws ec2 allocate-address --domain vpc
aws ec2 associate-address --instance-id i-xxx --allocation-id eipalloc-xxx
```

**보안 그룹 설정**:
- SSH (22): 개발 IP만
- HTTP (80): 0.0.0.0/0
- HTTPS (443): 0.0.0.0/0
- Custom (3000): 0.0.0.0/0 (개발 시) 또는 내부만

### 2단계: EC2 초기 설정

```bash
# SSH 접속
ssh -i your-key.pem ubuntu@ec2-xxx.compute.amazonaws.com

# 시스템 업데이트
sudo apt update && sudo apt upgrade -y

# Node.js 20 설치
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# PM2 설치 (프로세스 관리자)
sudo npm install -g pm2

# Nginx 설치 (리버스 프록시)
sudo apt install -y nginx

# Git 설치
sudo apt install -y git
```

### 3단계: 애플리케이션 배포

```bash
# 앱 디렉토리 생성
sudo mkdir -p /var/www/ssabi
sudo chown -R ubuntu:ubuntu /var/www/ssabi
cd /var/www/ssabi

# Git 클론
git clone https://github.com/your-org/ssabi-backend.git .

# 의존성 설치
npm ci --production

# 환경 변수 설정
cat > .env << EOF
DATABASE_URL=postgresql://admin:password@ssabi-prod.xxx.rds.amazonaws.com:5432/ssabi
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
BEDROCK_EMBED_MODEL=amazon.titan-embed-text-v2:0
BEDROCK_CLAUDE_SONNET=us.anthropic.claude-sonnet-4-5-20250929-v1:0
BEDROCK_CLAUDE_HAIKU=us.anthropic.claude-haiku-4-5-20251001-v1:0
PORT=3000
NODE_ENV=production
EOF

# 빌드
npm run build

# PM2로 실행
pm2 start dist/index.js --name ssabi-api

# 부팅 시 자동 시작 설정
pm2 startup systemd
pm2 save
```

### 4단계: Nginx 설정

```bash
# Nginx 설정 파일 생성
sudo nano /etc/nginx/sites-available/ssabi

# 아래 내용 입력
```

```nginx
server {
    listen 80;
    server_name your-domain.com;  # 또는 EC2 퍼블릭 IP

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        
        # SSE 스트리밍 지원
        proxy_buffering off;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
}
```

```bash
# 심볼릭 링크 생성
sudo ln -s /etc/nginx/sites-available/ssabi /etc/nginx/sites-enabled/

# 기본 사이트 비활성화
sudo rm /etc/nginx/sites-enabled/default

# Nginx 설정 테스트
sudo nginx -t

# Nginx 재시작
sudo systemctl restart nginx
```

### 5단계: SSL 인증서 (Let's Encrypt)

```bash
# Certbot 설치
sudo apt install -y certbot python3-certbot-nginx

# SSL 인증서 발급
sudo certbot --nginx -d your-domain.com

# 자동 갱신 설정
sudo certbot renew --dry-run
```

### 6단계: 배포 자동화 스크립트

```bash
# /var/www/ssabi/deploy.sh
#!/bin/bash

echo "🚀 Starting deployment..."

# Git 최신 코드 가져오기
git pull origin main

# 의존성 업데이트
npm ci --production

# 빌드
npm run build

# PM2 재시작
pm2 restart ssabi-api

echo "✅ Deployment complete!"
```

```bash
# 실행 권한
chmod +x deploy.sh

# 배포 실행
./deploy.sh
```

### 7단계: 모니터링

```bash
# PM2 상태 확인
pm2 status

# 로그 확인
pm2 logs ssabi-api

# 실시간 모니터링
pm2 monit

# Nginx 상태
sudo systemctl status nginx

# 디스크 사용량
df -h

# 메모리 사용량
free -m
```

### 배포 체크리스트

- [ ] EC2 인스턴스 생성 (t3.medium)
- [ ] 보안 그룹 설정 (포트 22, 80, 443 오픈)
- [ ] Elastic IP 할당 (선택)
- [ ] Node.js 20 설치
- [ ] PM2, Nginx 설치
- [ ] Git 클론 및 빌드
- [ ] .env 환경 변수 설정
- [ ] PM2로 앱 실행
- [ ] Nginx 리버스 프록시 설정
- [ ] SSL 인증서 설정 (프로덕션)
- [ ] PM2 부팅 시 자동 시작 설정
- [ ] 헬스 체크 확인

---

## 🆘 트러블슈팅

### EC2 SSH 연결 실패

```bash
# 키 파일 권한 확인
chmod 400 your-key.pem

# 보안 그룹 22번 포트 확인 (AWS 콘솔)

# 연결
ssh -i your-key.pem ubuntu@ec2-xxx.compute.amazonaws.com
```

### PM2 앱이 시작 안 됨

```bash
# 로그 확인
pm2 logs ssabi-api --lines 100

# 환경 변수 확인
cat /var/www/ssabi/.env

# 포트 사용 확인
sudo lsof -i :3000

# 수동 실행 테스트
cd /var/www/ssabi
node dist/index.js
```

### PostgreSQL 연결 실패

```bash
# RDS 보안 그룹 확인 (5432 포트 오픈)
# EC2 IP가 RDS 보안 그룹에 허용되어 있는지 확인

# 연결 테스트
psql -h your-rds-endpoint.rds.amazonaws.com -U admin -d ssabi

# 네트워크 확인
telnet your-rds-endpoint.rds.amazonaws.com 5432
```

### Bedrock 권한 오류

```bash
# AWS 자격 증명 확인
aws sts get-caller-identity

# Bedrock 모델 접근 권한 확인 (콘솔)
# https://console.aws.amazon.com/bedrock/
# → Model access → 모델 활성화
```

### Nginx 502 Bad Gateway

```bash
# PM2 상태 확인
pm2 status

# PM2 재시작
pm2 restart ssabi-api

# Nginx 에러 로그 확인
sudo tail -f /var/log/nginx/error.log

# Nginx 재시작
sudo systemctl restart nginx
```

### pgvector 확장 안 됨

```bash
# RDS 파라미터 그룹에서 shared_preload_libraries 확인
# AWS 콘솔 → RDS → Parameter groups

# psql로 접속
psql -h your-rds-endpoint.rds.amazonaws.com -U admin -d ssabi

# 확장 생성
CREATE EXTENSION IF NOT EXISTS vector;

# 확인
\dx
```

### 메모리 부족

```bash
# 메모리 사용량 확인
free -m

# 스왑 메모리 생성 (임시 대처)
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# EC2 인스턴스 타입 업그레이드 (근본 해결)
# t3.medium → t3.large
```

---

## 📚 참고 문서

- **루트 CLAUDE.md**: 매 세션 필독, 절대 규칙
- **dev-spec-00-shared.md**: 공통 계약 (API, 스키마, 로그)
- **dev-spec-R{n}-*.md**: 각 파트 개인 명세서
- **architecture-r1.md**: 설계 근거 (절 번호 참조)
- **decisions-0819-final.md**: 팀 결정 기록 (D1~D13)


---

**최종 수정**: 2026-08-19  
**문서 버전**: v1.0  
**다음 업데이트**: CP1 통과 후 (페이지 크기 확정 반영)
