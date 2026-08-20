# 로컬 개발 환경 설정

AWS 없이 로컬에서 테스트하는 방법입니다.

---

## 1. PostgreSQL 설치 (macOS)

### Homebrew 사용
```bash
# PostgreSQL 설치
brew install postgresql@15

# pgvector 설치
brew install pgvector

# PostgreSQL 시작
brew services start postgresql@15

# 접속 확인
psql postgres
```

---

## 2. 데이터베이스 생성

```bash
# psql 접속
psql postgres

# 데이터베이스 생성
CREATE DATABASE readd;

# pgvector 확장 설치
\c readd
CREATE EXTENSION vector;

# 확인
\dx

# 종료
\q
```

---

## 3. 환경 변수 설정

`.env` 파일 생성:

```bash
# 개발 환경
NODE_ENV=development

# Mock 모드 (Bedrock 없이 테스트)
MOCK_MODE=true

# 서버
PORT=3000

# PostgreSQL (로컬)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=readd
DB_USER=yourusername  # 본인의 macOS 사용자명
DB_PASSWORD=

# AWS (Mock 모드에서는 사용 안 함)
AWS_REGION=us-east-1
BEDROCK_CLAUDE_SONNET=anthropic.claude-sonnet-3-5-20240620-v1:0
BEDROCK_CLAUDE_HAIKU=anthropic.claude-3-haiku-20240307-v1:0
BEDROCK_EMBED_MODEL=amazon.titan-embed-text-v2:0
```

---

## 4. 마이그레이션 실행

```bash
# 의존성 설치
npm install

# 마이그레이션 실행
npm run db:migrate

# 결과 확인
psql readd -c "\dt"
```

---

## 5. 서버 실행

```bash
npm run dev
```

성공하면:
```
┌─────────────────────────────────────────┐
│  싸비 (Reading Recap) Backend          │
│  Port: 3000                             │
│  Environment: development               │
│  Mock Mode: ✅ ENABLED                  │
└─────────────────────────────────────────┘

🧪 Test Page: http://localhost:3000/test/test-chatbot.html
```

---

## 6. 테스트

### 6-1. Unit Test
```bash
npm test
```

### 6-2. 웹 UI 테스트
브라우저에서:
```
http://localhost:3000/test/test-chatbot.html
```

### 6-3. API 테스트 (curl)
```bash
# Health Check
curl http://localhost:3000/health

# 챗봇 (SSE)
curl -N -X POST http://localhost:3000/books/book-1/chat \
  -H "Content-Type: application/json" \
  -H "X-Device-Id: test-device-123" \
  -d '{"query":"정주사가 누구인가요?"}'
```

---

## 7. 시드 데이터 투입 (선택)

```bash
# 데모 데이터 생성
ts-node src/batch/demo-seed/inject-demo-data.ts
```

---

## 문제 해결

### PostgreSQL 연결 실패
```bash
# 서비스 상태 확인
brew services list

# 재시작
brew services restart postgresql@15

# 로그 확인
tail -f /opt/homebrew/var/log/postgresql@15.log
```

### pgvector 설치 실패
```bash
# 수동 설치
git clone https://github.com/pgvector/pgvector.git
cd pgvector
make
make install
```

### 포트 충돌
```bash
# 다른 포트 사용
PORT=3001 npm run dev
```

---

## Mock 모드 OFF (실제 AWS 사용)

AWS 연결 정보를 받았다면:

```bash
# .env 수정
MOCK_MODE=false

# AWS 자격증명 설정
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...

# 서버 재시작
npm run dev
```

---

**이제 `npm run dev`로 서버를 실행하고 테스트 페이지에서 챗봇을 테스트할 수 있습니다!**
