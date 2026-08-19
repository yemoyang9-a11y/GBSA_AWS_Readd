# API 계약 명세

**버전**: v1.0  
**최종 확정**: 2026-08-19  
**근거**: `architecture-r1.md` 4.2절, `dev-spec-00-shared.md` 2.5절

> ⚠️ **이 문서는 R1, R2, R3, R4 전원이 반드시 준수해야 합니다**  
> ⚠️ **수정 시 팀 합의 필수**

---

## 📋 목차

1. [엔드포인트 목록](#엔드포인트-목록)
2. [공통 규칙](#공통-규칙)
3. [R2 제공 API](#r2-제공-api)
4. [R3 제공 API](#r3-제공-api)
5. [R4 제공 API](#r4-제공-api)
6. [에러 응답](#에러-응답)

---

## 🌐 엔드포인트 목록

| 엔드포인트 | 메서드 | 담당 | 설명 |
|------------|--------|------|------|
| `/books` | GET | R4 | 카탈로그 조회 |
| `/books/:bookId/info` | GET | R4 | 책 정보 (i 팝업) |
| `/books/:bookId/pages/:pageNo` | GET | R4 | 본문 페이지 단건 |
| `/books/:bookId/entry` | POST | R2 | 진입 판정 |
| `/books/:bookId/progress` | POST | R2 | 진도 이벤트 |
| `/books/:bookId/heartbeat` | POST | R2 | 하트비트 |
| `/books/:bookId/briefing` | GET | R2 | 브리핑 조회 |
| `/books/:bookId/recap/stream` | POST | R2 | 리캡 스트리밍 |
| `/books/:bookId/ssabi/graph` | GET | R4 | 관계도 JSON |
| `/books/:bookId/ssabi/characters/:characterId` | GET | R4 | 인물 상세 |
| `/books/:bookId/chat` | POST | R3 | 챗봇 질의 (SSE) |

---

## 🔧 공통 규칙

### 인증 (간소화)

```
Header: X-Device-Id: <uuid>
```

- 디바이스 식별자로 세션 관리
- 첫 요청 시 서버가 생성해서 반환
- 이후 모든 요청에 포함

### 에러 응답 형식

```typescript
{
  "error": "NOT_FOUND",
  "message": "Book not found"
}
```

### 타임스탬프

- ISO 8601 형식: `2026-08-19T10:30:00Z`

### 페이지 번호

- 1-based (1부터 시작)

---

## 📘 R2 제공 API (독서 상태 + 리캡)

### 1. POST `/books/:bookId/entry` — 진입 판정

**요청**:
```json
{
  "device_id": "uuid"
}
```

**응답**:
```json
{
  "route": "briefing" | "reader",
  "page": 1,
  "is_new_session": true
}
```

**규칙**:
- 세션 30분 규칙 평가
- 미완비 도서는 진입 거절
- 판정 후 `last_activity_at` 갱신

---

### 2. POST `/books/:bookId/progress` — 진도 이벤트

**요청**:
```json
{
  "page": 80,
  "seq": 123
}
```

**응답**:
```json
{
  "success": true
}
```

**규칙**:
- fire-and-forget (비블로킹)
- **더 새로운 seq일 때만 수용**
- 순서 보장 (FR-PRG-002)

---

### 3. POST `/books/:bookId/heartbeat` — 하트비트

**요청**:
```json
{
  "timestamp": "2026-08-19T10:30:00Z"
}
```

**응답**:
```json
{
  "success": true
}
```

**규칙**:
- 5분 주기 (화면 가시 상태에서만)
- 진도·기준점 비관여
- 마지막 조작 시각만 갱신

---

### 4. GET `/books/:bookId/briefing` — 브리핑 조회

**요청**: 없음

**응답**:
```json
{
  "recap": "정주사는 고무신 장사로 돈을 모았고..." | null,
  "current_chapter": {
    "chapter_no": 3,
    "title": "제3장"
  },
  "progress": {
    "current_page": 80,
    "total_pages": 340,
    "percent": 23.5
  }
}
```

**규칙**:
- `recap: null` → 클라이언트가 스트리밍 폴백 호출
- **첫 진입 (cutoff = 0)은 폴백 대상 아님** (빈 상태 안내)

---

### 5. POST `/books/:bookId/recap/stream` — 리캡 스트리밍

**요청**:
```json
{
  "page": 80,
  "seq": 123
}
```

**응답** (SSE):
```
data: {"text": "정"}
data: {"text": "주사"}
data: {"text": "는"}
...
data: [DONE]
```

**규칙**:
- SSE 스트리밍 (NFR-PERF-002 🚦)
- 재사용 판정은 서버가 수행
- 세션 캐시 적중 시 호출 0회

---

## 🤖 R3 제공 API (챗봇)

### 6. POST `/books/:bookId/chat` — 챗봇 질의

**요청**:
```json
{
  "query": "초봉이가 정주사를 싫어하는 이유는?",
  "page": 80,
  "seq": 123
}
```

**응답** (SSE):
```
data: {"text": "초봉이는"}
data: {"text": " 정주사가"}
data: {"text": " 돈만 밝히고"}
...
data: [DONE]
```

**근거 부재 시**:
```
data: {"text": "현재까지 읽은 페이지 기준으로 알 수 없는 내용입니다. 다른 질문 해주세요."}
data: [DONE]
```

**규칙**:
- SSE 스트리밍 (NFR-PERF-008)
- 근거 부재 시 통일 문구 (FR-QNA-004 🚦)
- 호출량 상한: 디바이스·도서당 분당 3회

---

## 📊 R4 제공 API (조회)

### 7. GET `/books` — 카탈로그 조회

**요청**: 없음

**응답**:
```json
{
  "books": [
    {
      "book_id": "uuid",
      "title": "탁류",
      "author": "채만식",
      "cover_url": "https://...",
      "total_pages": 340,
      "ssabi_ready": true,
      "progress": {
        "current_page": 80,
        "percent": 23.5
      }
    }
  ]
}
```

**규칙**:
- 읽던 도서만 `progress` 포함
- `ssabi_ready: false` → 클릭 불가 (프론트 + 서버 병행)

---

### 8. GET `/books/:bookId/info` — 책 정보 (i 팝업)

**요청**: 없음

**응답**:
```json
{
  "basic_info": {
    "title": "탁류",
    "author": "채만식",
    "published_year": 1937
  },
  "introduction": "1930년대 군산을 배경으로...",
  "background": "일제강점기 후반, 자본주의가..."
}
```

**규칙**:
- 3영역 분리 필드 (FR-BRW-003)
- 배경지식은 상한 없음 (R5)

---

### 9. GET `/books/:bookId/pages/:pageNo` — 본문 페이지

**요청**: 없음

**응답**:
```json
{
  "page_no": 80,
  "content": "정주사는 딸 계봉을..."
}
```

**규칙**:
- 진도에 관여하지 않음 (선요청 안전)

---

### 10. GET `/books/:bookId/ssabi/graph` — 관계도 JSON

**요청**: 
- Query: `?page=80&seq=123` (선택사항)

**응답**:
```json
{
  "nodes": [
    {
      "id": "uuid",
      "name": "정주사",
      "first_appearance_page": 1,
      "aliases": ["정 주사", "주사"]
    }
  ],
  "edges": [
    {
      "source": "uuid-a",
      "target": "uuid-b",
      "label": "약혼",
      "established_page": 50
    }
  ]
}
```

**규칙**:
- 노드 = 인물 `최초 등장 <= K`
- 간선 = 관계 `확립 페이지 <= K` 중 **최신 1개**
- 별칭도 `최초 등장 <= K` 필터
- **간선 양 끝 노드가 결과 집합에 있을 때만** (FR-SPL-005 🚦)

---

### 11. GET `/books/:bookId/ssabi/characters/:characterId` — 인물 상세

**요청**: 없음

**응답**:
```json
{
  "name": "정주사",
  "first_appearance_page": 1,
  "aliases": [
    {
      "alias": "정 주사",
      "type": "name",
      "first_appearance_page": 1
    }
  ],
  "notes": "고무신 장사로 돈을 모았다. 딸 계봉을 키우고 있다..."
}
```

**규칙**:
- 인물 노트: `근거 페이지 <= K`, 최대 8문장
- 초과 시: 최초 1문장 + 최근 7문장 (A5)
- 본문 인물명 탭과 노드 선택이 **같은 응답**

---

## ❌ 에러 응답

### 공통 에러 코드

| 코드 | HTTP | 설명 |
|------|------|------|
| `NOT_FOUND` | 404 | 리소스 없음 |
| `BAD_REQUEST` | 400 | 잘못된 요청 |
| `RATE_LIMIT` | 429 | 호출량 상한 초과 |
| `INTERNAL_ERROR` | 500 | 서버 내부 오류 |
| `BOOK_NOT_READY` | 403 | 미완비 도서 |

### 예시

```json
{
  "error": "RATE_LIMIT",
  "message": "디바이스·도서당 분당 3회 제한을 초과했습니다",
  "retry_after": 45
}
```

---

## 🔗 R2의 기준점 스냅샷 인터페이스 (내부)

**R3, R4가 R2에게 요청하는 내부 함수**

```typescript
getCutoffSnapshot(deviceId: string, bookId: string): CutoffSnapshot

// 반환 타입
interface CutoffSnapshot {
  current_page: number
  cutoff: number          // current_page - 1
  percent: number
  chapter: {
    chapter_no: number
    title: string
  }
}
```

**규칙**:
- 각 요청은 시작 시 **1회** 호출
- 요청 내 모든 쿼리·조립·로그가 그 스냅샷 사용
- **이 함수 바깥에서 `page - 1` 계산 금지** (FR-BRF-005 🚦)

---

## 🧪 테스트 체크리스트

### API 통합 테스트 (CP3 전 필수)

- [ ] R2 → R4: 브리핑 조회 → 진도 % 일치
- [ ] R2 → R3: 기준점 스냅샷 → cutoff 값 일치
- [ ] R4 → R2: 진도 이벤트 → seq 역순 도착 시 무시
- [ ] R3 → R2: 챗봇 질의 → 기준점 동봉 처리
- [ ] R4 → R4: 관계도 → 후반부 관계 안 보임

### SSE 스트리밍 테스트

- [ ] 리캡: 첫 텍스트 1.0초 이내
- [ ] 챗봇: 첫 텍스트 2.0초 이내
- [ ] 중간 네트워크 끊김 시 재연결

---

## 📝 변경 이력

| 버전 | 날짜 | 변경 내용 |
|------|------|----------|
| v1.0 | 2026-08-19 | 초기 작성 |

---

**질문이나 변경 제안은 팀 회의에서 논의 후 반영합니다.**
