# 싸비 (Reading Recap) - Frontend

**React 18 + TypeScript + Vite + Tailwind CSS**

---

## 📁 디렉토리 구조

```
frontend/
├── public/                             # 정적 파일
│   ├── index.html
│   └── assets/
│
├── src/
│   ├── main.tsx                        # 앱 진입점
│   ├── App.tsx                         # 루트 컴포넌트
│   │
│   ├── pages/                          # 페이지 컴포넌트 (R4)
│   │   ├── Dashboard.tsx               # 대시보드 (카탈로그)
│   │   ├── Briefing.tsx                # 브리핑 화면
│   │   ├── Reader.tsx                  # 읽기 화면
│   │   └── NotFound.tsx
│   │
│   ├── components/                     # 재사용 컴포넌트
│   │   ├── Layout/
│   │   │   ├── Header.tsx
│   │   │   └── Sidebar.tsx
│   │   │
│   │   ├── Ssabi/                      # 싸비 사이드바 (R4)
│   │   │   ├── SsabiPanel.tsx          # 싸비 패널 (3탭)
│   │   │   ├── RecapTab.tsx            # 리캡 탭
│   │   │   ├── RelationshipTab.tsx     # 인물 관계도 탭
│   │   │   ├── ChatbotTab.tsx          # 챗봇 탭
│   │   │   └── RelationshipGraph.tsx   # 관계도 그래프
│   │   │
│   │   ├── Reader/
│   │   │   ├── PageContent.tsx         # 본문 페이지
│   │   │   ├── PageNavigation.tsx      # 페이지 네비게이션
│   │   │   └── ProgressBar.tsx         # 진도 바
│   │   │
│   │   └── common/                     # 공통 컴포넌트
│   │       ├── Button.tsx
│   │       ├── Loading.tsx
│   │       └── ErrorBoundary.tsx
│   │
│   ├── services/                       # API 서비스 레이어
│   │   ├── api.ts                      # 공통 API 클라이언트
│   │   ├── bookService.ts              # 책 API
│   │   ├── progressService.ts          # 진도 API
│   │   ├── recapService.ts             # 리캡 API
│   │   ├── chatbotService.ts           # 챗봇 API
│   │   └── ssabiService.ts             # 싸비 조회 API
│   │
│   ├── hooks/                          # Custom Hooks
│   │   ├── useProgress.ts              # 진도 관리 훅
│   │   ├── useHeartbeat.ts             # 하트비트 훅
│   │   ├── useSSE.ts                   # SSE 스트리밍 훅
│   │   └── useSsabiData.ts             # 싸비 데이터 훅
│   │
│   ├── types/                          # TypeScript 타입
│   │   ├── index.ts                    # 공통 타입
│   │   ├── book.ts
│   │   ├── progress.ts
│   │   └── ssabi.ts
│   │
│   ├── utils/                          # 유틸리티
│   │   ├── constants.ts                # 상수
│   │   ├── storage.ts                  # LocalStorage 헬퍼
│   │   └── format.ts                   # 포맷팅
│   │
│   ├── assets/                         # 정적 리소스
│   │   ├── images/
│   │   └── styles/
│   │       └── index.css               # 전역 스타일
│   │
│   └── App.css                         # 앱 스타일
│
├── .env.example                        # 환경 변수 템플릿
├── .gitignore
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## 🚀 빠른 시작

### 1. 의존성 설치

```bash
cd frontend
npm install
```

### 2. 환경 변수 설정

```bash
cp .env.example .env
# VITE_API_URL 설정 (기본: http://localhost:3000)
```

### 3. 개발 서버 실행

```bash
npm run dev
```

브라우저에서 http://localhost:5173 접속

---

## 🎨 화면 구성 (R4 담당)

### 1. 대시보드 (카탈로그)
- 읽을 수 있는 도서 목록
- 진도 표시
- `ssabi_ready` 필터

### 2. 브리핑 화면
- 저장 리캡 (없으면 스트리밍 폴백)
- 현재 장 표시
- 진도 바
- '마저 읽기' 버튼

### 3. 읽기 화면
- 본문 페이지 표시
- 페이지 네비게이션 (앞/뒤)
- 싸비 사이드바 (3탭)

### 4. 싸비 사이드바
- **리캡 탭**: 줄거리 요약
- **인물 관계도 탭**: 노드·간선 그래프
- **챗봇 탭**: 질의응답 (SSE 스트리밍)

---

## 📋 개발 명령어

```bash
npm run dev      # 개발 모드 (hot reload)
npm run build    # 프로덕션 빌드
npm run preview  # 빌드 결과 미리보기
npm run lint     # 린트 체크
npm run format   # Prettier 포맷
```

---

## ⚠️ 중요 규칙

### 절대 금지
- ❌ **프론트에서 cutoff 계산 금지** (서버 `applied_cutoff` 그대로 사용)
- ❌ **프론트에서 페이지 재분할 금지** (폰트·화면 크기는 스크롤만 변경)
- ❌ **진도 이벤트를 페이지 내 스크롤로 발생 금지**

### 반드시 지킬 것
- ✅ 서버가 내려준 파생값(cutoff, percent)을 **그대로 렌더**
- ✅ 페이지 이동 시 즉시 진도 이벤트 전송 (`{page, seq}`)
- ✅ seq는 클라이언트 단조 증가 시퀀스

---

## 🔗 API 연동

### API Base URL
```typescript
// .env
VITE_API_URL=http://localhost:3000
```

### 주요 엔드포인트
- `GET /books` — 카탈로그
- `POST /books/:bookId/entry` — 진입 판정
- `POST /books/:bookId/progress` — 진도 이벤트
- `GET /books/:bookId/briefing` — 브리핑
- `POST /books/:bookId/recap/stream` — 리캡 스트리밍 (SSE)
- `POST /books/:bookId/chat` — 챗봇 질의 (SSE)
- `GET /books/:bookId/ssabi/graph` — 관계도

**자세한 API 명세**: [API_CONTRACT.md](../docs/api/API_CONTRACT.md)

---

## 📚 필수 문서

1. **[API_CONTRACT.md](../docs/api/API_CONTRACT.md)** — API 계약 명세
2. **[TECH_STACK.md](../docs/setup/TECH_STACK.md)** — 기술 스택
3. **[dev-spec-R4-frontend.md](../docs/dev-specs/R4-frontend.md)** — R4 명세서

---

**Made with ❤️ by Team Ssabi**
