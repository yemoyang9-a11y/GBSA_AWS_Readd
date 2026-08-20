# R3 챗봇 Mock 테스트 가이드

Mock 모드로 DB와 Bedrock 없이 챗봇을 테스트할 수 있습니다.

---

## 🚀 빠른 시작

### 1. 서버 실행

```bash
cd backend
npm run dev
```

서버가 실행되면 다음과 같이 표시됩니다:

```
┌─────────────────────────────────────────┐
│  싸비 (Reading Recap) Backend          │
│  Port: 3000                             │
│  Environment: development               │
│  Mock Mode: ✅ ENABLED                  │
│  Node: v20.x.x                          │
└─────────────────────────────────────────┘

🧪 Test Page: http://localhost:3000/test/test-chatbot.html
```

### 2. 테스트 페이지 열기

브라우저에서 열기:
```
http://localhost:3000/test/test-chatbot.html
```

---

## 📋 테스트 시나리오

### Mock 데이터 설정
- **기준점 K**: 80 (80페이지까지 읽은 상태)
- **도서**: 「탁류」(채만식)
- **등장인물**:
  - 정주사 (p.1~)
  - 초봉 (p.25~)
  - 박제호 (p.60~)
- **장**: 1~3장 (4장은 K=80 초과)

### 테스트 질문

#### ✅ **정상 응답** (K 이하)
1. "정주사가 누구인가요?"
   - 예상: 정주사 설명 + 페이지 참조

2. "초봉은 어떤 인물인가요?"
   - 예상: 초봉 설명 + 페이지 참조

3. "정주사와 초봉의 관계는?"
   - 예상: 관계 설명

#### ❌ **근거 부재** (K 초과)
4. "4장의 내용은?"
   - 예상: "현재까지 읽은 페이지 기준으로 알 수 없는 내용입니다."

#### 🚫 **Rate Limit**
5. 3회 질문 후 4번째 시도
   - 예상: 429 에러 "디바이스·도서당 분당 3회 제한 초과"

---

## 🔍 확인 사항

### 1. SSE 스트리밍
- [ ] 텍스트가 한 글자씩 스트리밍됨
- [ ] `delta` 프레임으로 전송됨
- [ ] `done` 프레임으로 종료됨

### 2. applied_cutoff
- [ ] `done` 프레임에 `applied_cutoff: 80` 포함
- [ ] 브라우저 콘솔에서 확인 가능

### 3. Rate Limiting
- [ ] 3회까지 정상 응답
- [ ] 4번째는 429 에러
- [ ] 1분 후 초기화 (페이지 새로고침)

### 4. 근거 부재 처리
- [ ] K 초과 질문 시 고정 문구 반환
- [ ] delta 스트리밍으로 전송 (error 타입 아님)

---

## 🛠️ 문제 해결

### Mock 모드가 활성화되지 않음
```bash
# .env 파일 확인
cat .env

# MOCK_MODE=true 있어야 함
# 없으면 추가:
echo "MOCK_MODE=true" >> .env

# 서버 재시작
npm run dev
```

### 포트 충돌
```bash
# 다른 포트 사용
PORT=3001 npm run dev

# 또는 .env 수정
echo "PORT=3001" >> .env
```

### CORS 에러
- 서버가 `Access-Control-Allow-Origin: *` 설정되어 있음
- 파일 프로토콜(`file://`)이 아닌 서버에서 접근해야 함
- `http://localhost:3000/test/test-chatbot.html` 사용

---

## 📊 로그 확인

서버 콘솔에서 다음을 확인할 수 있습니다:

```
[Mock] Using mock cutoff: 80
[DifficultyRouter] Model selected { model: 'haiku', ... }
[VectorSearch] Results { selectedPages: [10, 15], ... }
[Chatbot] Query log { cutoff_page: 80, no_evidence: false, ... }
✅ Stream done. Applied cutoff: 80
```

---

## 🔄 Mock 모드 끄기

실제 DB/Bedrock 연결 시:

```bash
# .env 수정
MOCK_MODE=false

# 또는 삭제
sed -i '' '/MOCK_MODE/d' .env

# 서버 재시작
npm run dev
```

---

## 📝 API 직접 호출 (curl)

```bash
# Health Check
curl http://localhost:3000/health

# 챗봇 (SSE 스트리밍)
curl -N -X POST http://localhost:3000/books/book-1/chat \
  -H "Content-Type: application/json" \
  -H "X-Device-Id: test-device-123" \
  -d '{"query":"정주사가 누구인가요?"}'

# Rate Limit 테스트 (3회 반복 후 4번째)
for i in {1..4}; do
  echo "=== Request $i ==="
  curl -X POST http://localhost:3000/books/book-1/chat \
    -H "Content-Type: application/json" \
    -H "X-Device-Id: test-device-123" \
    -d '{"query":"테스트"}'
  echo -e "\n"
done
```

---

## ✅ 완료 체크리스트

테스트가 완료되면:

- [ ] Mock 모드 서버 실행됨
- [ ] 테스트 페이지 접속됨
- [ ] SSE 스트리밍 동작 확인
- [ ] applied_cutoff 포함 확인
- [ ] Rate Limit 동작 확인
- [ ] 근거 부재 처리 확인
- [ ] 브라우저 콘솔 에러 없음
- [ ] 서버 콘솔 로그 정상

---

**문제가 있으면 서버 콘솔과 브라우저 콘솔을 확인하세요!**
