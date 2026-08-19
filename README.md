# 싸비 (Reading Recap)

**전자책 독자를 위한 진도 인식 사이드바 — 스포일러 완전 차단**

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

## 🚀 빠른 시작 (팀원용)

### 필수 문서 (착수 전 필독!)

1. **[TECH_STACK.md](docs/setup/TECH_STACK.md)** ⭐ — 기술 스택 & 환경 구성
2. **[API_CONTRACT.md](docs/api/API_CONTRACT.md)** ⭐ — API 계약 명세 (R1~R4 공통)
3. **[INTEGRATION_GUIDE.md](docs/setup/INTEGRATION_GUIDE.md)** ⭐ — 통합 가이드 (합칠 때)
4. **[CLAUDE.md](GBSA_AWS_Readd/CLAUDE.md)** — 개발 규칙 (절대 규칙 10개)

### 설치 (각자 노트북)

```bash
# 1. 저장소 클론
git clone https://github.com/your-org/ssabi-backend.git
cd ssabi-backend

# 2. 의존성 설치 (package.json 기준)
npm install

# 3. 환경 변수 설정
cp .env.example .env
# .env 편집 (팀 공유 RDS 주소 입력)

# 4. 개발 서버 실행
npm run dev

# 5. 헬스 체크
curl http://localhost:3000/health
```

---

## 👥 파트별 담당

| 파트 | 담당자 | 책임 | 첫 마일스톤 (8/19 오전) |
|------|--------|------|----------------------|
| **R1** | TBD | 데이터·파이프라인 | 페이지 분할 |
| **R2** | TBD | 독서 상태·리캡 | **기준점 스냅샷 인터페이스 공개** ⭐ |
| **R3** | TBD | AI 경로·챗봇 | **LLM 게이트웨이 최소 구현** ⭐ |
| **R4** | TBD | 프론트엔드·조회 | 화면 골격 |

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

### Deploy
- EC2 (t3.medium) + PM2 + Nginx

**자세한 내용**: [TECH_STACK.md](TECH_STACK.md)

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
2. ❌ 기준점 결정기 밖에서 `page - 1` 계산 (프론트 포함)
3. ❌ 프롬프트 지시로 상한 걸기
4. ❌ LLM 게이트웨이 우회
5. ❌ 남의 파트 파일 수정 (디렉토리 분리 엄수)
6. ❌ `src/shared/types.ts` 임의 수정 (팀 합의 필수)

**자세한 규칙**: [CLAUDE.md](GBSA_AWS_Readd/CLAUDE.md) 2장

---

## 🛠️ 개발 명령어

```bash
npm run dev      # 개발 모드 (hot reload)
npm run build    # TypeScript 빌드
npm start        # 프로덕션 실행
npm test         # 테스트
npm run lint     # 린트 체크
npm run format   # Prettier 포맷
```

---

## 📁 프로젝트 구조

```
src/
├── modules/
│   ├── content/        # ① R4
│   ├── reading-state/  # ② R2 (기준점 결정기 ⭐)
│   ├── ssabi/          # ③ R4
│   ├── recap/          # ④ R2
│   ├── chatbot/        # ⑤ R3
│   └── llm-gateway/    # ⑥ R3 (게이트웨이 ⭐)
├── shared/
│   └── types.ts        # 공통 타입 (전원 공유, 수정 시 합의)
└── api/
    └── routes.ts       # API 라우트
```

---

## 🧪 통합 테스트 (CP3, 8/21)

```bash
# 1. 최신 develop 브랜치 pull
git checkout develop
git pull

# 2. 클린 빌드
rm -rf node_modules dist
npm install
npm run build

# 3. 서버 실행
npm run dev

# 4. 관통 테스트 (R4 책임)
# 대시보드 → 브리핑 → 읽기 → 싸비 3탭
```
---

**Made with ❤️ by Team Ssabi**
