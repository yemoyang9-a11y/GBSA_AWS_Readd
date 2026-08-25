# 싸비 (Reading Recap) - Backend

**Node.js 20 + TypeScript + Express + PostgreSQL + Bedrock**

---

## 📁 디렉토리 구조

```
backend/
├── src/
│   ├── index.ts                        # 앱 진입점
│   ├── config/                         # 설정
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
├── scripts/                            # 유틸리티 스크립트
│   ├── migrate.js
│   └── seed.js
│
├── .env.example                        # 환경 변수 템플릿
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🚀 빠른 시작

### 1. 의존성 설치

```bash
cd backend
npm install
```

### 2. 환경 변수 설정

```bash
cp .env.example .env
# .env 편집 (팀 공유 RDS 주소 입력)
```

### 3. 개발 서버 실행

```bash
npm run dev
```

### 4. 헬스 체크

```bash
curl http://localhost:3000/health
```

---

## 👥 파트별 담당

| 파트 | 담당자 | 디렉토리 | 책임 |
|------|--------|----------|------|
| **R1** | TBD | `batch/pipeline/` | 데이터·파이프라인 |
| **R2** | TBD | `modules/reading-state/`, `modules/recap/` | 독서 상태·리캡 |
| **R3** | TBD | `modules/chatbot/`, `modules/llm-gateway/` | AI 경로·챗봇 |
| **R4** | TBD | `modules/content/`, `modules/ssabi/` | 백엔드 조회 API |

---

## 📋 개발 명령어

```bash
npm run dev      # 개발 모드 (hot reload)
npm run build    # TypeScript 빌드
npm start        # 프로덕션 실행
npm test         # 테스트
npm run lint     # 린트 체크
npm run format   # Prettier 포맷
```

---

## 🔒 절대 규칙

1. ❌ cutoff 인자 없는 저장소 접근
2. ❌ 기준점 결정기 밖에서 cutoff 계산
3. ❌ 프롬프트 지시로 상한 걸기
4. ❌ LLM 게이트웨이 우회
5. ❌ 남의 파트 파일 수정 (디렉토리 분리 엄수)

**자세한 규칙**: 루트 [CLAUDE.md](../CLAUDE.md) 참조

---

## 📚 필수 문서

1. **[API_CONTRACT.md](../docs/api/API_CONTRACT.md)** — API 계약 명세
2. **[TECH_STACK.md](../docs/setup/TECH_STACK.md)** — 기술 스택
3. **[dev-spec-00-shared.md](../docs/dev-specs/00-shared.md)** — 공통 계약
4. **[dev-spec-R{n}-*.md](../docs/dev-specs/)** — 파트별 명세서

---

**Made with ❤️ by Team Ssabi**
