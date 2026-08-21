# R4 인수인계 — 조회 엔드포인트 5종 + 실 DB E2E (2026-08-21)

**브랜치** `feature/R4-query-endpoints` (원격과 동기화됨, 워킹 트리 깨끗)
**함께 볼 것** `query-endpoints-split.md`(3인 분담·병합 순서) · `docs/superpowers/plans/2026-08-20-r4-query-endpoints.md`(태스크 8개 전문, 결정 3건)

---

## 0. 30초 요약

조회 엔드포인트 5종을 **R1·R3·R4 3인이 나눠 전부 구현**했고, **실제 Postgres 를 붙여 E2E 까지 통과**했다.
`routes.ts` 에 R4 담당 501 스텁이 **0개**다.

E2E 에서 **mock 으로는 절대 잡을 수 없던 SQL 결함 1건**을 찾아 고쳤다(§4). 스포일러 상한이
실제 쿼리에서 작동하는 것도 처음 확인했다 — 이전까지는 전부 fake 리포지토리 검증이었다.

**남은 일은 코드가 아니라 전달이다** — R2·R3 소유 파일을 고쳤으니 알려야 한다(§5).

---

## 1. 완료 상태

| 엔드포인트 | 담당 | 상태 |
| --- | --- | --- |
| `GET /books` | R4 | ✅ 실 DB 확인 |
| `GET /books/:bookId/info` | R1 | ✅ |
| `GET /books/:bookId/pages/:pageNo` | R4 | ✅ |
| `GET /books/:bookId/ssabi/graph` | R3 | ✅ (R4 가 SQL 결함 수정, §4) |
| `GET /books/:bookId/ssabi/characters/:characterId` | R4 | ✅ |

**검증** — 백엔드 `tsc` 0건 / 31 suites · 263 tests, 프론트 `tsc`·`lint` 0건 / 28 files · 138 tests.
백엔드 lint 는 오류 0 · 경고 6(라우트의 의도된 `console.error`).

### 착수 전 결정 3건 (전부 확정)

| # | 결정 | 정한 사람 |
| --- | --- | --- |
| D-1 | `GET /books` 응답에서 `total_pages` 를 뺀다 (절대 규칙 2번) | R4 |
| D-2 | `/info` 의 `introduction` 은 `background_and_intro` 의 `kind='intro'` 행 | R1 |
| D-3 | `intro_summary` 를 넣되 **출처는 D-2 와 같은 행**. `books.intro_summary` 는 죽은 컬럼이다 | R4 |

---

## 2. 실행 환경 — 이걸 모르면 아무것도 안 뜬다

### DB

로컬 Docker Postgres 컨테이너 **`ssabi-pg`** (`pgvector/pgvector:pg15`, 포트 5432).
팀원의 `pg_dump` 를 복원해 만든 것이다. 꺼져 있으면 `docker start ssabi-pg` — 재부팅해도 데이터는 보존된다.

적재 데이터 — 도서 1(takryu, `ssabi_ready=true`) · 장 19 · 페이지 411(임베딩 411/411) ·
인물 57 · 별칭 103 · 노트 177 · 관계 202 · 용어 246 · 사건 151 · 검수 957.

### 환경 파일 (둘 다 gitignore — 커밋되지 않는다)

`backend/.env` 와 `frontend/.env` 가 있어야 한다. **없으면 백엔드가 부팅조차 못 한다.**
접속 문자열과 값은 그 파일들에 있다. 여기에는 적지 않는다.

주의할 항목 셋 —

- **`BEDROCK_CLAUDE_SONNET`·`BEDROCK_CLAUDE_HAIKU` 가 없으면 앱이 부팅되지 않는다.**
  조회 5종은 Bedrock 을 호출하지 않는데도 `llm-gateway` 가 모듈 로드 시점에 검증한다
  (`model-config.ts:60`). 값은 `.env.example` 의 것을 그대로 썼다.
- **`MOCK_MODE=false`** 로 둔다. `true` 면 챗봇이 실제 스냅샷 대신 고정 K 를 쓰고 근거 조립·
  검색·LLM 이 전부 mock 이 되어 게이트 검증이 무의미해진다.
