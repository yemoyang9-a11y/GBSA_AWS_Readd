# Re:Add

**더하지만(+), 더 하지는 않는 독서 서비스**

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

---

## 📖 프로젝트 소개

싸비는 전자책 독자가 읽은 페이지까지만 정보를 제공하는 독서 보조 시스템입니다.

### 핵심 기능

- **진도 인식 리캡**: 읽은 내용만 요약
- **인물 관계도**: 등장 시점까지만 표시
- **스포일러 프리 챗봇**: 근거 기반 질의응답

### 데모

- **작품**: 채만식 「탁류」 1권
- **플랫폼**: 태블릿 PC 우선 반응형 웹앱
- **발표**: 2026-08-28

---

## 📁 프로젝트 구조

```
GBSA_AWS_Readd/
├── backend/              # Node.js + TypeScript + Express
│   ├── src/modules/      # 모듈별 서비스 (R1~R4)
│   ├── tests/            # 테스트
│   └── migrations/       # DB 마이그레이션
│
├── frontend/             # React 18 + TypeScript + Vite
│   ├── src/pages/        # 페이지 (R4)
│   ├── src/components/   # 컴포넌트
│   └── public/           # 정적 파일
│
├── docs/                 # 문서
│   ├── api/              # API 명세
│   ├── dev-specs/        # 개발 명세 (R1~R4)
│   └── setup/            # 환경 구성
│
├── CLAUDE.md             # 개발 규칙
└── README.md             # 이 파일
```

---

## 🚀 빠른 시작 (팀원용)

### 필수 문서 (착수 전 필독!)

1. **[TECH_STACK.md](docs/setup/TECH_STACK.md)** ⭐ — 기술 스택 & 환경 구성
2. **[API_CONTRACT.md](docs/api/API_CONTRACT.md)** ⭐ — API 계약 명세 (R1~R4 공통)
3. **[INTEGRATION_GUIDE.md](docs/setup/INTEGRATION_GUIDE.md)** ⭐ — 통합 가이드 (합칠 때)
4. **[CLAUDE.md](CLAUDE.md)** — 개발 규칙 (절대 규칙 10개)

### Backend 설정

```bash
# 1. Backend 디렉토리 이동
cd backend

# 2. 의존성 설치
npm install

# 3. 환경 변수 설정
cp .env.example .env
# .env 편집 (팀 공유 RDS 주소 입력)

# 4. 개발 서버 실행
npm run dev

# 5. 헬스 체크
curl http://localhost:3000/health
```

### Frontend 설정

```bash
# 1. Frontend 디렉토리 이동
cd frontend

# 2. 의존성 설치
npm install

# 3. 환경 변수 설정
cp .env.example .env
# .env 편집 (API URL 설정)

# 4. 개발 서버 실행
npm run dev

# 5. 브라우저 접속
# http://localhost:5173
```

---

## 👥 파트별 담당

| 파트 | 담당자 | 책임 | 첫 마일스톤 (8/19 오전) |
|------|--------|------|----------------------|
| **R1** | 권희준 | 데이터·파이프라인 | 페이지 분할 |
| **R2** | 진승호 | 독서 상태·리캡 | **기준점 스냅샷 인터페이스 공개** ⭐ |
| **R3** | 이예나 | AI 경로·챗봇 | **LLM 게이트웨이 최소 구현** ⭐ |
| **R4** | 양예모 | 프론트엔드·조회 | 화면 골격 |

### 의존 관계

```
R1 → R3 (LLM 게이트웨이 필요)
R2 → R3 (LLM 게이트웨이 필요)
R3 → R2 (기준점 스냅샷 필요)
R4 → R2 (기준점 스냅샷 필요)
```

**R2, R3가 8/19 오전에 인터페이스를 먼저 내놓으면 나머지가 진행 가능합니다!**

---

## 🏗️ 기술 스택

### Backend
- Node.js 20 + TypeScript + Express
- RDS PostgreSQL 15 + pgvector
- Amazon Bedrock (Claude Sonnet/Haiku)

### Frontend
- React 18 + TypeScript + Vite
- Tailwind CSS
- React Router

### Deploy
- EC2 (t3.medium) + PM2 + Nginx

**자세한 내용**: [docs/setup/TECH_STACK.md](docs/setup/TECH_STACK.md)

---

## 📅 체크포인트

| 시점 | 마일스톤 | 통과 조건 |
|------|----------|----------|
| **8/19 오전** | **CP0** | 스택 확정, R2·R3 인터페이스 공개 |
| 8/19 저녁 | CP1 | R1 분할 실측 3건 |
| 8/20 저녁 | CP2 | 경로별 단독 동작 (시드 기준) |
| 8/21 저녁 | CP3 | 관통 + 실데이터 전환 |
| **8/22** | **CP4: Freeze** ⛔ | 교차 리뷰, 이후 기능 추가 금지 |
| 8/25 | CP5 | 게이트 판정 1차 (리그레션 30 + 인젝션 10) |
| 8/27 | CP6 | 리허설 |
| **8/28** | **발표** 🎯 | |

---

## 🔒 절대 규칙 (어기면 게이트 실패)

1. ❌ cutoff 인자 없는 저장소 접근
2. ❌ 기준점 결정기 밖에서 cutoff 계산 (프론트 포함)
3. ❌ 프롬프트 지시로 상한 걸기
4. ❌ LLM 게이트웨이 우회
5. ❌ 남의 파트 파일 수정 (디렉토리 분리 엄수)
6. ❌ `src/shared/types.ts` 임의 수정 (팀 합의 필수)

**자세한 규칙**: [CLAUDE.md](CLAUDE.md) 2장

---

## 🛠️ 브랜치 전략

```
main    # 통합 브랜치
  ↑
feature/R1-pipeline      # R1 작업
feature/R2-state-recap   # R2 작업
feature/R3-ai-gateway    # R3 작업
feature/R4-frontend      # R4 작업
```

### 작업 흐름
1. `develop`에서 `feature/R{n}-xxx` 브랜치 생성
2. 작업 단위 (S1, S2...) 하나씩 커밋
3. CP3 (8/21) 이후 `develop`으로 PR & 머지
4. CP4 (8/22) 이후 기능 추가 금지, 버그 수정만

---

## 🧪 통합 테스트 (CP3, 8/21)

```bash
# 1. 최신 develop 브랜치 pull
git checkout develop
git pull

# 2. Backend 실행
cd backend
npm install
npm run dev

# 3. Frontend 실행 (별도 터미널)
cd frontend
npm install
npm run dev

# 4. 관통 테스트 (R4 책임)
# 대시보드 → 브리핑 → 읽기 → 싸비 3탭
```

---

**Made with ❤️ by Team Ssabi**
