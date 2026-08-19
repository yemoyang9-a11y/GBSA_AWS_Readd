# 통합 가이드 — 각자 개발 후 합치기

**버전**: v1.0  
**최종 수정**: 2026-08-19

> 🎯 **목적**: R1, R2, R3, R4가 각자 개발한 모듈을 충돌 없이 통합하기 위한 가이드

---

## 📋 목차

1. [통합 전 체크리스트](#통합-전-체크리스트)
2. [브랜치 전략](#브랜치-전략)
3. [통합 순서](#통합-순서)
4. [충돌 방지 규칙](#충돌-방지-규칙)
5. [통합 테스트](#통합-테스트)
6. [트러블슈팅](#트러블슈팅)

---

## ✅ 통합 전 체크리스트

### 공통 (전원 필수)

```bash
# 1. 버전 확인
node --version    # v20.x.x 확인
npm --version     # v10.x.x 확인

# 2. 의존성 확인
npm install       # package.json 기준으로 설치

# 3. 린트/포맷 통과
npm run lint      # 에러 0개
npm run format    # 자동 수정

# 4. 타입 체크 통과
npm run build     # TypeScript 컴파일 성공

# 5. 단위 테스트 통과
npm test          # 작성한 테스트 모두 통과
```

### R1 체크리스트

- [ ] 시드 데이터 적재 완료 (CP0)
- [ ] 페이지 분할 실측 3건 보고 (CP1)
- [ ] 실데이터 공개 전환 완료 (CP3)
- [ ] `src/shared/types.ts` 수정 없이 사용
- [ ] 파이프라인 스크립트 `scripts/` 디렉토리에 위치

### R2 체크리스트

- [ ] **기준점 스냅샷 인터페이스 공개** (CP0 최우선)
  ```typescript
  export function getCutoffSnapshot(deviceId: string, bookId: string): CutoffSnapshot
  ```
- [ ] `src/modules/reading-state/cutoff.service.ts` 존재
- [ ] 진도 이벤트 seq 순서 보장 테스트 통과
- [ ] 리캡 입력 절단 로직 완성
- [ ] R3, R4가 import할 수 있는 형태로 export

### R3 체크리스트

- [ ] **LLM 게이트웨이 최소 구현** (CP0 최우선)
  ```typescript
  export class LLMGateway {
    call(task: string, prompt: string): Promise<string>
    stream(task: string, prompt: string): AsyncGenerator<string>
  }
  ```
- [ ] `src/modules/llm-gateway/gateway.ts` 존재
- [ ] 챗봇 근거 조립 함수가 **query 인자 없음** 확인
- [ ] 벡터 검색 사전 필터 SQL 완성
- [ ] R1, R2가 import할 수 있는 형태로 export

### R4 체크리스트

- [ ] 프론트엔드 빌드 산출물 `dist/` 또는 `build/`
- [ ] 조회 API 라우터 분리 (`src/api/routes.ts`)
- [ ] **프론트에서 `page - 1` 계산 0건** 확인
- [ ] SSE 스트리밍 렌더 컴포넌트 완성
- [ ] R2, R3 API 호출 형태 `API_CONTRACT.md` 준수

---

## 🌿 브랜치 전략

```
main
  ├── develop
  │   ├── feature/R1-pipeline
  │   ├── feature/R2-state-recap
  │   ├── feature/R3-chatbot
  │   └── feature/R4-frontend
```

### 작업 흐름

```bash
# 1. feature 브랜치 생성
git checkout -b feature/R3-chatbot

# 2. 작업 & 커밋
git add .
git commit -m "feat(R3): LLM 게이트웨이 최소 구현 — NFR-AI-003"

# 3. 원격 푸시
git push origin feature/R3-chatbot

# 4. PR 생성 (GitHub)
# - Base: develop
# - Compare: feature/R3-chatbot
# - Reviewers: 다른 팀원들

# 5. 리뷰 & 수정 & 머지
```

---

## 🔄 통합 순서

### Phase 1: 기반 인프라 (CP0, 8/19 오전)

```bash
# 1. 공통 파일 먼저 main에 머지
- package.json
- tsconfig.json
- .eslintrc.json
- .prettierrc
- src/shared/types.ts
- API_CONTRACT.md

# 2. 전원 pull
git pull origin main
npm install
```

### Phase 2: 핵심 인터페이스 (CP0, 8/19 오전)

**순서가 중요합니다!**

```bash
# 1. R2: 기준점 스냅샷 인터페이스 먼저
feature/R2-cutoff-interface → develop

# 2. R3: LLM 게이트웨이 최소 구현
feature/R3-llm-gateway-minimal → develop

# 3. R1, R4: 스텁으로 개발 진행 가능
```

### Phase 3: 모듈별 통합 (CP2~CP3, 8/20~8/21)

```bash
# 병렬 개발 가능 (의존성 해소 후)
feature/R1-pipeline → develop
feature/R2-state-recap → develop
feature/R3-chatbot → develop
feature/R4-frontend → develop
```

### Phase 4: 통합 테스트 (CP3, 8/21 저녁)

```bash
# develop 브랜치에서 통합 테스트
git checkout develop
git pull

npm run build
npm test

# 통과 후 main 머지
git checkout main
git merge develop
```

---

## 🛡️ 충돌 방지 규칙

### 1. 디렉토리 분리 엄수

```
src/modules/
├── content/        # R4 전용
├── reading-state/  # R2 전용
├── ssabi/          # R4 전용
├── recap/          # R2 전용
├── chatbot/        # R3 전용
└── llm-gateway/    # R3 전용
```

**절대 규칙**: 남의 디렉토리 수정 금지!

### 2. 공통 파일 수정 프로토콜

**`src/shared/types.ts` 수정 시**:

```bash
# 1. 팀 회의에서 합의
# 2. GitHub Issue 생성
# 3. PR에 전원 Approve 필요
# 4. 머지 후 전원 즉시 pull
```

### 3. package.json 충돌 방지

```bash
# 새 패키지 설치 시
npm install <package> --save

# 즉시 커밋 & 푸시
git add package.json package-lock.json
git commit -m "chore: Add <package>"
git push

# 팀원들에게 알림
# Slack: "package.json 업데이트했습니다. pull 받으세요!"
```

### 4. 타입 정의 충돌 방지

**개인 타입은 모듈 내부에**:

```typescript
// ✅ 좋음
// src/modules/chatbot/types.ts (R3 전용)
interface InternalChatConfig {
  // R3만 쓰는 내부 타입
}

// ❌ 나쁨
// src/shared/types.ts에 R3만 쓰는 타입 추가
```

**공유 타입은 팀 합의 후**:

```typescript
// src/shared/types.ts
// 전원 사용 → 합의 필요
export interface CutoffSnapshot {
  // ...
}
```

---

## 🧪 통합 테스트

### 로컬 통합 테스트 (CP3 전)

```bash
# 1. develop 브랜치 최신화
git checkout develop
git pull

# 2. 클린 빌드
rm -rf node_modules dist
npm install
npm run build

# 3. 환경 변수 설정
cp .env.example .env
# .env 편집 (개발용 RDS)

# 4. 서버 실행
npm run dev

# 5. 헬스 체크
curl http://localhost:3000/health

# 6. API 테스트 (각 담당자)
# R2: 진입 판정, 진도 이벤트, 브리핑
# R3: 챗봇 질의
# R4: 카탈로그, 관계도
```

### CP3 통합 데모 (8/21 저녁)

**R4 책임: 관통 시나리오**

```
1. 대시보드 → 표지 선택
2. 브리핑 → 저장 리캡 확인
3. 읽기 화면 → 페이지 넘기기
4. 싸비 열기 → 3탭 전환
5. 챗봇 질의 → 응답 확인
```

**통과 조건**:
- [ ] 흐름이 끊기지 않고 완료
- [ ] 진도 % 일치 (대시보드·브리핑·싸비)
- [ ] 페이지 넘김 → 관계도 즉시 갱신
- [ ] 챗봇 응답 2초 이내 첫 텍스트

---

## 🔧 트러블슈팅

### "Module not found" 에러

```bash
# 원인: node_modules 버전 불일치
# 해결:
rm -rf node_modules package-lock.json
npm install
```

### "Type error" 빌드 실패

```bash
# 원인: src/shared/types.ts 최신 버전 아님
# 해결:
git pull origin develop
npm run build
```

### API 호출 404 에러

```bash
# 원인: 라우터 등록 누락
# 확인:
# src/api/routes.ts에 엔드포인트 등록되어 있는지
# src/index.ts에서 라우터 import되어 있는지
```

### SSE 스트리밍 안 됨

```bash
# 원인: 헤더 설정 누락
# 확인:
res.setHeader('Content-Type', 'text/event-stream')
res.setHeader('Cache-Control', 'no-cache')
res.setHeader('Connection', 'keep-alive')
```

### 벡터 검색 에러

```bash
# 원인: pgvector 확장 미설치
# 해결:
psql -h your-rds-endpoint -U admin
CREATE EXTENSION IF NOT EXISTS vector;
```

### Git 머지 충돌

```bash
# 1. 충돌 파일 확인
git status

# 2. 충돌 해결
# 파일 열어서 <<<<<<<, =======, >>>>>>> 제거
# 내용 병합

# 3. 테스트
npm run build
npm test

# 4. 커밋
git add .
git commit -m "fix: Resolve merge conflict"
```

---

## 📞 통합 시 긴급 연락

### 머지 전 확인 사항

1. **빌드 성공**: `npm run build`
2. **린트 통과**: `npm run lint`
3. **테스트 통과**: `npm test`
4. **충돌 없음**: `git status` 클린
5. **팀원 리뷰**: 최소 1명 Approve

### 머지 후 알림

```
Slack: "@channel feature/R3-chatbot 머지했습니다. pull 받으세요!"
```

### 긴급 상황

```
main 브랜치가 고장났다면:

1. 즉시 Slack에 공지
2. 마지막 정상 커밋으로 revert
3. 문제 원인 파악 후 재시도
```

---

## 🎯 통합 성공 체크리스트

### CP3 (8/21 저녁)

- [ ] R1: 실데이터 적재 완료
- [ ] R2: 기준점 결정기 동작 확인
- [ ] R3: 챗봇 응답 받기 성공
- [ ] R4: 대시보드 → 싸비 관통 성공
- [ ] 전원: `npm run build` 성공
- [ ] 전원: `npm test` 성공
- [ ] main 브랼치에 통합 완료

### CP4 (8/22)

- [ ] 교차 리뷰 완료 (기록 필수)
- [ ] ⛔ Freeze 선언
- [ ] 이후 기능 추가 금지

---

**질문이나 문제 발생 시 즉시 팀에 공유하세요!**