- **`SESSION_TIMEOUT_MS=0`** 이 걸려 있다 — 검증용이다. 진입할 때마다 새 세션이 되어 브리핑을
  항상 거친다. 실제 30분 규칙을 보려면 이 줄을 지우고 서버를 재시작한다.

### 서버 두 개

```bash
cd backend  && npx ts-node src/index.ts          # 3000 — API
cd frontend && npx vite --port 5199 --strictPort # 5199 — 화면
```

프론트는 `VITE_USE_MOCK=false` 로 실제 API 를 본다. **백엔드가 꺼져 있으면 화면이 빈다.**
mock 만으로 화면을 보려면 `frontend/.env` 에서 `true` 로 바꾸고 Vite 를 재시작한다.

### 데모 상태 (K=100)

`device_id = 11111111-1111-4111-8111-111111111111`, `current_page = 101`,
저장 리캡 `cutoff_page = 100` / 723자. **기준점이 일치하므로 저장분을 재사용해 Bedrock 없이 브리핑이 뜬다**(R8).

브라우저는 `VITE_DEMO_DEVICE_ID` 로 이 디바이스를 쓴다 — localStorage 를 손댈 필요 없다.

**화면을 돌아다니면 진도가 실제로 갱신되어 이 상태가 깨진다.** 복구는 한 줄이다.

```bash
cd backend && npx ts-node src/batch/demo-seed/run-seed-demo-state.ts 100
```

진도를 `cutoff+1` 로 덮고 세션 행을 지운다. K=150 시나리오로 바꾸려면 이 스크립트와
`run-inject-demo-recap.ts` 를 **같은 인자로** 각각 실행한다(순서 무관, 동시 보관 불가).

---

## 3. E2E 로 확인된 것

**스포일러 상한이 실제 쿼리에서 작동한다.** DB 에 인물 57 · 관계 202 가 있는데 K=100 필터를
거쳐 **30 · 51** 만 내려왔고, 노드 최대 등장 페이지와 간선 최대 확립 페이지가 둘 다 **97** 이었다.
100 을 넘는 것이 응답에 하나도 섞이지 않았다 (FR-SPL-002 🚦).

이전까지 263개 테스트는 전부 mock QueryClient 였다 — **실제 SQL 은 한 번도 실행된 적이 없었다.**

---

## 4. E2E 가 잡아낸 결함 (수정 완료, 커밋 `6b14638`)

`GET /ssabi/graph` 가 500 으로 죽었다 — `column a.id does not exist`. 인물 관계도 화면 전체가
뜨지 않는 결함이다.

`findAliases` 가 `aliases` 테이블에 없는 컬럼 둘을 참조했다 —
`a.id`(이 테이블은 대리키가 없다. PK 가 `(book_id, alias, character_id)` 복합키다)와
`a.type`(실제 컬럼명은 `alias_type`). API 계약의 필드명이 `type` 이므로 SQL 에서
`alias_type AS type` 으로 매핑했다.

**근본 원인은 `shared/types.ts` 의 `Alias` 타입이 실제 스키마와 달랐던 것**이다(`id` 를 갖고
있었다). 그래서 `tsc` 도 mock 테스트도 잡지 못했다. 타입을 스키마에 맞추자 `tsc` 가 잔여
참조 3곳을 즉시 잡아냈다.

> **교훈** — 어댑터 테스트를 mock QueryClient 로만 하면 컬럼명 불일치가 통과한다.
> 나머지 쿼리(`characters`·`relationships`·`character_notes`)는 전수 대조해 문제없음을 확인했다.

---

## 5. 🔴 다른 파트에 반드시 전달할 것

### R3 에게

**소유 파일 3개를 R4 가 고쳤다** — `ssabi/pg-repository.ts` · `shared/types.ts` ·
`__mocks__/fake-repository.ts`. 내용은 §4.

**아직 남은 건이 하나 더 있다.** `getCharacterDetail`(`pg-repository.ts`)이 노트를
`slice(0, 8)` 로 **앞에서** 자른다. A5 는 "최대 8문장, 초과 시 **최초 1문장 + 최근 7문장**"
이므로 최근 서술이 통째로 사라진다 — 자가 검증 13번에 걸린다.

