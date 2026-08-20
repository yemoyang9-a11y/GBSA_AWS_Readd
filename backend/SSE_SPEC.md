# SSE 스트리밍 프레임 형식 (R2, R3 공통)

**확정일**: 2026-08-20  
**관련 파트**: R2 (리캡), R3 (챗봇)  
**요청자**: R4

---

## 📋 통일 형식 (delta / done / error)

### 1. Delta (텍스트 청크)

```
data: {"type":"delta","text":"텍스트 청크"}\n\n
```

- 일반 응답 텍스트
- 근거 부재 거절 문구도 동일하게 delta로 흘림 (별도 상태코드 X)

### 2. Done (정상 종료)

```
data: {"type":"done","applied_cutoff":79}\n\n
```

- 스트림 정상 완료
- 프론트가 정상 종료와 연결 끊김을 구분하려면 필수
- **`applied_cutoff`**: 이 응답에 적용된 기준점 K (R4 요청, NFR-OBS-003 🚦)

### 3. Error (오류)

```
data: {"type":"error","message":"오류 메시지"}\n\n
```

- 스트리밍 중 오류 발생
- 연결은 끊어짐 (res.end())

---

## 🔄 적용 대상 엔드포인트

### R3: POST /books/:bookId/chat

```javascript
// Delta
res.write(`data: ${JSON.stringify({ type: 'delta', text: chunk })}\n\n`);

// Done (K 포함)
res.write(`data: ${JSON.stringify({ type: 'done', applied_cutoff: K })}\n\n`);
res.end();

// Error
res.write(`data: ${JSON.stringify({ type: 'error', message: '...' })}\n\n`);
res.end();
```

### R2: POST /books/:bookId/recap/stream

```javascript
// 동일 형식 사용 (K 포함)
res.write(`data: ${JSON.stringify({ type: 'delta', text: chunk })}\n\n`);
res.write(`data: ${JSON.stringify({ type: 'done', applied_cutoff: K })}\n\n`);
res.end();
```

---

## 🎯 프론트엔드 처리 (R4)

⚠️ **주의**: EventSource는 GET만 지원하므로 POST 본문·헤더가 필요한 경우 fetch 사용

```typescript
// POST 본문과 X-Device-Id 헤더를 보낼 수 있는 fetch 사용
const response = await fetch('/books/123/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Device-Id': deviceId,
  },
  body: JSON.stringify({
    query: '정주사는 누구인가요?',
    page: 50,  // 선택: 진도 이벤트 동봉 시
    seq: 123,  // 선택: 진도 이벤트 동봉 시
  }),
});

if (!response.ok) {
  // Rate Limit 등 SSE 열기 전 에러 (일반 JSON)
  const error = await response.json();
  throw new Error(error.message);
}

const reader = response.body!.getReader();
const decoder = new TextDecoder();
let buffer = '';

try {
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    
    // 마지막 줄은 불완전할 수 있으므로 버퍼에 유지
    buffer = lines.pop() || '';
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6));
        
        switch (data.type) {
          case 'delta':
            // 텍스트 추가
            appendText(data.text);
            break;
            
          case 'done':
            // 정상 종료 (기준점 K 포함)
            onComplete(data.applied_cutoff);
            return;
            
          case 'error':
            // 오류 처리
            onError(data.message);
            return;
        }
      }
    }
  }
} finally {
  reader.releaseLock();
}
```

---

## ⚠️ 중요 사항

### 1. 근거 부재 처리 (FR-QNA-004 🚦)

**잘못된 방식:**
```javascript
// ❌ 별도 상태코드나 전용 이벤트
res.write(`data: {"type":"no_evidence"}\n\n`);
```

**올바른 방식:**
```javascript
// ✅ 일반 delta로 흘림
res.write(`data: ${JSON.stringify({ 
  type: 'delta', 
  text: '현재까지 읽은 페이지 기준으로 알 수 없는 내용입니다. 다른 질문 해주세요.' 
})}\n\n`);
res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
```

**이유**: 프론트는 거절도 일반 답변과 똑같이 렌더 (초과 판별 금지 조항)

### 2. Rate Limit (NFR-AI-017)

**올바른 순서:**
```javascript
// 1. Rate Limit 체크 (SSE 열기 전)
if (!rateLimitCheck.allowed) {
  return res.status(429).json({ ... }); // 일반 JSON 응답
}

// 2. SSE 헤더 설정
res.setHeader('Content-Type', 'text/event-stream');

// 3. 스트리밍 시작
```

**이유**: 스트림 열고 나서 실패하면 답변이 시작됐다 사라지는 화면

---

## 📊 예시

### 정상 응답

```
data: {"type":"delta","text":"정주사는"}\n\n
data: {"type":"delta","text":" 고무신 장사로"}\n\n
data: {"type":"delta","text":" 돈을 모았습니다 (p.10)."}\n\n
data: {"type":"done","applied_cutoff":79}\n\n
```

### 근거 부재

```
data: {"type":"delta","text":"현재까지 읽은 페이지 기준으로 알 수 없는 내용입니다. 다른 질문 해주세요."}\n\n
data: {"type":"done","applied_cutoff":79}\n\n
```

### 오류

```
data: {"type":"delta","text":"정주사는"}\n\n
data: {"type":"error","message":"Stream processing failed"}\n\n
```

---

**확정**: R2, R3 모두 이 형식으로 구현  
**문의**: R4에게