R4 가 만든 순수 함수 `truncateNotes`(`ssabi/notes.ts`)를 쓰는 서비스로 라우트를 연결해
**현재 API 응답은 A5 를 지킨다.** 다만 `getCharacterDetail` 은 아무도 호출하지 않는
**죽은 코드로 남아 있다** — 버그를 품은 채다. 제거하거나 `truncateNotes` 를 쓰도록 고칠지 R3 가 정한다.

### R2 에게

**`reading-state/session.service.ts` 를 R4 가 고쳤다.** 소유권 공유 합의(조회 엔드포인트 5종)
범위 밖이다.

`SESSION_TIMEOUT_MS` 환경변수가 설정된 경우에만 그 값으로 덮게 했다. **명세값 30분은 코드
기본값 그대로**이고 커밋되는 동작에 변화가 없다. 오타·음수는 명세값으로 되돌린다.
**배포 환경에는 설정하지 않는다** — 스위퍼(S4)가 같은 상수를 쓰므로 세션 종료 판정까지 함께 움직인다.

### 팀 전체에

- **`applied_cutoff` 가 관계도 응답에 없다.** `RelationshipGraph` 에 그 필드가 없어 서버가 실제로
  어떤 K 를 적용했는지 응답에서 확인할 수 없다. NFR-OBS-003 이 요구하고, 없으면 **FR-SPL-002 🚦
  판정 자체가 불가능하다.** team-sync §4.2 에 미해소로 기록돼 있던 항목이며 **아직 그대로다.**
- **`.prettierrc` 의 `semi` 를 백엔드도 `true` 로 바꿨다**(프론트와 통일). 84개 파일이 재포맷됐다.
  포맷 전용이며 재포맷 전후 263 tests 동일 통과를 확인했다.
- **`frontend/.vite/` 가 `.gitignore` 에 없다.** 빌드 캐시라 커밋되면 안 된다. 공용 파일이라 손대지 않았다.
- **`docker-compose.yml` 이 저장소에 없다.** DB 구성이 각자 로컬에만 있어 재현이 불가능하다.
  마이그레이션은 4개 파일 · 테이블 18개 · 확장은 `vector` 하나뿐이라 compose 하나면 재현된다.

---

## 6. 확인하지 못한 것 (추측과 사실을 구분한다)

- **A5 노트 절단이 실데이터로 검증되지 않았다.** K=100 에서 인물당 노트가 최대 6건이라 상한 8 에
  못 미쳐 절단 경로가 발동하지 않는다. 전체 데이터에는 장형보 16 · 박제호 12 · 남승재 11 이 있으니
  **K=150 시나리오면 발동한다.** 단위 테스트로는 고정돼 있다.
- **챗봇·리캡 생성은 동작하지 않는다.** AWS 자격증명이 없어 Bedrock 호출이 실패한다.
  조회 5종과는 무관하다.
- **상한 게이트 자가 검증 1~14 번을 전부 돌린 것은 아니다.** 관계도의 K 필터가 실제로 걸리는 것을
  확인했을 뿐, 나머지 항목은 별도 검증이 필요하다.
- **이 브랜치는 `develop` 에 병합되지 않았다.** develop 을 이쪽으로 당겨왔을 뿐이다.
  올릴 때 충돌은 `.gitignore` 와 `routes.ts` 두 파일에서 났었고 둘 다 양쪽을 살리는 방식으로 해결했다.
- **`Task 8`(`/characters`)은 원래 미배정이었고 R4 가 가져왔다.** 소비하는 화면(인물 상세)은
  아직 프론트에 없다.

---

## 7. 재개 방법

```bash
cd C:/Users/yemoy/aws-project/reading-recap
git branch --show-current        # feature/R4-query-endpoints
docker start ssabi-pg            # 꺼져 있으면
cd backend  && npx ts-node src/index.ts
cd frontend && npx vite --port 5199 --strictPort
```

브리핑이 안 뜨면 §2 의 데모 상태 복구 스크립트를 돌린다.
