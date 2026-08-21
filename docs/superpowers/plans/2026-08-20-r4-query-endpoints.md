# R4 조회 엔드포인트 5종 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `routes.ts`에서 501로 비어 있는 R4 담당 조회 엔드포인트 5개를 실제 Postgres 쿼리로 구현해, CP2에서 관계도를 실데이터로 확인하고 CP3 관통을 mock 없이 돌릴 수 있게 한다.

**Architecture:** R2의 `modules/reading-state/` 구조(포트 인터페이스 → PG 어댑터 → 서비스 → 조립 루트)를 그대로 따라 두 모듈을 만든다 — `modules/content/`(① 콘텐츠 조회)와 `modules/ssabi/`(③ 싸비 조회). 기준점 K는 **R2의 `cutoffService.getCutoffSnapshot()`에서만** 받아 오고 R4는 어디서도 파생 계산을 하지 않는다. 상한이 걸리는 SQL은 전부 `WHERE ... <= $cutoff`를 갖고, **이력형 관계의 최신 라벨 선택과 간선 무결성 검증은 서비스 계층의 순수 함수**로 둔다 — DB 없이 K별 positive/negative 쌍을 테스트하기 위해서다(FR-CHR-001 🚦이 이 프로젝트에서 가장 틀리기 쉬운 지점이다).

**Tech Stack:** TypeScript 5.5 · Express 4 · node-postgres(`pg`) · Jest 29 + ts-jest · PostgreSQL 15 + pgvector

**Spec:**
- `docs/dev-specs/R4-frontend.md` (origin/docs 브랜치) — S1·S4, 자가 검증 1~14·26
- `docs/api/API_CONTRACT.md` (origin/docs 브랜치) — 7~11번
- `docs/dev-specs/00-shared.md` §2.2·2.4·2.5
- `team-sync-r4.md` §4.1·4.2·4.3·4.5·4.7·4.10
- `backend/migrations/001_content_store.sql` (origin/feature/R1-pipeline) — **컬럼명의 유일한 정본**

---

## 선행 조건 (착수 전 확인)

- [x] **완료 (2026-08-20)** — `origin/feature/R2-core`를 `feature/R4-frontend`에 merge했다(`cdf21bc`). `routes.ts`의 R2 구간, `modules/reading-state/composition.ts`, 통합된 `jest.config.js`(`tests/` + `src/` 양쪽 글롭), `migrations/002_reading_state.sql`이 모두 들어와 있다. merge 후 검증: backend 121 tests / 15 suites 통과, frontend 77 tests / 18 files 통과, 양쪽 `tsc --noEmit` 0건.
  - ⚠️ R2-core는 아직 `main`에 merge되지 않은 상태에서 당겨온 것이다. R4의 PR을 main에 올릴 때 **R2의 PR이 먼저 merge되지 않으면 R4 PR에 R2 커밋 10개가 함께 실린다.** R2 PR을 먼저 보내는 순서를 지킨다.
- [ ] `feature/R1-pipeline`의 `backend/migrations/001_content_store.sql`이 `main`에 있거나, 최소한 로컬 DB에 적용돼 있다. **이 파일이 컬럼명의 정본이다** — `architecture-r1.md` 5.1.1의 한글 논리명이 아니라 이 DDL을 따른다.
- [ ] 작업 브랜치를 만든다: `git checkout -b feature/R4-query-endpoints`

---

## Global Constraints

모든 태스크의 요구사항에 아래가 암묵적으로 포함된다.

| # | 제약 | 근거 |
| --- | --- | --- |
| G1 | 상한이 걸리는 저장소 접근은 **전부** `findX(bookId, cutoff, ...)` 시그니처를 갖는다. cutoff 인자 없는 조회 함수를 만들지 않는다 | 00-shared §2.2, FR-SPL-002 🚦 |
| G2 | R4 코드 어디에서도 `page - 1`·`percent`를 계산하지 않는다. K와 percent는 `cutoffService.getCutoffSnapshot()` 반환값을 그대로 쓴다 | 절대 규칙 2번, FR-BRF-005 🚦 |
| G3 | 기준점 초과 여부를 **판별하는 코드를 만들지 않는다.** 쿼리 결과 0행이면 404이고, "초과라서 없음"과 "원래 없음"의 **에러 메시지를 구분하지 않는다** — 문구가 갈리면 그 자체가 판별기다 | 절대 규칙 7번, team-sync §4.2 |
| G4 | 상한 필터를 우회하는 폴백을 만들지 않는다. 조립 실패는 5xx이고 **부분 응답을 내지 않는다** | FR-SPL-005 🚦, R11, team-sync §4.2 |
| G5 | 공개 콘텐츠 스토어(`books`·`pages`·`chapters`·`characters`·`aliases`·`relationships`·`character_notes`·`background_and_intro`)에 **쓰기 금지.** R4는 읽기만 한다 | 절대 규칙 5번 |
| G6 | 응답 필드는 snake_case, 위치 페이지 필드명은 **DB 컬럼과 1:1** | team-sync §4.2 |
| G7 | 에러 코드는 대문자 상수 — `NOT_FOUND`(404) · `BAD_REQUEST`(400) · `BOOK_NOT_READY`(403) · `INTERNAL_ERROR`(500) | API_CONTRACT 에러 표, team-sync §4.2 |
| G8 | `book_id`는 **TEXT**(실제 값 `'takryu'`), `device_id`는 **UUID**. `X-Device-Id` 헤더가 없으면 400 | 001/002 migration, team-sync §4.8 |
| G9 | 구현 근거를 조항 ID 주석으로 남긴다 — `// FR-SPL-002 🚦` | CLAUDE.md 6장 |
| G10 | 테스트 이름에 조항 문구를 그대로 넣는다. 상한 테스트는 "0건"이며 **negative는 반드시 positive와 쌍으로** 쓴다 | CLAUDE.md 7장 |
| G11 | 다른 파트의 파일을 수정하지 않는다. `routes.ts`는 **501로 비어 있는 R4 구간 5개만** 손댄다 | CLAUDE.md 6장 |
| G12 | 커밋 형식 `{type}(R4): {요약} — {조항 ID}`, **작업 단위 1개 = 커밋 1개** | CLAUDE.md 10장 |

### 실제 컬럼명 (001_content_store.sql — 정본)

```
books                (book_id, title, author, cover_url, publish_year, extent,
                      intro_summary, total_pages, ssabi_ready, publish_status)
pages                (book_id, page_no, content, embedding)
chapters             (book_id, chapter_no, title, start_page, end_page)
characters           (id, book_id, name, first_appearance_page)
aliases              (book_id, alias, character_id, alias_type, first_appearance_page)
character_notes      (id, book_id, character_id, note, source_page)
relationships        (id, book_id, character_a_id, character_b_id, label, established_page)
background_and_intro (book_id, kind CHECK IN ('background','intro'), content)
```

⚠️ `books`의 PK는 `book_id`이지 `id`가 아니다. `chapter_summaries`에는 `title`·`end_page` 컬럼이 **없다**(둘 다 `chapters`에 있다). `aliases`의 유형 컬럼은 `alias_type`이지 `type`이 아니고 `id` 컬럼이 없다. `shared/types.ts`의 `Alias`·`Character` 인터페이스는 이 DDL과 어긋나 있으므로 **R4는 자기 모듈 안에 자체 Row 타입을 정의해 쓴다**(공용 타입 수정은 팀 합의 사항이라 건드리지 않는다).

---

## 착수 전 결정이 필요한 항목 3건

**아래 3건은 문서끼리 어긋나 있다. 실행자가 임의로 채우지 말고 확정을 받은 뒤 시작한다(CLAUDE.md 6장).** 각 항목에 이 계획의 권고안을 적었고, 태스크 본문은 권고안 기준으로 쓰였다.

---

### ✅ 확정 (2026-08-21) — 3건 모두 해소. Task 2·4 착수 가능

| # | 결정 | 정한 사람 |
| --- | --- | --- |
| D-1 | **`GET /books` 응답에서 `total_pages` 를 뺀다.** 프론트 타입·fixture 에서도 제거했다(커밋 `0348b7e`) | R4 |
| D-2 | **`/info` 의 `introduction` 은 `background_and_intro WHERE book_id=$1 AND kind='intro'`** | R1 |
| D-3 | **`GET /books` 에 `intro_summary: string \| null` 을 넣는다.** 단 **출처는 `background_and_intro` 의 `kind='intro'` 행**이다 — 계획 원문의 `books.intro_summary` 가 아니다 | R4 |

**D-1 근거** — `BookSummary.total_pages` 를 읽는 프론트 컴포넌트가 0개임을 확인했다. 읽기 화면의
"21 / 30" 은 `GET /info` 의 목차 마지막 장 `end_page` 에서 오는 별개 값이다. 남겨두면
`progress.current_page` 와 함께 퍼센트 재계산 재료가 된다(절대 규칙 2번, FR-BRF-005 🚦).

**D-2 근거 (R1 확인)** — 파이프라인이 `register.ts:141-146` 에서 실제로 이 테이블에 쓴다.
`background` 도 같은 테이블에 `kind='background'` 로 바로 위 줄에서 쓴다.

**D-3 출처 정정 — 이 계획의 원래 전제가 틀렸다.** 계획 원문은 "`books.intro_summary` 는
대시보드 카드용 짧은 소개로 본다"고 적었으나, **그 컬럼은 죽은 컬럼이다.** 001 DDL 15행에
선언만 있고 백엔드 전체에서 읽거나 쓰는 코드가 한 줄도 없다(R1 확인 + 컨트롤러 재확인).
그대로 두면 카드 소개가 영원히 비어 있게 된다.

대신 `/info` 와 같은 `background_and_intro` `kind='intro'` 행을 쓴다. 근거 셋 —
① 파이프라인이 실제로 채우는 유일한 곳이다 ② 도서 카드는 이미 `line-clamp-2` 로 두 줄만
보여주므로 긴 소개가 와도 화면이 깨지지 않는다 ③ 두 자리 모두 상한 예외 콘텐츠(R5)라
안전 등급이 같다. **틀렸을 때 비용** — 소개 첫 두 줄이 카드 문구로 어색하면, R1 이 짧은
전용 필드를 채우게 하고 `/books` 의 쿼리 한 줄만 바꾼다.

> `books.intro_summary` 는 R1 소유 파일(001 DDL)의 죽은 컬럼이다. 정리 여부는 R1 이 정한다.
> R4 는 참조하지 않는다.

---

## 팀 분담 (2026-08-21 합의) — R1 · R3 · R4 3인

**소유권** — 이 5개 엔드포인트는 계약상 R4 소유지만, **조회 엔드포인트 5종에 한해 세 사람이
소유권을 공유한다.** CLAUDE.md 6장("다른 파트의 파일을 수정하지 않는다")의 예외를 이 범위에
한해 두는 것이며, 범위 밖 파일에는 적용되지 않는다.

| 담당 | 태스크 | 분량 | 배정 근거 |
| --- | --- | --- | --- |
| **R1** | 1. content 모듈 → 4. `/info` | 572줄 | 001 DDL 저자. 컬럼명·적재 위치를 아는 유일한 사람이고 D-2 도 R1 이 답했다 |
| **R3** | 6. ssabi 모듈 → 7. `/graph` | 808줄 | 챗봇이 전량 주입(B-1)으로 인물·관계·배경지식을 이미 읽는다. 같은 테이블 도메인 |
| **R4** | 2. `/books` → 3. 가드 → 5. `/pages` | 683줄 | D-1·D-3 으로 `/books` 응답 형태를 정했고, 가드는 대시보드 카드 비활성화와 짝이다 |
| — | 8. `/characters` | 432줄 | **미배정.** 소비 화면이 없어 데모에 불필요. 먼저 끝난 사람이 가져간다 |

**R2 는 이번 분담에 없다.** 다섯 엔드포인트 전부가 `reading-state/cutoff.service.ts` 의
`getCutoffSnapshot` 을 호출하지만 **그 파일은 R2 소유다. 호출만 하고 수정하지 않는다.**
변경이 필요하면 R2 에게 요청한다.

---

## `routes.ts` 병합 순서

**충돌 지점은 핸들러가 아니라 파일 상단이다.** 9~14행 import 블록과 19행 근처 조립 줄에
세 사람이 모두 줄을 추가한다. 그 12줄 구역만 직렬화하면 나머지는 전부 병렬로 간다.

### Round 0 — 새 파일만. 순서 무관, 충돌 없음

- R1 `content/repository.ts` (포트 + Row 타입, 어댑터 없이)
- R3 `ssabi/repository.ts` (포트. **모든 메서드가 cutoff 인자를 갖는다** — G1)

**이 두 파일을 먼저 올리는 것이 3인 병렬의 전제다.** 포트만 있으면 나머지 사람이 fake
리포지토리로 서비스와 게이트 테스트를 먼저 쓸 수 있다. 어댑터를 기다리지 않는다.

### Round 1 — `routes.ts` 상단. 반드시 이 순서로, 한 번에 한 명

1. **R1 — content 조립** (import 1줄 + `createContentServices(pool)` 1줄)
   Task 1 의 어댑터 + composition 이 끝나야 나올 수 있다. **Round 1 전체의 선행이다.**
2. **R4 — 가드 배선** (import 1줄 + 4개 핸들러에 한 줄씩)
   가드 파일 자체는 이미 있다(`42d6ff2`). 남은 것은 배선뿐이다.
   **조립 바로 다음에 두는 이유** — 4개 핸들러를 건드리는데 지금은 본문이 501 한 줄이라
   가장 싸다. 구현이 끝난 뒤에 넣으면 완성된 핸들러 4개를 전부 다시 고쳐야 한다.
3. **R3 — ssabi 조립** (import 1줄 + `createSsabiServices(pool)` 1줄)

> **순서 정정 (2026-08-21).** 처음에는 가드를 1번에 뒀으나 성립하지 않는다. 가드 배선은
> 핸들러에서 `ensureBookReady(content, ...)` 로 **런타임 인스턴스**를 넘겨야 하는데, 그
> 인스턴스를 만드는 줄이 R1 의 조립이다. 타입만으로는 배선할 수 없다. R1 이 먼저다.

각 커밋은 **`routes.ts` 변경만 담는다.** 다른 파일과 섞으면 충돌 해결이 어려워진다.
앞사람 커밋이 올라간 것을 확인하고 시작한다.

### Round 2 — 핸들러 본문 교체. 순서 무관, 병렬

각자 자기 `router.get(...)` 블록만 바꾸므로 서로 부딪히지 않는다.

- R4 `/books` · `/pages` · R1 `/info` · R3 `/graph`

### Round 3

- `/characters` (Task 8)

### 공통 규칙

- 병합 직전 `git fetch && git rebase` — 팀원들이 자주 push 한다
- 작업 브랜치는 `feature/R4-query-endpoints` 를 공유한다
- 커밋 형식은 그대로 `{type}({파트}): {요약} — {조항 ID}`. 각자 자기 파트 태그를 쓴다

---

### D-1. `GET /books`에 `total_pages`를 넣는가

`team-sync-r4.md` §4.5(🟡 미해소)는 **넣지 말자**고 한다 — 대시보드에 `current_page / total_pages` 재계산 재료를 주지 않기 위해서다(절대 규칙 2번). 그런데 `frontend/src/types/book.ts`의 `BookSummary`에는 `total_pages: number`가 필수 필드로 들어 있다.

**확인한 사실** — `total_pages`를 **읽는 프론트 컴포넌트가 하나도 없다**(`grep`으로 확인: 타입 선언과 mock fixture에만 존재). 빼도 화면이 깨지지 않는다.

**권고** §4.5대로 응답에서 뺀다. Task 2에 프론트 타입·fixture에서 필드를 제거하는 스텝을 포함했다. 반대로 유지하기로 하면 Task 2의 Step 1·3·8만 `total_pages` 포함으로 바꾸면 된다.

### D-2. `GET /books/{b}/info`의 `introduction`은 어느 테이블에서 오는가

후보가 둘이다 — `books.intro_summary` 컬럼과 `background_and_intro` 테이블의 `kind='intro'` 행.

**권고** `background_and_intro`를 쓴다. 001 DDL의 해당 테이블 주석이 `FR-BRW-003 AC③`(= `/info`의 3영역 분리)를 근거로 명시하고 있고, "행 자체가 분리된다 — 한 행에 두 구분을 뭉치지 않는다"는 검수 기준(`info_separation_ok`)도 이 테이블에 걸려 있다. `books.intro_summary`는 대시보드 카드용 짧은 소개로 본다(D-3 참조). **R1 확인 필요.**

### D-3. 대시보드 카드의 소개 문구 필드가 계약에 없다

Figma 대시보드 시안의 도서 카드에는 2줄짜리 소개 문구가 있는데, `API_CONTRACT.md`의 `GET /books` 응답에도 `BookSummary` 타입에도 대응 필드가 없다.

**권고** `GET /books` 응답에 `intro_summary: string | null`을 추가한다(`/books`는 R4 소유 엔드포인트라 R4가 정한다 — §4.1·§4.10 선례). 상한 예외 콘텐츠라 K와 무관하다(R5). 단, D-1과 함께 프론트 타입도 같이 바뀌므로 **한 번에 결정한다.**

> 위 3건이 확정되기 전에는 Task 2를 시작하지 않는다. Task 1·5~8은 3건과 무관하므로 먼저 진행해도 된다.

---

## File Structure

| 파일 | 책임 |
| --- | --- |
| `backend/src/modules/content/repository.ts` | ① 콘텐츠 조회 포트 인터페이스 + Row 타입. **상한 예외 사유를 여기 문서화한다** |
| `backend/src/modules/content/pg-repository.ts` | ①의 Postgres 어댑터. SQL이 사는 유일한 곳 |
| `backend/src/modules/content/catalog.service.ts` | `GET /books` — 진도 결합 |
| `backend/src/modules/content/book-info.service.ts` | `GET /books/{b}/info` — 3영역 + 목차 |
| `backend/src/modules/content/page.service.ts` | `GET /books/{b}/pages/{n}` — 본문 + 이웃 페이지 |
| `backend/src/modules/content/composition.ts` | ① 조립 루트 |
| `backend/src/modules/ssabi/repository.ts` | ③ 싸비 조회 포트. **모든 메서드가 cutoff 인자를 갖는다**(G1) |
| `backend/src/modules/ssabi/pg-repository.ts` | ③의 Postgres 어댑터 |
| `backend/src/modules/ssabi/graph.ts` | 순수 함수 — 최신 라벨 선택 + 간선 무결성 (FR-CHR-001 🚦, FR-SPL-005 🚦) |
| `backend/src/modules/ssabi/graph.service.ts` | `GET /ssabi/graph` |
| `backend/src/modules/ssabi/notes.ts` | 순수 함수 — 인물 노트 8문장 절단 (A5) |
| `backend/src/modules/ssabi/character.service.ts` | `GET /ssabi/characters/{c}` |
| `backend/src/modules/ssabi/composition.ts` | ③ 조립 루트 |
| `backend/src/api/book-ready.guard.ts` | 미완비 도서 403 가드 (FR-BRW-002 🚦) — 4개 엔드포인트 공용 |
| `backend/src/api/routes.ts` | **수정만.** 501 핸들러 5개를 실제 구현으로 교체 |
| `backend/tests/unit/content/*.test.ts` | ① 테스트 (R2의 `tests/unit/` 관례) |
| `backend/tests/unit/ssabi/*.test.ts` | ③ 테스트 |
| `backend/tests/unit/ssabi/fixtures.ts` | 게이트 테스트용 시드 좌표 고정 |

**순수 함수(`graph.ts`·`notes.ts`)를 서비스에서 분리한 이유** — FR-CHR-001 🚦과 A5는 이 프로젝트에서 가장 틀리기 쉬운 로직인데, DB나 R2 서비스에 묶여 있으면 K별 positive/negative 쌍(자가 검증 7·8·9·10·13·14)을 쓰기가 어려워진다. 순수 함수로 떼면 fixture만으로 전부 검증된다.

**시드를 R4가 만들지 않는 이유** — 공개 콘텐츠 스토어 쓰기는 파이프라인(⑦)만 할 수 있다(절대 규칙 5번). 게이트 테스트는 fixture를 물린 fake 리포지토리로 돌리고, **실데이터 검증은 R1 파이프라인이 붙는 CP3에 한다.**

---

## Task 1: content 모듈 — 포트 + Postgres 어댑터

**Files:**
- Create: `backend/src/modules/content/repository.ts`
- Create: `backend/src/modules/content/pg-repository.ts`
- Test: `backend/tests/unit/content/pg-repository.test.ts`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces: `ContentRepository` 인터페이스와 Row 타입 6종(`BookCatalogRow`, `BookBasicRow`, `ChapterRow`, `PageRow`, `BackgroundAndIntro`), `QueryClient` 재사용 타입, 팩토리 `createPgContentRepository(db: QueryClient): ContentRepository`. Task 2·4·5가 이 인터페이스에만 의존한다.

- [ ] **Step 1: 포트 인터페이스를 쓴다**

`backend/src/modules/content/repository.ts`:

```ts
/**
 * ① 콘텐츠 조회 포트 (R4)
 *
 * @see docs/dev-specs/R4-frontend.md S1
 * @see backend/migrations/001_content_store.sql — 컬럼명 정본 (R1 소유, 읽기 전용)
 *
 * ⚠️ 이 파일의 조회 함수에는 cutoff 인자가 없다. 00-shared §2.2의 예외이며,
 *    근거를 함수별로 명시한다 — 예외를 사유 없이 두면 CP4 교차 리뷰(R2)에서
 *    FR-SPL-002 🚦 위반으로 잡혀야 정상이다.
 *      · 배경지식·소개 : 상한 대상이 아니다 (R5, FR-BGK-002 🚦)
 *      · 목차          : 전체 상시 노출 (FR-NAV-001, R3)
 *      · 본문 페이지    : 본문 접근은 제한하지 않는다 (R3, FR-SPL-001)
 *      · 카탈로그       : 도서 메타데이터에 위치 값이 없다
 */

/** GET /books 의 도서 1건 */
export interface BookCatalogRow {
  book_id: string
  title: string
  author: string
  cover_url: string | null
  intro_summary: string | null
  ssabi_ready: boolean
}

/** GET /books/{b}/info 의 basic_info */
export interface BookBasicRow {
  title: string
  author: string
  publish_year: number | null
  /** FR-BRW-003 AC② '분량' — 소개용 문구("411페이지"). total_pages와 별개 컬럼 */
  extent: string | null
  total_pages: number
}

/** 목차 1행 — 장 요약을 절대 넣지 않는다 (team-sync §4.1 R2 조건) */
export interface ChapterRow {
  chapter_no: number
  title: string
  start_page: number
  end_page: number
}

/** 본문 단건 + 이웃 페이지 (team-sync §4.10) */
export interface PageRow {
  page_no: number
  content: string
  prev_page: number | null
  next_page: number | null
}

export interface BackgroundAndIntro {
  introduction: string
  background: string
}

export interface ContentRepository {
  /** 전 도서. 미완비 도서도 포함해 내려보낸다 — 대시보드가 표지만 띄우고 잠그기 위해서다 (S2) */
  findCatalog(): Promise<BookCatalogRow[]>

  /** 미완비 판정용. 도서가 없으면 null (FR-BRW-002 🚦) */
  findReadiness(bookId: string): Promise<boolean | null>

  findBasicInfo(bookId: string): Promise<BookBasicRow | null>

  /** 상한 없음 — FR-NAV-001, R3 */
  findChapters(bookId: string): Promise<ChapterRow[]>

  /** 상한 없음 — R5, FR-BGK-002 🚦. 행이 없으면 빈 문자열 */
  findBackgroundAndIntro(bookId: string): Promise<BackgroundAndIntro>

  /** 상한 없음 — R3. 해당 페이지가 없으면 null */
  findPage(bookId: string, pageNo: number): Promise<PageRow | null>
}
```

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`backend/tests/unit/content/pg-repository.test.ts`:

```ts
/**
 * ① 콘텐츠 조회 Postgres 어댑터 — mock QueryClient
 * (R2 pg-repository.test.ts, R1 register.test.ts와 같은 스타일: 실 DB 없이 SQL·파라미터 검증)
 */

import { createPgContentRepository } from '../../../src/modules/content/pg-repository'
import type { QueryClient } from '../../../src/modules/content/pg-repository'

function mockClient(...resultSets: any[][]): {
  client: QueryClient
  calls: { sql: string; params?: unknown[] }[]
} {
  const calls: { sql: string; params?: unknown[] }[] = []
  let i = 0
  return {
    client: {
      query: async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params })
        return { rows: resultSets[i++] ?? [] }
      },
    },
    calls,
  }
}

describe('createPgContentRepository', () => {
  test('findCatalog는 books에서 미완비 도서까지 전부 읽는다 (S2 — 표지만 띄우고 잠근다)', async () => {
    const { client, calls } = mockClient([
      { book_id: 'takryu', title: '탁류', author: '채만식', cover_url: null, intro_summary: '소개', ssabi_ready: true },
    ])
    const repo = createPgContentRepository(client)

    const rows = await repo.findCatalog()

    expect(rows).toHaveLength(1)
    expect(rows[0].book_id).toBe('takryu')
    expect(calls[0].sql).toMatch(/FROM books/)
    // 미완비 도서를 제외하는 WHERE가 없어야 한다
    expect(calls[0].sql).not.toMatch(/ssabi_ready\s*=\s*(TRUE|true)/)
  })

  test('findReadiness는 ssabi_ready를 읽고, 도서가 없으면 null (FR-BRW-002 🚦)', async () => {
    const found = mockClient([{ ssabi_ready: false }])
    expect(await createPgContentRepository(found.client).findReadiness('takryu')).toBe(false)
    expect(found.calls[0].params).toEqual(['takryu'])

    const missing = mockClient([])
    expect(await createPgContentRepository(missing.client).findReadiness('nope')).toBeNull()
  })

  test('findBasicInfo는 publish_year·extent·total_pages를 books에서 읽는다 (FR-BRW-003 AC②)', async () => {
    const { client, calls } = mockClient([
      { title: '탁류', author: '채만식', publish_year: 1937, extent: '411페이지', total_pages: 411 },
    ])
    const result = await createPgContentRepository(client).findBasicInfo('takryu')

    expect(result).toEqual({
      title: '탁류',
      author: '채만식',
      publish_year: 1937,
      extent: '411페이지',
      total_pages: 411,
    })
    expect(calls[0].params).toEqual(['takryu'])
  })

  test('findChapters는 장 경계 4필드만 읽는다 — 장 요약 컬럼을 섞지 않는다 (team-sync §4.1 R2 조건)', async () => {
    const { client, calls } = mockClient([
      { chapter_no: 1, title: '제1장', start_page: 1, end_page: 20 },
    ])
    const rows = await createPgContentRepository(client).findChapters('takryu')

    expect(rows[0]).toEqual({ chapter_no: 1, title: '제1장', start_page: 1, end_page: 20 })
    expect(calls[0].sql).toMatch(/FROM chapters/)
    // 장 요약이 한 응답에 섞이면 정적 캐시로 전량이 프론트에 내려가 상한이 뚫린다
    expect(calls[0].sql).not.toMatch(/chapter_summaries/)
    expect(calls[0].sql).not.toMatch(/summary/)
  })

  test('findBackgroundAndIntro는 kind로 두 행을 갈라 담고, 없는 구분은 빈 문자열 (R5)', async () => {
    const { client, calls } = mockClient([
      { kind: 'background', content: '일제강점기 후반...' },
      { kind: 'intro', content: '1930년대 군산...' },
    ])
    const result = await createPgContentRepository(client).findBackgroundAndIntro('takryu')

    expect(result).toEqual({ background: '일제강점기 후반...', introduction: '1930년대 군산...' })
    expect(calls[0].sql).toMatch(/FROM background_and_intro/)

    const empty = mockClient([])
    expect(await createPgContentRepository(empty.client).findBackgroundAndIntro('takryu')).toEqual({
      background: '',
      introduction: '',
    })
  })

  test('findPage는 이웃 페이지를 산술이 아니라 DB에서 구한다 (team-sync §4.10)', async () => {
    const { client, calls } = mockClient([
      { page_no: 5, content: '본문', prev_page: 4, next_page: 6 },
    ])
    const result = await createPgContentRepository(client).findPage('takryu', 5)

    expect(result).toEqual({ page_no: 5, content: '본문', prev_page: 4, next_page: 6 })
    expect(calls[0].params).toEqual(['takryu', 5])
    expect(calls[0].sql).toMatch(/MAX\(page_no\)/)
    expect(calls[0].sql).toMatch(/MIN\(page_no\)/)
  })

  test('findPage — 페이지가 없으면 null (404의 재료)', async () => {
    const { client } = mockClient([])
    expect(await createPgContentRepository(client).findPage('takryu', 999)).toBeNull()
  })
})
```

- [ ] **Step 3: 테스트가 실패하는지 확인한다**

Run: `cd backend && npx jest tests/unit/content/pg-repository.test.ts`
Expected: FAIL — `Cannot find module '../../../src/modules/content/pg-repository'`

- [ ] **Step 4: 어댑터를 구현한다**

`backend/src/modules/content/pg-repository.ts`:

```ts
/**
 * ① 콘텐츠 조회 Postgres 어댑터 (R4)
 *
 * R2 pg-repository.ts와 같은 패턴 — pg.Pool을 직접 import하지 않고 최소 QueryClient를 받는다.
 * 실 배선(pool 주입)은 composition.ts의 몫이고, SQL 자체는 mock QueryClient로 단위 테스트한다.
 *
 * ⚠️ books·pages·chapters·background_and_intro는 R1 소유 테이블이다 (001_content_store.sql).
 *    이 파일은 컬럼명을 그대로 읽기만 한다 — 쓰기 없음 (절대 규칙 5번).
 */

import type {
  BackgroundAndIntro,
  BookBasicRow,
  BookCatalogRow,
  ChapterRow,
  ContentRepository,
  PageRow,
} from './repository'

export interface QueryClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>
}

export function createPgContentRepository(db: QueryClient): ContentRepository {
  return {
    async findCatalog(): Promise<BookCatalogRow[]> {
      // 미완비 도서도 내려보낸다 — 대시보드가 표지만 띄우고 클릭을 잠근다 (S2, FR-BRW-002 🚦).
      // 진입 차단은 UI가 아니라 book-ready.guard.ts와 R2의 POST /entry가 한다.
      const { rows } = await db.query(
        `SELECT book_id, title, author, cover_url, intro_summary, ssabi_ready
           FROM books
          ORDER BY title ASC`
      )
      return rows
    },

    async findReadiness(bookId: string): Promise<boolean | null> {
      // FR-BRW-002 🚦 — R2의 POST /entry와 같은 컬럼(ssabi_ready)을 본다.
      // 서로 다른 컬럼을 보면 대시보드는 잠겨 있는데 직접 진입은 되는 구멍이 생긴다 (R12, team-sync §4.7)
      const { rows } = await db.query(`SELECT ssabi_ready FROM books WHERE book_id = $1`, [bookId])
      if (rows.length === 0) return null
      return rows[0].ssabi_ready
    },

    async findBasicInfo(bookId: string): Promise<BookBasicRow | null> {
      // FR-BRW-003 AC② — 제목·저자·발표연도·분량
      const { rows } = await db.query(
        `SELECT title, author, publish_year, extent, total_pages
           FROM books
          WHERE book_id = $1`,
        [bookId]
      )
      if (rows.length === 0) return null
      return rows[0]
    },

    async findChapters(bookId: string): Promise<ChapterRow[]> {
      // FR-NAV-001, R3 — 목차는 전체 상시 노출이라 cutoff를 걸지 않는다.
      // ⚠️ chapter_summaries를 JOIN하지 않는다. 장 요약은 상한 대상(FR-SPL-003 🚦)이라
      //    한 응답에 섞이면 정적 캐시로 전량이 프론트에 내려가 상한이 뚫린다 (team-sync §4.1)
      const { rows } = await db.query(
        `SELECT chapter_no, title, start_page, end_page
           FROM chapters
          WHERE book_id = $1
          ORDER BY chapter_no ASC`,
        [bookId]
      )
      return rows
    },

    async findBackgroundAndIntro(bookId: string): Promise<BackgroundAndIntro> {
      // R5, FR-BGK-002 🚦 — 배경지식은 상한 대상이 아니다. 1페이지 시점에도 안전한 고정
      // 콘텐츠이며 안전 보증은 검수(R1)가 한다. 여기에 cutoff 필터를 걸지 않는다.
      const { rows } = await db.query(
        `SELECT kind, content FROM background_and_intro WHERE book_id = $1`,
        [bookId]
      )
      const byKind = new Map<string, string>(rows.map((r: any) => [r.kind, r.content]))
      return {
        introduction: byKind.get('intro') ?? '',
        background: byKind.get('background') ?? '',
      }
    },

    async findPage(bookId: string, pageNo: number): Promise<PageRow | null> {
      // R3 — 본문 접근은 제한하지 않는다. 진도에도 관여하지 않는다 (FR-PRG-001, 선요청 안전).
      // prev/next를 page ± 1 산술이 아니라 실제 행에서 구한다 — 페이지 번호에 구멍이 있어도
      // 정확하고, 프론트가 이동 산술을 하지 않게 된다 (team-sync §4.10)
      const { rows } = await db.query(
        `SELECT p.page_no,
                p.content,
                (SELECT MAX(page_no) FROM pages WHERE book_id = $1 AND page_no < $2) AS prev_page,
                (SELECT MIN(page_no) FROM pages WHERE book_id = $1 AND page_no > $2) AS next_page
           FROM pages p
          WHERE p.book_id = $1 AND p.page_no = $2`,
        [bookId, pageNo]
      )
      if (rows.length === 0) return null
      return rows[0]
    },
  }
}
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `cd backend && npx jest tests/unit/content/pg-repository.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 6: 커밋**

```bash
git add backend/src/modules/content/repository.ts backend/src/modules/content/pg-repository.ts backend/tests/unit/content/pg-repository.test.ts
git commit -m "feat(R4): 콘텐츠 조회 포트·Postgres 어댑터 — FR-BRW-001·003, FR-NAV-001, R5"
```

---

## Task 2: `GET /books` — 카탈로그

> **선행:** D-1·D-3 결정 확정. 이 태스크는 "`total_pages` 제외 + `intro_summary` 포함" 권고안 기준으로 쓰였다.

**Files:**
- Create: `backend/src/modules/content/catalog.service.ts`
- Create: `backend/src/modules/content/composition.ts`
- Modify: `backend/src/api/routes.ts` (`router.get('/books', ...)` 핸들러 교체)
- Modify: `frontend/src/types/book.ts` (D-1·D-3 반영)
- Modify: `frontend/mocks/fixtures.ts` (같은 반영)
- Test: `backend/tests/unit/content/catalog.service.test.ts`

**Interfaces:**
- Consumes: Task 1의 `ContentRepository`. R2의 `ReadingPositionRepository.findPosition(deviceId, bookId): Promise<StoredPosition | null>`과 `CutoffService.getCutoffSnapshot(deviceId, bookId): Promise<CutoffSnapshot>` (`src/modules/reading-state/`에서 import).
- Produces: `createCatalogService(deps): CatalogService`, `CatalogService.getCatalog(deviceId: string): Promise<CatalogResponse>`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`backend/tests/unit/content/catalog.service.test.ts`:

```ts
/**
 * GET /books — FR-BRW-001·002
 *
 * 핵심 두 가지:
 *   ① 읽던 도서만 progress를 담는다 (저장 위치가 없으면 필드 자체가 없다)
 *   ② percent는 R2 스냅샷 값을 그대로 옮긴다 — R4가 계산하지 않는다 (FR-BRF-005 🚦)
 */

import { createCatalogService } from '../../../src/modules/content/catalog.service'
import type { BookCatalogRow, ContentRepository } from '../../../src/modules/content/repository'

const CATALOG: BookCatalogRow[] = [
  { book_id: 'takryu', title: '탁류', author: '채만식', cover_url: 'https://x/1.png', intro_summary: '1930년대 군산', ssabi_ready: true },
  { book_id: 'other', title: '다른 책', author: '아무개', cover_url: null, intro_summary: null, ssabi_ready: false },
]

function repoWith(catalog: BookCatalogRow[]): ContentRepository {
  return {
    findCatalog: async () => catalog,
    findReadiness: async () => true,
    findBasicInfo: async () => null,
    findChapters: async () => [],
    findBackgroundAndIntro: async () => ({ introduction: '', background: '' }),
    findPage: async () => null,
  }
}

const SNAPSHOT = {
  current_page: 80,
  cutoff: 79,
  percent: 23.5,
  chapter: { chapter_no: 3, title: '제3장' },
}

describe('CatalogService', () => {
  test('읽던 도서만 progress를 포함한다 (FR-BRW-001)', async () => {
    const service = createCatalogService({
      content: repoWith(CATALOG),
      positions: { findPosition: async (_d, bookId) => (bookId === 'takryu' ? { current_page: 80, event_seq: 3 } : null) } as any,
      cutoffService: { getCutoffSnapshot: async () => SNAPSHOT } as any,
    })

    const { books } = await service.getCatalog('device-1')

    // 정렬은 리포지토리(ORDER BY title)가 한다 — 서비스는 순서를 바꾸지 않는다
    expect(books.map((b) => b.book_id)).toEqual(['takryu', 'other'])
    const takryu = books.find((b) => b.book_id === 'takryu')!
    const other = books.find((b) => b.book_id === 'other')!
    expect(takryu.progress).toEqual({ current_page: 80, percent: 23.5 })
    expect(other.progress).toBeUndefined()
  })

  test('percent는 R2 스냅샷 값을 그대로 옮긴다 — 재계산 0건 (FR-BRF-005 🚦)', async () => {
    const service = createCatalogService({
      content: repoWith([CATALOG[0]]),
      positions: { findPosition: async () => ({ current_page: 80, event_seq: 3 }) } as any,
      cutoffService: { getCutoffSnapshot: async () => ({ ...SNAPSHOT, percent: 0.2 }) } as any,
    })

    const { books } = await service.getCatalog('device-1')

    // 0.2를 0으로 반올림하거나 재계산하지 않는다. 반올림은 프론트 표시 단계의 몫이다 (team-sync §4.9)
    expect(books[0].progress!.percent).toBe(0.2)
  })

  test('미완비 도서도 목록에 담고 ssabi_ready를 그대로 내려보낸다 (FR-BRW-002 🚦)', async () => {
    const service = createCatalogService({
      content: repoWith(CATALOG),
      positions: { findPosition: async () => null } as any,
      cutoffService: { getCutoffSnapshot: async () => SNAPSHOT } as any,
    })

    const { books } = await service.getCatalog('device-1')

    expect(books).toHaveLength(2)
    expect(books.find((b) => b.book_id === 'other')!.ssabi_ready).toBe(false)
  })

  test('응답에 total_pages가 없다 — 대시보드에 나눗셈 재료를 주지 않는다 (절대 규칙 2번, team-sync §4.5)', async () => {
    const service = createCatalogService({
      content: repoWith([CATALOG[0]]),
      positions: { findPosition: async () => ({ current_page: 80, event_seq: 3 }) } as any,
      cutoffService: { getCutoffSnapshot: async () => SNAPSHOT } as any,
    })

    const { books } = await service.getCatalog('device-1')

    expect(books[0]).not.toHaveProperty('total_pages')
  })

  test('진도 조회가 실패해도 목록 전체를 죽이지 않는다 — 그 도서만 progress 없이 내려간다', async () => {
    const service = createCatalogService({
      content: repoWith([CATALOG[0]]),
      positions: { findPosition: async () => ({ current_page: 80, event_seq: 3 }) } as any,
      cutoffService: {
        getCutoffSnapshot: async () => {
          throw new Error('장 커버리지 구멍')
        },
      } as any,
    })

    const { books } = await service.getCatalog('device-1')

    // 실패 = 미노출 (R11) — 없는 진도를 지어내지 않고, 대시보드 자체는 뜬다
    expect(books[0].progress).toBeUndefined()
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd backend && npx jest tests/unit/content/catalog.service.test.ts`
Expected: FAIL — `Cannot find module '.../catalog.service'`

- [ ] **Step 3: 서비스를 구현한다**

`backend/src/modules/content/catalog.service.ts`:

```ts
/**
 * GET /books — 카탈로그 (R4, S1)
 *
 * 조항: FR-BRW-001(목록) · FR-BRW-002 🚦(완비 여부) · FR-BRF-005 🚦(파생값 단일 원천)
 *
 * ⚠️ percent를 여기서 계산하지 않는다. R2 cutoffService가 만든 값을 그대로 옮긴다.
 *    대시보드 % · 브리핑 % · 싸비 기준점의 "불일치 0건"은 검증이 아니라
 *    계산 지점 단일화로 달성한다 (00-shared §2.1).
 */

import type { CutoffService } from '../reading-state/cutoff.service'
import type { ReadingPositionRepository } from '../reading-state/repository'
import type { ContentRepository } from './repository'

export interface CatalogItem {
  book_id: string
  title: string
  author: string
  cover_url: string | null
  /** 대시보드 카드 소개 문구. 상한 예외 (R5) — team-sync D-3 */
  intro_summary: string | null
  ssabi_ready: boolean
  /** 읽던 도서만. 저장 위치가 없으면 필드 자체가 없다 */
  progress?: { current_page: number; percent: number }
}

export interface CatalogResponse {
  books: CatalogItem[]
}

export interface CatalogServiceDeps {
  content: ContentRepository
  positions: ReadingPositionRepository
  cutoffService: CutoffService
}

export interface CatalogService {
  getCatalog(deviceId: string): Promise<CatalogResponse>
}

export function createCatalogService(deps: CatalogServiceDeps): CatalogService {
  const { content, positions, cutoffService } = deps

  return {
    async getCatalog(deviceId: string): Promise<CatalogResponse> {
      const catalog = await content.findCatalog()

      const books = await Promise.all(
        catalog.map(async (row): Promise<CatalogItem> => {
          const item: CatalogItem = {
            book_id: row.book_id,
            title: row.title,
            author: row.author,
            cover_url: row.cover_url,
            intro_summary: row.intro_summary,
            ssabi_ready: row.ssabi_ready,
            // total_pages를 싣지 않는다 — 프론트에 current_page / total_pages 재계산
            // 재료를 주지 않기 위해서다 (절대 규칙 2번, team-sync §4.5)
          }

          // 저장 위치가 없으면 "읽던 도서"가 아니다. getCutoffSnapshot은 위치가 없어도
          // current_page=1로 스냅샷을 만들어 주므로, 그것만 보고 판단하면 읽지 않은 책에
          // 0.2% 진도가 생긴다 — 먼저 저장 위치의 존재를 확인한다
          const stored = await positions.findPosition(deviceId, row.book_id)
          if (stored === null) return item

          try {
            const snapshot = await cutoffService.getCutoffSnapshot(deviceId, row.book_id)
            item.progress = {
              current_page: snapshot.current_page,
              percent: snapshot.percent, // R2 계산값 — 그대로 옮긴다 (FR-BRF-005 🚦)
            }
          } catch {
            // 스냅샷 실패(장 커버리지 결함 등)는 진도 미표시로 끝낸다. 기본값으로 메우지 않는다
            // (실패 = 미노출, FR-SPL-005 🚦 / R11). 도서 카드 자체는 뜬다
          }

          return item
        })
      )

      return { books }
    },
  }
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd backend && npx jest tests/unit/content/catalog.service.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: 조립 루트를 만든다**

`backend/src/modules/content/composition.ts`:

```ts
/**
 * ① 콘텐츠 조회 조립 루트 (R4)
 *
 * R2 composition.ts와 같은 규칙 — 라우트가 배선을 직접 하지 않고 이 함수를 통해 서비스를 얻는다.
 * 진도·기준점은 R2 서비스를 주입받는다 (파생 계산 지점을 늘리지 않기 위해서다).
 */

import type { Pool } from 'pg'
import type { ReadingStateServices } from '../reading-state/composition'
import { createPgReadingPositionRepository } from '../reading-state/pg-repository'
import { createCatalogService } from './catalog.service'
import { createBookInfoService } from './book-info.service'
import { createPageService } from './page.service'
import { createPgContentRepository, type QueryClient } from './pg-repository'
import type { ContentRepository } from './repository'

export interface ContentServices {
  content: ContentRepository
  catalogService: ReturnType<typeof createCatalogService>
  bookInfoService: ReturnType<typeof createBookInfoService>
  pageService: ReturnType<typeof createPageService>
}

function toQueryClient(pool: Pool): QueryClient {
  return { query: (sql: string, params?: unknown[]) => pool.query(sql, params) }
}

export function createContentServices(pool: Pool, readingState: ReadingStateServices): ContentServices {
  const db = toQueryClient(pool)
  const content = createPgContentRepository(db)
  const positions = createPgReadingPositionRepository(db)

  return {
    content,
    catalogService: createCatalogService({
      content,
      positions,
      cutoffService: readingState.cutoffService,
    }),
    bookInfoService: createBookInfoService({ content }),
    pageService: createPageService({ content }),
  }
}
```

> ⚠️ 이 파일은 Task 4·5의 `createBookInfoService`·`createPageService`를 import하므로 **Task 5까지 끝나야 컴파일된다.** Task 2 시점에는 그 두 줄과 두 필드를 주석 처리해 두고, Task 5 Step 5에서 되살린다.

- [ ] **Step 6: 라우트를 붙인다**

`backend/src/api/routes.ts`의 import 블록 끝에 추가:

```ts
import { createContentServices } from '../modules/content/composition';
```

`const readingState = createReadingStateServices(pool);` 바로 아래에 추가:

```ts
// R4 조회 서비스 조립 — R2의 기준점·진도 서비스를 주입받는다 (content/composition.ts)
const contentServices = createContentServices(pool, readingState);
```

그리고 501 핸들러를 교체한다. **기존:**

```ts
router.get('/books', (_req: Request, res: Response) => {
  return res.status(501).json({ error: 'NOT_IMPLEMENTED', message: 'R4 담당' });
});
```

**교체 후:**

```ts
router.get('/books', async (req: Request, res: Response) => {
  const deviceId = requireDeviceId(req, res);
  if (!deviceId) return;

  try {
    const catalog = await contentServices.catalogService.getCatalog(deviceId);
    return res.json(catalog);
  } catch (error) {
    console.error('[API] Catalog error', { error });
    // 조립 실패는 5xx — 부분 응답을 내지 않는다 (team-sync §4.2, R11)
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});
```

- [ ] **Step 7: 백엔드 전체 테스트를 돌린다**

Run: `cd backend && npx jest && npx tsc --noEmit`
Expected: 기존 테스트 전부 PASS, 타입 에러 0건

- [ ] **Step 8: 프론트 타입을 응답에 맞춘다 (D-1·D-3)**

`frontend/src/types/book.ts`의 `BookSummary`에서 `total_pages` 줄을 지우고 `intro_summary`를 넣는다:

```ts
/** GET /books 의 도서 1건 (FR-BRW-001·002) */
export interface BookSummary {
  book_id: string;
  title: string;
  author: string;
  cover_url: string | null;
  /**
   * 대시보드 카드 소개 문구. 상한 예외 (R5).
   * total_pages 는 싣지 않는다 — 대시보드에 current_page / total_pages 재계산 재료를
   * 주지 않기 위해서다 (절대 규칙 2번, team-sync-r4.md §4.5).
   */
  intro_summary: string | null;
  /** 미완비 도서는 클릭 불가 + 서버도 거절 (FR-BRW-002 🚦) */
  ssabi_ready: boolean;
  /** 읽던 도서만 내려온다. percent 는 서버 계산값 — 재계산 금지 (FR-BRF-005 🚦) */
  progress?: {
    current_page: number;
    percent: number;
  };
}
```

`frontend/mocks/fixtures.ts`의 `mockCatalog` 각 항목에서 `total_pages: 30,`을 지우고 `intro_summary`를 넣는다(문구는 기존 도서 설명 사용).

- [ ] **Step 9: 프론트 테스트를 돌린다**

Run: `cd frontend && npm test && npx tsc --noEmit`
Expected: PASS, 타입 에러 0건

- [ ] **Step 10: 커밋**

```bash
git add backend/src/modules/content/catalog.service.ts backend/src/modules/content/composition.ts backend/src/api/routes.ts backend/tests/unit/content/catalog.service.test.ts frontend/src/types/book.ts frontend/mocks/fixtures.ts
git commit -m "feat(R4): GET /books 카탈로그 — FR-BRW-001·002, FR-BRF-005"
```

---

## Task 3: 미완비 도서 가드 (`BOOK_NOT_READY`)

**Files:**
- Create: `backend/src/api/book-ready.guard.ts`
- Test: `backend/tests/unit/content/book-ready.guard.test.ts`

**Interfaces:**
- Consumes: Task 1의 `ContentRepository.findReadiness(bookId)`.
- Produces: `ensureBookReady(content: ContentRepository, bookId: string, res: Response): Promise<boolean>` — 진행해도 되면 `true`, 이미 응답을 보냈으면 `false`. Task 4·5·7·8이 핸들러 첫 줄에서 쓴다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`backend/tests/unit/content/book-ready.guard.test.ts`:

```ts
/**
 * FR-BRW-002 🚦 — 미완비 도서는 API를 직접 호출해도 서버가 거절한다.
 * UI 차단만으로는 부족하다 (R4-frontend.md 자가 검증 25번).
 */

import { ensureBookReady } from '../../../src/api/book-ready.guard'
import type { ContentRepository } from '../../../src/modules/content/repository'

function repoWithReadiness(value: boolean | null): ContentRepository {
  return {
    findCatalog: async () => [],
    findReadiness: async () => value,
    findBasicInfo: async () => null,
    findChapters: async () => [],
    findBackgroundAndIntro: async () => ({ introduction: '', background: '' }),
    findPage: async () => null,
  }
}

function mockRes() {
  const sent: { status?: number; body?: any } = {}
  const res: any = {
    status(code: number) {
      sent.status = code
      return res
    },
    json(body: any) {
      sent.body = body
      return res
    },
  }
  return { res, sent }
}

describe('ensureBookReady', () => {
  test('완비 도서는 통과시킨다 (true, 응답 없음)', async () => {
    const { res, sent } = mockRes()
    expect(await ensureBookReady(repoWithReadiness(true), 'takryu', res)).toBe(true)
    expect(sent.status).toBeUndefined()
  })

  test('FR-BRW-002 🚦: 미완비 도서는 API를 직접 호출해도 403 BOOK_NOT_READY로 거절', async () => {
    const { res, sent } = mockRes()
    expect(await ensureBookReady(repoWithReadiness(false), 'takryu', res)).toBe(false)
    expect(sent.status).toBe(403)
    expect(sent.body.error).toBe('BOOK_NOT_READY') // 대문자 상수 (team-sync §4.2)
  })

  test('없는 도서는 404 NOT_FOUND', async () => {
    const { res, sent } = mockRes()
    expect(await ensureBookReady(repoWithReadiness(null), 'nope', res)).toBe(false)
    expect(sent.status).toBe(404)
    expect(sent.body.error).toBe('NOT_FOUND')
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd backend && npx jest tests/unit/content/book-ready.guard.test.ts`
Expected: FAIL — `Cannot find module '../../../src/api/book-ready.guard'`

- [ ] **Step 3: 가드를 구현한다**

`backend/src/api/book-ready.guard.ts`:

```ts
/**
 * 미완비 도서 조회 거절 — FR-BRW-002 🚦, R12
 *
 * 차단 지점이 셋으로 갈린다 (team-sync-r4.md §4.7):
 *   플래그 설정 → R1 (검수 후 ssabi_ready)
 *   진입 거절   → R2 (POST /books/{b}/entry)
 *   조회 거절   → R4 (이 파일) — /info · /pages · /ssabi/*
 *
 * 대시보드의 클릭 불가는 UI 조치일 뿐이다. 자가 검증 25번이 "API를 직접 호출해도
 * 서버가 거절"을 요구하므로 둘 다 있어야 한다.
 */

import type { Response } from 'express'
import type { ContentRepository } from '../modules/content/repository'

/**
 * @returns 진행해도 되면 true. false면 이 함수가 이미 응답을 보냈으므로 핸들러는 즉시 return한다.
 */
export async function ensureBookReady(
  content: ContentRepository,
  bookId: string,
  res: Response
): Promise<boolean> {
  const ready = await content.findReadiness(bookId)

  if (ready === null) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Book not found' })
    return false
  }

  if (!ready) {
    // 대문자 상수 — API_CONTRACT.md 에러 표 형식 (team-sync §4.2)
    res.status(403).json({ error: 'BOOK_NOT_READY', message: 'Book is not ready' })
    return false
  }

  return true
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd backend && npx jest tests/unit/content/book-ready.guard.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add backend/src/api/book-ready.guard.ts backend/tests/unit/content/book-ready.guard.test.ts
git commit -m "feat(R4): 미완비 도서 조회 거절 가드 — FR-BRW-002, R12"
```

---

## Task 4: `GET /books/:bookId/info` — i 팝업 3영역 + 목차

**Files:**
- Create: `backend/src/modules/content/book-info.service.ts`
- Modify: `backend/src/api/routes.ts` (`/books/:bookId/info` 핸들러 교체)
- Test: `backend/tests/unit/content/book-info.service.test.ts`

**Interfaces:**
- Consumes: Task 1의 `ContentRepository`, Task 3의 `ensureBookReady`.
- Produces: `createBookInfoService(deps: { content: ContentRepository }): BookInfoService`, `BookInfoService.getInfo(bookId: string): Promise<BookInfoResponse | null>`. 응답 형태는 `frontend/src/types/book.ts`의 `BookInfoResponse`와 1:1이다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`backend/tests/unit/content/book-info.service.test.ts`:

```ts
/**
 * GET /books/{b}/info — FR-BRW-003 AC②·AC③, FR-NAV-001, R5
 *
 * 3영역을 분리해 내려보내고(혼합 금지), 목차는 전체를 담되 장 요약은 절대 섞지 않는다.
 */

import { createBookInfoService } from '../../../src/modules/content/book-info.service'
import type { ContentRepository } from '../../../src/modules/content/repository'

function repo(overrides: Partial<ContentRepository> = {}): ContentRepository {
  return {
    findCatalog: async () => [],
    findReadiness: async () => true,
    findBasicInfo: async () => ({
      title: '탁류',
      author: '채만식',
      publish_year: 1937,
      extent: '411페이지',
      total_pages: 411,
    }),
    findChapters: async () => [
      { chapter_no: 1, title: '제1장 인간기념물', start_page: 1, end_page: 20 },
      { chapter_no: 2, title: '제2장 생활 제일과', start_page: 21, end_page: 45 },
    ],
    findBackgroundAndIntro: async () => ({
      introduction: '1930년대 군산을 배경으로...',
      background: '일제강점기 후반, 자본주의가...',
    }),
    findPage: async () => null,
    ...overrides,
  }
}

describe('BookInfoService', () => {
  test('FR-BRW-003 AC③: 기본정보·소개·배경지식을 분리 필드로 내려보낸다 (혼합 금지)', async () => {
    const info = (await createBookInfoService({ content: repo() }).getInfo('takryu'))!

    expect(info.basic_info).toEqual({
      title: '탁류',
      author: '채만식',
      published_year: 1937,
      length_note: '411페이지',
      total_pages: 411,
    })
    expect(info.introduction).toBe('1930년대 군산을 배경으로...')
    expect(info.background).toBe('일제강점기 후반, 자본주의가...')
    // 한 필드에 두 구분이 뭉쳐 있지 않다 (검수 기준 info_separation_ok)
    expect(info.introduction).not.toContain('일제강점기')
  })

  test('FR-NAV-001: 목차는 전체 장을 담고, 장 요약 필드를 절대 포함하지 않는다', async () => {
    const info = (await createBookInfoService({ content: repo() }).getInfo('takryu'))!

    expect(info.chapters).toHaveLength(2)
    expect(info.chapters[0]).toEqual({
      chapter_no: 1,
      title: '제1장 인간기념물',
      start_page: 1,
      end_page: 20,
    })
    // 장 요약은 상한 대상(FR-SPL-003 🚦) — 한 응답에 섞이면 전량이 프론트에 내려가 상한이 뚫린다
    for (const chapter of info.chapters) {
      expect(Object.keys(chapter).sort()).toEqual(['chapter_no', 'end_page', 'start_page', 'title'])
    }
  })

  test('R5: 배경지식·소개는 K와 무관하다 — 어떤 기준점 인자도 받지 않는다', () => {
    // 시그니처 자체로 고정한다. cutoff 인자가 생기면 이 테스트가 깨진다
    expect(createBookInfoService({ content: repo() }).getInfo.length).toBe(1)
  })

  test('없는 도서는 null (404의 재료)', async () => {
    const service = createBookInfoService({ content: repo({ findBasicInfo: async () => null }) })
    expect(await service.getInfo('nope')).toBeNull()
  })

  test('배경지식·소개 행이 아직 없으면 빈 문자열로 내려간다 — 부분 응답이 아니라 빈 영역', async () => {
    const service = createBookInfoService({
      content: repo({ findBackgroundAndIntro: async () => ({ introduction: '', background: '' }) }),
    })
    const info = (await service.getInfo('takryu'))!
    expect(info.introduction).toBe('')
    expect(info.background).toBe('')
    expect(info.basic_info.title).toBe('탁류')
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd backend && npx jest tests/unit/content/book-info.service.test.ts`
Expected: FAIL — `Cannot find module '.../book-info.service'`

- [ ] **Step 3: 서비스를 구현한다**

`backend/src/modules/content/book-info.service.ts`:

```ts
/**
 * GET /books/{b}/info — i 팝업 (R4, S1)
 *
 * 조항: FR-BRW-003 AC②(4개 정보 항목) · AC③(3영역 분리) · FR-NAV-001(목차 전체 상시) · R5
 *
 * ⚠️ 이 엔드포인트는 cutoff를 받지 않는다. 배경지식·소개는 상한 대상이 아니고(R5),
 *    목차도 전체 상시 노출이다(FR-NAV-001). 상한 예외이므로 (page, seq)도 동봉하지 않는다
 *    (team-sync-r4.md §4.3).
 */

import type { ChapterRow, ContentRepository } from './repository'

export interface BookInfoResponse {
  basic_info: {
    title: string
    author: string
    published_year: number | null
    /** FR-BRW-003 AC② '분량' — books.extent (소개용 문구). total_pages와 별개 */
    length_note: string | null
    /** 읽기 화면의 "12 / 411" 표시용 (team-sync §4.5) */
    total_pages: number
  }
  /** 책 소개 — 상한 예외 (R5) */
  introduction: string
  /** 배경지식 — 상한 예외 (R5, FR-BGK-002 🚦) */
  background: string
  /** 목차 — 장 경계 4필드만. 장 요약을 절대 넣지 않는다 (team-sync §4.1 R2 조건) */
  chapters: ChapterRow[]
}

export interface BookInfoServiceDeps {
  content: ContentRepository
}

export interface BookInfoService {
  getInfo(bookId: string): Promise<BookInfoResponse | null>
}

export function createBookInfoService(deps: BookInfoServiceDeps): BookInfoService {
  const { content } = deps

  return {
    async getInfo(bookId: string): Promise<BookInfoResponse | null> {
      const basic = await content.findBasicInfo(bookId)
      if (basic === null) return null

      const [texts, chapters] = await Promise.all([
        content.findBackgroundAndIntro(bookId),
        content.findChapters(bookId),
      ])

      return {
        basic_info: {
          title: basic.title,
          author: basic.author,
          published_year: basic.publish_year,
          length_note: basic.extent,
          total_pages: basic.total_pages,
        },
        introduction: texts.introduction,
        background: texts.background,
        chapters,
      }
    },
  }
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd backend && npx jest tests/unit/content/book-info.service.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: 라우트를 붙인다**

`backend/src/api/routes.ts` — import에 가드를 추가한다:

```ts
import { ensureBookReady } from './book-ready.guard';
```

**기존:**

```ts
router.get('/books/:bookId/info', (_req: Request, res: Response) => {
  return res.status(501).json({ error: 'NOT_IMPLEMENTED', message: 'R4 담당' });
});
```

**교체 후:**

```ts
router.get('/books/:bookId/info', async (req: Request, res: Response) => {
  const { bookId } = req.params;

  try {
    // FR-BRW-002 🚦 — UI 차단만으로는 부족하다 (자가 검증 25번)
    if (!(await ensureBookReady(contentServices.content, bookId, res))) return;

    const info = await contentServices.bookInfoService.getInfo(bookId);
    if (info === null) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Book not found' });
    }
    return res.json(info);
  } catch (error) {
    console.error('[API] Book info error', { bookId, error });
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});
```

- [ ] **Step 6: 커밋**

```bash
git add backend/src/modules/content/book-info.service.ts backend/src/api/routes.ts backend/tests/unit/content/book-info.service.test.ts
git commit -m "feat(R4): GET /books/{b}/info 3영역 + 목차 — FR-BRW-003, FR-NAV-001, R5"
```

---

## Task 5: `GET /books/:bookId/pages/:pageNo` — 본문 단건

**Files:**
- Create: `backend/src/modules/content/page.service.ts`
- Modify: `backend/src/api/routes.ts` (`/books/:bookId/pages/:pageNo` 핸들러 교체)
- Modify: `backend/src/modules/content/composition.ts` (Task 2 Step 5에서 주석 처리해 둔 두 서비스 배선 복구)
- Test: `backend/tests/unit/content/page.service.test.ts`

**Interfaces:**
- Consumes: Task 1의 `ContentRepository.findPage`, Task 3의 `ensureBookReady`.
- Produces: `createPageService(deps: { content: ContentRepository }): PageService`, `PageService.getPage(bookId: string, pageNo: number): Promise<PageRow | null>`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`backend/tests/unit/content/page.service.test.ts`:

```ts
/**
 * GET /books/{b}/pages/{n} — FR-PRG-001, R3, team-sync §4.10
 *
 * 진도에 관여하지 않는다(선요청 안전). 이동 대상 페이지도 서버가 내려준 값을 쓴다.
 */

import { createPageService } from '../../../src/modules/content/page.service'
import type { ContentRepository } from '../../../src/modules/content/repository'

function repo(page: any): ContentRepository {
  return {
    findCatalog: async () => [],
    findReadiness: async () => true,
    findBasicInfo: async () => null,
    findChapters: async () => [],
    findBackgroundAndIntro: async () => ({ introduction: '', background: '' }),
    findPage: async () => page,
  }
}

describe('PageService', () => {
  test('본문과 이웃 페이지 번호를 그대로 내려보낸다 (team-sync §4.10)', async () => {
    const service = createPageService({
      content: repo({ page_no: 5, content: '정 주사는...', prev_page: 4, next_page: 6 }),
    })

    expect(await service.getPage('takryu', 5)).toEqual({
      page_no: 5,
      content: '정 주사는...',
      prev_page: 4,
      next_page: 6,
    })
  })

  test('첫 페이지의 prev_page와 마지막 페이지의 next_page는 null', async () => {
    const first = createPageService({
      content: repo({ page_no: 1, content: '첫 장', prev_page: null, next_page: 2 }),
    })
    expect((await first.getPage('takryu', 1))!.prev_page).toBeNull()

    const last = createPageService({
      content: repo({ page_no: 411, content: '끝', prev_page: 410, next_page: null }),
    })
    expect((await last.getPage('takryu', 411))!.next_page).toBeNull()
  })

  test('R3·FR-PRG-001: 진도에 관여하지 않는다 — 디바이스도 기준점도 인자로 받지 않는다', () => {
    const service = createPageService({ content: repo(null) })
    // (bookId, pageNo) 둘뿐. deviceId나 cutoff가 생기면 이 테스트가 깨진다
    expect(service.getPage.length).toBe(2)
  })

  test('없는 페이지는 null (404의 재료)', async () => {
    const service = createPageService({ content: repo(null) })
    expect(await service.getPage('takryu', 999)).toBeNull()
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd backend && npx jest tests/unit/content/page.service.test.ts`
Expected: FAIL — `Cannot find module '.../page.service'`

- [ ] **Step 3: 서비스를 구현한다**

`backend/src/modules/content/page.service.ts`:

```ts
/**
 * GET /books/{b}/pages/{n} — 본문 단건 (R4, S1·S3)
 *
 * 조항: FR-PRG-001(재분할 금지의 좌표계) · R3(본문 접근은 제한하지 않는다)
 *
 * ⚠️ 이 엔드포인트는 진도에 관여하지 않는다 — (page, seq)를 동봉받지 않고 기준점도 움직이지
 *    않는다. 프리페치가 기준점을 밀지 않게 하려는 것이다 (team-sync-r4.md §1.1·§4.3).
 *    진도는 POST /books/{b}/progress 하나로만 올라간다.
 */

import type { ContentRepository, PageRow } from './repository'

export interface PageServiceDeps {
  content: ContentRepository
}

export interface PageService {
  getPage(bookId: string, pageNo: number): Promise<PageRow | null>
}

export function createPageService(deps: PageServiceDeps): PageService {
  const { content } = deps

  return {
    async getPage(bookId: string, pageNo: number): Promise<PageRow | null> {
      return content.findPage(bookId, pageNo)
    },
  }
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd backend && npx jest tests/unit/content/page.service.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: 조립 루트의 주석을 되살린다**

`backend/src/modules/content/composition.ts`에서 Task 2 Step 5에 주석 처리해 둔 `createBookInfoService`·`createPageService` import 두 줄과 `bookInfoService`·`pageService` 두 필드를 복구한다.

- [ ] **Step 6: 라우트를 붙인다**

**기존:**

```ts
router.get('/books/:bookId/pages/:pageNo', (_req: Request, res: Response) => {
  return res.status(501).json({ error: 'NOT_IMPLEMENTED', message: 'R4 담당' });
});
```

**교체 후:**

```ts
router.get('/books/:bookId/pages/:pageNo', async (req: Request, res: Response) => {
  const { bookId } = req.params;
  const pageNo = Number(req.params.pageNo);

  // 페이지 번호는 1-based 정수 (API_CONTRACT.md 공통 규칙)
  if (!Number.isInteger(pageNo) || pageNo < 1) {
    return res.status(400).json({ error: 'BAD_REQUEST', message: 'pageNo must be a positive integer' });
  }

  try {
    if (!(await ensureBookReady(contentServices.content, bookId, res))) return;

    const page = await contentServices.pageService.getPage(bookId, pageNo);
    if (page === null) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Page not found' });
    }
    return res.json(page);
  } catch (error) {
    console.error('[API] Page error', { bookId, pageNo, error });
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});
```

- [ ] **Step 7: 백엔드 전체 검사**

Run: `cd backend && npx jest && npx tsc --noEmit`
Expected: 전부 PASS, 타입 에러 0건

- [ ] **Step 8: 커밋**

```bash
git add backend/src/modules/content/page.service.ts backend/src/modules/content/composition.ts backend/src/api/routes.ts backend/tests/unit/content/page.service.test.ts
git commit -m "feat(R4): GET /books/{b}/pages/{n} 본문 단건 · 이웃 페이지 — FR-PRG-001, R3"
```

---

## Task 6: ssabi 모듈 — 포트 + Postgres 어댑터

**Files:**
- Create: `backend/src/modules/ssabi/repository.ts`
- Create: `backend/src/modules/ssabi/pg-repository.ts`
- Test: `backend/tests/unit/ssabi/pg-repository.test.ts`

**Interfaces:**
- Consumes: 없음(독립).
- Produces: `SsabiRepository` 인터페이스와 Row 타입 4종(`CharacterRow`, `AliasRow`, `RelationshipRow`, `CharacterNoteRow`), 팩토리 `createPgSsabiRepository(db: QueryClient): SsabiRepository`. **모든 메서드가 `(bookId, cutoff, ...)` 시그니처를 갖는다**(G1). Task 7·8이 여기에만 의존한다.

- [ ] **Step 1: 포트 인터페이스를 쓴다**

`backend/src/modules/ssabi/repository.ts`:

```ts
/**
 * ③ 싸비 조회 포트 (R4)
 *
 * 조항: FR-SPL-002 🚦 — 이 파일의 **모든** 조회 함수는 cutoff 인자를 갖는다.
 *       cutoff를 적용하지 않은 원시 쿼리를 도메인 코드에 노출하지 않는다 (00-shared §2.2, 4.3절).
 *
 * ⚠️ 여기 있는 Row 타입은 001_content_store.sql의 실제 컬럼을 따른다.
 *    shared/types.ts의 Character·Alias 인터페이스와는 다르다(그쪽은 aliases에 id가 있고
 *    유형 컬럼을 type으로 부른다 — DDL은 id가 없고 alias_type이다). 공용 타입 수정은 팀 합의
 *    사항이라(CLAUDE.md 6장) R4 모듈 안에서 자체 타입을 쓴다.
 */

export interface CharacterRow {
  id: string
  name: string
  first_appearance_page: number
}

export interface AliasRow {
  character_id: string
  alias: string
  alias_type: string
  first_appearance_page: number
}

export interface RelationshipRow {
  id: string
  character_a_id: string
  character_b_id: string
  label: string
  established_page: number
}

export interface CharacterNoteRow {
  note: string
  source_page: number
}

export interface SsabiRepository {
  /** 노드 후보 — 인물.최초 등장 페이지 <= cutoff (FR-SPL-002 🚦) */
  findCharacters(bookId: string, cutoff: number): Promise<CharacterRow[]>

  /** 별칭도 상한 대상이다. 별칭 자체가 관계 누설의 옆문이 된다 (D6) */
  findAliases(bookId: string, cutoff: number): Promise<AliasRow[]>

  /** 간선 후보 — 관계.확립 페이지 <= cutoff. **이력 전체**를 준다(최신 1개 선택은 서비스의 몫, A6) */
  findRelationships(bookId: string, cutoff: number): Promise<RelationshipRow[]>

  /**
   * 인물 단건. 0행이면 null이며, 호출부는 "초과라서 없음"과 "원래 없음"을 구분하지 않는다
   * (절대 규칙 7번, team-sync §4.2)
   */
  findCharacter(bookId: string, cutoff: number, characterId: string): Promise<CharacterRow | null>

  /** 인물 노트 — 근거 페이지 <= cutoff. 절단(A5)은 서비스의 몫이라 전량을 준다 */
  findCharacterNotes(bookId: string, cutoff: number, characterId: string): Promise<CharacterNoteRow[]>

  /** 특정 인물의 별칭 — 별칭.최초 등장 <= cutoff (D6) */
  findCharacterAliases(bookId: string, cutoff: number, characterId: string): Promise<AliasRow[]>
}
```

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`backend/tests/unit/ssabi/pg-repository.test.ts`:

```ts
/**
 * ③ 싸비 조회 Postgres 어댑터 — mock QueryClient
 *
 * FR-SPL-002 🚦이 걸리는 조회이므로 **WHERE 절에 cutoff 필터가 실제로 들어가는지를
 * 파라미터 순서까지** 확인한다. 리포지토리 계층의 코드 수준 강제(00-shared §2.2)가 대상이다.
 */

import { createPgSsabiRepository } from '../../../src/modules/ssabi/pg-repository'
import type { QueryClient } from '../../../src/modules/ssabi/pg-repository'

function mockClient(rows: any[] = []): {
  client: QueryClient
  calls: { sql: string; params?: unknown[] }[]
} {
  const calls: { sql: string; params?: unknown[] }[] = []
  return {
    client: {
      query: async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params })
        return { rows }
      },
    },
    calls,
  }
}

describe('createPgSsabiRepository — 상한이 SQL에 실제로 걸리는가', () => {
  test('FR-SPL-002 🚦: findCharacters는 first_appearance_page <= cutoff를 WHERE에 건다', async () => {
    const { client, calls } = mockClient()
    await createPgSsabiRepository(client).findCharacters('takryu', 80)

    expect(calls[0].sql).toMatch(/first_appearance_page\s*<=\s*\$2/)
    expect(calls[0].params).toEqual(['takryu', 80])
  })

  test('D6: findAliases는 별칭의 first_appearance_page <= cutoff를 건다 (별칭이 관계 누설의 옆문)', async () => {
    const { client, calls } = mockClient()
    await createPgSsabiRepository(client).findAliases('takryu', 80)

    expect(calls[0].sql).toMatch(/FROM aliases/)
    expect(calls[0].sql).toMatch(/first_appearance_page\s*<=\s*\$2/)
    expect(calls[0].params).toEqual(['takryu', 80])
  })

  test('A6: findRelationships는 established_page <= cutoff만 걸고 이력 전체를 준다 (최신 선택은 서비스 몫)', async () => {
    const { client, calls } = mockClient()
    await createPgSsabiRepository(client).findRelationships('takryu', 80)

    expect(calls[0].sql).toMatch(/established_page\s*<=\s*\$2/)
    // DISTINCT ON / GROUP BY 로 SQL에서 미리 추리지 않는다 — 서비스의 순수 함수가 고른다
    expect(calls[0].sql).not.toMatch(/DISTINCT ON/)
    expect(calls[0].params).toEqual(['takryu', 80])
  })

  test('findCharacter는 cutoff 필터를 건 단건 조회이고, 0행이면 null (절대 규칙 7번)', async () => {
    const miss = mockClient([])
    expect(await createPgSsabiRepository(miss.client).findCharacter('takryu', 80, 'c-1')).toBeNull()
    expect(miss.calls[0].sql).toMatch(/first_appearance_page\s*<=\s*\$2/)
    expect(miss.calls[0].params).toEqual(['takryu', 80, 'c-1'])

    const hit = mockClient([{ id: 'c-1', name: '정주사', first_appearance_page: 1 }])
    expect(await createPgSsabiRepository(hit.client).findCharacter('takryu', 80, 'c-1')).toEqual({
      id: 'c-1',
      name: '정주사',
      first_appearance_page: 1,
    })
  })

  test('FR-SPL-002 🚦: findCharacterNotes는 source_page <= cutoff를 걸고 오름차순으로 준다', async () => {
    const { client, calls } = mockClient()
    await createPgSsabiRepository(client).findCharacterNotes('takryu', 80, 'c-1')

    expect(calls[0].sql).toMatch(/source_page\s*<=\s*\$2/)
    expect(calls[0].sql).toMatch(/ORDER BY\s+source_page\s+ASC/)
    expect(calls[0].params).toEqual(['takryu', 80, 'c-1'])
  })

  test('findCharacterAliases도 cutoff 필터를 건다 (D6)', async () => {
    const { client, calls } = mockClient()
    await createPgSsabiRepository(client).findCharacterAliases('takryu', 80, 'c-1')

    expect(calls[0].sql).toMatch(/first_appearance_page\s*<=\s*\$2/)
    expect(calls[0].params).toEqual(['takryu', 80, 'c-1'])
  })
})
```

- [ ] **Step 3: 테스트가 실패하는지 확인한다**

Run: `cd backend && npx jest tests/unit/ssabi/pg-repository.test.ts`
Expected: FAIL — `Cannot find module '.../ssabi/pg-repository'`

- [ ] **Step 4: 어댑터를 구현한다**

`backend/src/modules/ssabi/pg-repository.ts`:

```ts
/**
 * ③ 싸비 조회 Postgres 어댑터 (R4)
 *
 * 조항: FR-SPL-002 🚦 — 상한 강제 위치는 **데이터 선택 단계**다(R4 불변식).
 *       조회형에서 그 지점은 이 파일의 WHERE 절이다. 프롬프트도 후처리도 아니다.
 *
 * ⚠️ characters·aliases·relationships·character_notes는 R1 소유 테이블이다
 *    (001_content_store.sql). 읽기만 한다 — 쓰기 없음 (절대 규칙 5번).
 */

import type {
  AliasRow,
  CharacterNoteRow,
  CharacterRow,
  RelationshipRow,
  SsabiRepository,
} from './repository'

export interface QueryClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>
}

export function createPgSsabiRepository(db: QueryClient): SsabiRepository {
  return {
    async findCharacters(bookId: string, cutoff: number): Promise<CharacterRow[]> {
      // FR-SPL-002 🚦 — 노드 = 인물 최초 등장 <= K
      const { rows } = await db.query(
        `SELECT id, name, first_appearance_page
           FROM characters
          WHERE book_id = $1
            AND first_appearance_page <= $2
          ORDER BY first_appearance_page ASC, id ASC`,
        [bookId, cutoff]
      )
      return rows
    },

    async findAliases(bookId: string, cutoff: number): Promise<AliasRow[]> {
      // D6 — 별칭 자체가 관계 정보를 담는다. "아버지"라는 가족관계 호칭이 후반부에 처음
      // 드러나는 인물이면, 초반 기준점의 별칭 목록에 그 호칭이 보이는 것만으로 관계가 누설된다
      const { rows } = await db.query(
        `SELECT character_id, alias, alias_type, first_appearance_page
           FROM aliases
          WHERE book_id = $1
            AND first_appearance_page <= $2
          ORDER BY first_appearance_page ASC, alias ASC`,
        [bookId, cutoff]
      )
      return rows
    },

    async findRelationships(bookId: string, cutoff: number): Promise<RelationshipRow[]> {
      // A6 — 이력 전체를 그대로 준다. 같은 쌍의 최신 1개 선택은 graph.ts의 순수 함수가 한다.
      // SQL에서 DISTINCT ON으로 미리 추리면 K별 positive/negative 쌍(자가 검증 7·8·9·10)을
      // DB 없이 검증할 수 없게 된다 — FR-CHR-001 🚦이 이 프로젝트에서 가장 틀리기 쉬운 지점이다.
      // ORDER BY established_page ASC, id ASC — 동점 시 승자를 확정적으로 만든다
      const { rows } = await db.query(
        `SELECT id, character_a_id, character_b_id, label, established_page
           FROM relationships
          WHERE book_id = $1
            AND established_page <= $2
          ORDER BY established_page ASC, id ASC`,
        [bookId, cutoff]
      )
      return rows
    },

    async findCharacter(
      bookId: string,
      cutoff: number,
      characterId: string
    ): Promise<CharacterRow | null> {
      // 0행이면 null. 호출부는 "초과라서 없음"과 "원래 없음"을 구분하지 않는다 —
      // 구분하는 순간 그게 판별기다 (절대 규칙 7번)
      const { rows } = await db.query(
        `SELECT id, name, first_appearance_page
           FROM characters
          WHERE book_id = $1
            AND first_appearance_page <= $2
            AND id = $3`,
        [bookId, cutoff, characterId]
      )
      if (rows.length === 0) return null
      return rows[0]
    },

    async findCharacterNotes(
      bookId: string,
      cutoff: number,
      characterId: string
    ): Promise<CharacterNoteRow[]> {
      // FR-CHR-004·005 — 근거 페이지 <= K. 8문장 절단(A5)은 notes.ts가 한다
      const { rows } = await db.query(
        `SELECT note, source_page
           FROM character_notes
          WHERE book_id = $1
            AND source_page <= $2
            AND character_id = $3
          ORDER BY source_page ASC`,
        [bookId, cutoff, characterId]
      )
      return rows
    },

    async findCharacterAliases(
      bookId: string,
      cutoff: number,
      characterId: string
    ): Promise<AliasRow[]> {
      const { rows } = await db.query(
        `SELECT character_id, alias, alias_type, first_appearance_page
           FROM aliases
          WHERE book_id = $1
            AND first_appearance_page <= $2
            AND character_id = $3
          ORDER BY first_appearance_page ASC, alias ASC`,
        [bookId, cutoff, characterId]
      )
      return rows
    },
  }
}
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `cd backend && npx jest tests/unit/ssabi/pg-repository.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 6: 커밋**

```bash
git add backend/src/modules/ssabi/repository.ts backend/src/modules/ssabi/pg-repository.ts backend/tests/unit/ssabi/pg-repository.test.ts
git commit -m "feat(R4): 싸비 조회 포트·Postgres 어댑터 — FR-SPL-002, D6, A6"
```

---

## Task 7: `GET /books/:bookId/ssabi/graph` — 관계도

> **이 계획에서 가장 위험한 태스크다.** 자가 검증 7번을 "최신을 고른다"로만 구현하면 K=80에서 아직 안 읽은 '부부'가 나온다 — 누설이다. 10번을 놓치면 같은 쌍의 간선이 2개 나온다 — FR-CHR-001 위반이다.

**Files:**
- Create: `backend/src/modules/ssabi/graph.ts` (순수 함수)
- Create: `backend/src/modules/ssabi/graph.service.ts`
- Create: `backend/src/modules/ssabi/composition.ts`
- Create: `backend/tests/unit/ssabi/fixtures.ts`
- Modify: `backend/src/api/routes.ts` (`/ssabi/graph` 핸들러 교체)
- Test: `backend/tests/unit/ssabi/graph.test.ts`

**Interfaces:**
- Consumes: Task 6의 `SsabiRepository`. R2의 `CutoffService.getCutoffSnapshot`, `ProgressService.acceptProgressEvent(deviceId, bookId, { page, seq }): Promise<void>`.
- Produces: `buildGraph(characters, aliases, relationships): { nodes: GraphNode[]; edges: GraphEdge[] }` (순수), `createGraphService(deps): GraphService`, `GraphService.getGraph(deviceId, bookId, event?): Promise<GraphResponse>`, `createSsabiServices(pool, readingState): SsabiServices`.

- [ ] **Step 1: 게이트 fixture를 쓴다**

`backend/tests/unit/ssabi/fixtures.ts`:

```ts
/**
 * 게이트 테스트용 좌표 — team-sync-r4.md §4.6에서 R2와 합의한 시드 구조를 그대로 옮긴 것.
 *
 *   장 경계 1–10 / 11–20 / 21–30, 기준점 K = 5 / 20 / 25 (K=20이 장 경계 케이스)
 *   라벨이 바뀌는 관계(약혼 → 부부) 두 행을 20~30페이지 범위에 배치
 *
 * ⚠️ 이건 **테스트 fixture이지 DB 시드가 아니다.** 공개 콘텐츠 스토어 쓰기는 파이프라인(⑦)만
 *    할 수 있다(절대 규칙 5번). 실데이터 검증은 R1 파이프라인이 붙는 CP3에서 한다.
 */

import type { AliasRow, CharacterRow, RelationshipRow } from '../../../src/modules/ssabi/repository'

export const K_EARLY = 5
export const K_BOUNDARY = 20
export const K_LATE = 25

export const CHARACTERS: CharacterRow[] = [
  { id: 'c-jeong', name: '정주사', first_appearance_page: 1 },
  { id: 'c-chobong', name: '초봉', first_appearance_page: 3 },
  { id: 'c-gyebong', name: '계봉', first_appearance_page: 18 },
  // 후반부에 처음 등장 — K=5·20에서는 노드로 나오면 안 된다
  { id: 'c-hyeongbo', name: '장형보', first_appearance_page: 24 },
]

export const ALIASES: AliasRow[] = [
  { character_id: 'c-jeong', alias: '정 주사', alias_type: 'name', first_appearance_page: 1 },
  { character_id: 'c-chobong', alias: '초봉이', alias_type: 'nickname', first_appearance_page: 3 },
  // 후반부에 처음 나오는 가족관계 호칭 — 별칭이 관계 누설의 옆문이 되는지 확인 (D6)
  { character_id: 'c-gyebong', alias: '언니', alias_type: 'kinship', first_appearance_page: 22 },
]

export const RELATIONSHIPS: RelationshipRow[] = [
  // 라벨이 바뀌는 관계 1쌍 — 같은 쌍, 확립 페이지 다른 2행 (A6)
  { id: 'r-1', character_a_id: 'c-jeong', character_b_id: 'c-chobong', label: '약혼', established_page: 20 },
  { id: 'r-2', character_a_id: 'c-jeong', character_b_id: 'c-chobong', label: '부부', established_page: 25 },
  // 확립 페이지가 K 이하인데 인물 B(장형보)의 최초 등장이 K 초과인 데이터 오류 상황.
  // FR-SPL-005 🚦 심층 방어의 대상이다 (자가 검증 12번)
  { id: 'r-3', character_a_id: 'c-jeong', character_b_id: 'c-hyeongbo', label: '채권관계', established_page: 20 },
]
```

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`backend/tests/unit/ssabi/graph.test.ts`:

```ts
/**
 * 관계도 조립 — 이 API의 함정 (R4-frontend.md §4.5 자가 검증 1·2·3·5·7·8·9·10·11·12)
 *
 * "관계도에 노드가 예쁘게 나오면 맞아 보이는데, 기준점 초과 간선이 하나 섞여 있어도
 *  눈으로는 모른다. 테스트로만 잡힌다."
 */

import { buildGraph } from '../../../src/modules/ssabi/graph'
import { ALIASES, CHARACTERS, K_BOUNDARY, K_EARLY, K_LATE, RELATIONSHIPS } from './fixtures'

/** 리포지토리가 이미 cutoff 필터를 건 뒤의 결과를 흉내 낸다 (SQL 검증은 Task 6이 한다) */
function atCutoff(k: number) {
  return buildGraph(
    CHARACTERS.filter((c) => c.first_appearance_page <= k),
    ALIASES.filter((a) => a.first_appearance_page <= k),
    RELATIONSHIPS.filter((r) => r.established_page <= k)
  )
}

describe('FR-SPL-002 🚦 — 조회 상한', () => {
  test('자가 검증 1: 관계도 응답의 모든 노드가 인물.최초 등장 <= K', () => {
    for (const k of [K_EARLY, K_BOUNDARY, K_LATE]) {
      const { nodes } = atCutoff(k)
      expect(nodes.filter((n) => n.first_appearance_page > k)).toHaveLength(0)
    }
  })

  test('자가 검증 2: 모든 간선이 관계.확립 페이지 <= K', () => {
    for (const k of [K_EARLY, K_BOUNDARY, K_LATE]) {
      const { edges } = atCutoff(k)
      expect(edges.filter((e) => e.established_page > k)).toHaveLength(0)
    }
  })

  test('자가 검증 3: 별칭 목록이 전부 별칭.최초 등장 <= K (D6)', () => {
    // '언니'(가족관계 호칭, p.22)는 K=20에서 안 보이고 K=25에서 보인다
    const early = atCutoff(K_BOUNDARY)
    expect(early.nodes.flatMap((n) => n.aliases)).not.toContain('언니')

    const late = atCutoff(K_LATE)
    expect(late.nodes.find((n) => n.id === 'c-gyebong')!.aliases).toContain('언니')
  })

  test('자가 검증 5 (negative + positive 쌍): 후반부 인물이 K=5에서 안 나오고 K=25에서 나온다', () => {
    expect(atCutoff(K_EARLY).nodes.map((n) => n.id)).not.toContain('c-hyeongbo')
    expect(atCutoff(K_LATE).nodes.map((n) => n.id)).toContain('c-hyeongbo')
  })
})

describe('FR-CHR-001 🚦 — 이력형 관계에서 최신 라벨 1개 (A6)', () => {
  test('자가 검증 7: K=20이면 약혼 1개 — 부부(p.25)가 나오면 누설이다', () => {
    const { edges } = atCutoff(K_BOUNDARY)
    const pair = edges.filter(
      (e) =>
        [e.source, e.target].includes('c-jeong') && [e.source, e.target].includes('c-chobong')
    )
    expect(pair).toHaveLength(1)
    expect(pair[0].label).toBe('약혼')
    expect(pair[0].established_page).toBe(20)
  })

  test('자가 검증 8: K=25면 부부 1개 (약혼 아님)', () => {
    const { edges } = atCutoff(K_LATE)
    const pair = edges.filter(
      (e) =>
        [e.source, e.target].includes('c-jeong') && [e.source, e.target].includes('c-chobong')
    )
    expect(pair).toHaveLength(1)
    expect(pair[0].label).toBe('부부')
  })

  test('자가 검증 9: K=5면 간선 0개', () => {
    expect(atCutoff(K_EARLY).edges).toHaveLength(0)
  })

  test('자가 검증 10: 어떤 K에서도 같은 쌍의 간선이 2개 이상 나오지 않는다 — 중복 0', () => {
    for (const k of [K_EARLY, K_BOUNDARY, K_LATE]) {
      const keys = atCutoff(k).edges.map((e) => [e.source, e.target].sort().join('|'))
      expect(keys.length).toBe(new Set(keys).size)
    }
  })

  test('간선 방향이 뒤집혀 저장돼도 같은 쌍으로 본다 (무순 쌍)', () => {
    const { edges } = buildGraph(
      [CHARACTERS[0], CHARACTERS[1]],
      [],
      [
        { id: 'x-1', character_a_id: 'c-jeong', character_b_id: 'c-chobong', label: '약혼', established_page: 20 },
        { id: 'x-2', character_a_id: 'c-chobong', character_b_id: 'c-jeong', label: '부부', established_page: 25 },
      ]
    )
    expect(edges).toHaveLength(1)
    expect(edges[0].label).toBe('부부')
  })

  test('확립 페이지가 동점이면 결과가 확정적이다 — 실행할 때마다 달라지지 않는다', () => {
    const rows = [
      { id: 'a-1', character_a_id: 'c-jeong', character_b_id: 'c-chobong', label: '먼저', established_page: 20 },
      { id: 'a-2', character_a_id: 'c-jeong', character_b_id: 'c-chobong', label: '나중', established_page: 20 },
    ]
    const first = buildGraph([CHARACTERS[0], CHARACTERS[1]], [], rows)
    const second = buildGraph([CHARACTERS[0], CHARACTERS[1]], [], [...rows].reverse())

    expect(first.edges).toHaveLength(1)
    // 리포지토리가 (established_page ASC, id ASC)로 정렬해 주므로 입력 순서가 정본이다
    expect(first.edges[0].label).toBe('먼저')
    expect(second.edges).toHaveLength(1)
  })
})

describe('FR-SPL-005 🚦 — 간선 무결성 (심층 방어)', () => {
  test('자가 검증 11: 모든 간선의 양 끝 노드가 결과 집합에 존재한다', () => {
    for (const k of [K_EARLY, K_BOUNDARY, K_LATE]) {
      const { nodes, edges } = atCutoff(k)
      const ids = new Set(nodes.map((n) => n.id))
      for (const edge of edges) {
        expect(ids.has(edge.source)).toBe(true)
        expect(ids.has(edge.target)).toBe(true)
      }
    }
  })

  test('자가 검증 12: 인물 A는 보이는데 B가 안 보이는 K에서 A-B 간선이 반환되지 않는다', () => {
    // r-3(채권관계, p.20)은 확립 페이지가 K=20 이하지만 장형보의 최초 등장이 p.24다.
    // 정합성 제약 위반(데이터 오류)이며, 조회가 이중 방어로 걸러야 한다
    const { edges } = atCutoff(K_BOUNDARY)
    expect(edges.filter((e) => e.label === '채권관계')).toHaveLength(0)
  })
})

describe('NFR-OBS-003 — 응답에 위치 페이지 값이 있다', () => {
  test('자가 검증 26: 노드에 first_appearance_page, 간선에 established_page가 포함된다', () => {
    const { nodes, edges } = atCutoff(K_LATE)
    expect(nodes.every((n) => typeof n.first_appearance_page === 'number')).toBe(true)
    expect(edges.every((e) => typeof e.established_page === 'number')).toBe(true)
  })
})
```

- [ ] **Step 3: 테스트가 실패하는지 확인한다**

Run: `cd backend && npx jest tests/unit/ssabi/graph.test.ts`
Expected: FAIL — `Cannot find module '.../ssabi/graph'`

- [ ] **Step 4: 순수 함수를 구현한다**

`backend/src/modules/ssabi/graph.ts`:

```ts
/**
 * 관계도 조립 — 순수 함수 (R4, S4)
 *
 * 조항: FR-CHR-001 🚦(간선 중복 없음, 최신 라벨 1개) · FR-SPL-005 🚦(간선 양 끝 노드 검증)
 *       · A6(이력형 관계) · D6(별칭 상한) · NFR-OBS-003(응답에 페이지 값)
 *
 * ⚠️ 입력은 **이미 cutoff 필터를 거친 행들**이다. 이 함수는 K를 인자로 받지 않으며
 *    기준점 초과 여부를 판별하지도 않는다 — 판별할 능력 자체가 없어야 한다(절대 규칙 7번).
 *    상한 강제는 리포지토리의 WHERE 절이 이미 끝냈다(R4 불변식).
 *
 * ⚠️ 이력형 관계에서 "최신을 무조건 고른다"로 구현하면 누설이고, "전부 그린다"로 구현하면
 *    간선이 중복된다. K 이하로 이미 걸러진 집합 **안에서** 최신 1개를 고르는 것이 정답이다
 *    (dev-spec-R4-frontend.md §2 S4).
 */

import type { AliasRow, CharacterRow, RelationshipRow } from './repository'

export interface GraphNode {
  id: string
  name: string
  first_appearance_page: number
  aliases: string[]
}

export interface GraphEdge {
  source: string
  target: string
  label: string
  established_page: number
}

/** 방향을 구분하지 않는 쌍 키 — A-B와 B-A를 같은 관계로 본다 */
function pairKey(a: string, b: string): string {
  return [a, b].sort().join('|')
}

export function buildGraph(
  characters: CharacterRow[],
  aliases: AliasRow[],
  relationships: RelationshipRow[]
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const aliasesByCharacter = new Map<string, string[]>()
  for (const alias of aliases) {
    const list = aliasesByCharacter.get(alias.character_id) ?? []
    list.push(alias.alias)
    aliasesByCharacter.set(alias.character_id, list)
  }

  const nodes: GraphNode[] = characters.map((character) => ({
    id: character.id,
    name: character.name,
    first_appearance_page: character.first_appearance_page, // NFR-OBS-003
    aliases: aliasesByCharacter.get(character.id) ?? [],
  }))

  const nodeIds = new Set(nodes.map((node) => node.id))

  // A6, FR-CHR-001 🚦 — 같은 쌍에서 확립 페이지가 가장 늦은 것 1개만 남긴다.
  // 입력은 (established_page ASC, id ASC) 정렬이고 비교가 strict(>)이므로, 동점이면
  // 먼저 온 행(= id가 작은 행)이 남는다 — 결과가 실행마다 흔들리지 않는다
  const latestByPair = new Map<string, RelationshipRow>()
  for (const relationship of relationships) {
    const key = pairKey(relationship.character_a_id, relationship.character_b_id)
    const kept = latestByPair.get(key)
    if (!kept || relationship.established_page > kept.established_page) {
      latestByPair.set(key, relationship)
    }
  }

  const edges: GraphEdge[] = [...latestByPair.values()]
    // FR-SPL-005 🚦 심층 방어 — 관계.확립 페이지는 K 이하인데 인물의 최초 등장이 K 초과인
    // 상황이 데이터 오류로 생길 수 있다. 그 간선은 반환하지 않는다
    .filter(
      (relationship) =>
        nodeIds.has(relationship.character_a_id) && nodeIds.has(relationship.character_b_id)
    )
    .map((relationship) => ({
      source: relationship.character_a_id,
      target: relationship.character_b_id,
      label: relationship.label,
      established_page: relationship.established_page, // NFR-OBS-003
    }))

  return { nodes, edges }
}
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `cd backend && npx jest tests/unit/ssabi/graph.test.ts`
Expected: PASS (12 tests)

- [ ] **Step 6: 서비스와 조립 루트를 만든다**

`backend/src/modules/ssabi/graph.service.ts`:

```ts
/**
 * GET /books/{b}/ssabi/graph — 관계도 (R4, S4)
 *
 * (page, seq)를 동봉받으면 **진도 이벤트와 동일하게 처리한 뒤** 기준점을 파생한다
 * (00-shared §2.5). 호출 순서가 중요하다 — acceptProgressEvent → getCutoffSnapshot이어야
 * "페이지 넘긴 직후 재조회"가 최신 K를 본다(FR-SVB-003). 반대로 하면 한 박자 늦은 K로 답한다.
 */

import type { CutoffService } from '../reading-state/cutoff.service'
import type { ProgressService } from '../reading-state/progress.service'
import { buildGraph, type GraphEdge, type GraphNode } from './graph'
import type { SsabiRepository } from './repository'

export interface GraphResponse {
  nodes: GraphNode[]
  edges: GraphEdge[]
  /** 적용된 기준점 K. NFR-OBS-003 — 이 값이 없으면 FR-SPL-002 🚦 판정 자체가 불가능하다 */
  applied_cutoff: number
}

export interface ProgressEventInput {
  page: number
  seq: number
}

export interface GraphServiceDeps {
  ssabi: SsabiRepository
  cutoffService: CutoffService
  progressService: ProgressService
}

export interface GraphService {
  getGraph(deviceId: string, bookId: string, event?: ProgressEventInput): Promise<GraphResponse>
}

export function createGraphService(deps: GraphServiceDeps): GraphService {
  const { ssabi, cutoffService, progressService } = deps

  return {
    async getGraph(
      deviceId: string,
      bookId: string,
      event?: ProgressEventInput
    ): Promise<GraphResponse> {
      // ⚠️ 순서 고정: 진도 반영 → 스냅샷. 챗봇(fire-and-forget)과 달리 여기서는 await한다 —
      //    이 응답이 최신 K를 반영해야 하기 때문이다 (FR-SVB-003)
      if (event) {
        await progressService.acceptProgressEvent(deviceId, bookId, event)
      }

      // 요청당 스냅샷 1회. 이 요청의 모든 쿼리가 같은 K를 쓴다 (00-shared §2.1)
      const { cutoff } = await cutoffService.getCutoffSnapshot(deviceId, bookId)

      const [characters, aliases, relationships] = await Promise.all([
        ssabi.findCharacters(bookId, cutoff),
        ssabi.findAliases(bookId, cutoff),
        ssabi.findRelationships(bookId, cutoff),
      ])

      const { nodes, edges } = buildGraph(characters, aliases, relationships)
      return { nodes, edges, applied_cutoff: cutoff }
    },
  }
}
```

`backend/src/modules/ssabi/composition.ts`:

```ts
/**
 * ③ 싸비 조회 조립 루트 (R4)
 */

import type { Pool } from 'pg'
import type { ReadingStateServices } from '../reading-state/composition'
import { createGraphService } from './graph.service'
import { createCharacterService } from './character.service'
import { createPgSsabiRepository, type QueryClient } from './pg-repository'

export interface SsabiServices {
  graphService: ReturnType<typeof createGraphService>
  characterService: ReturnType<typeof createCharacterService>
}

function toQueryClient(pool: Pool): QueryClient {
  return { query: (sql: string, params?: unknown[]) => pool.query(sql, params) }
}

export function createSsabiServices(pool: Pool, readingState: ReadingStateServices): SsabiServices {
  const ssabi = createPgSsabiRepository(toQueryClient(pool))

  return {
    graphService: createGraphService({
      ssabi,
      cutoffService: readingState.cutoffService,
      progressService: readingState.progressService,
    }),
    characterService: createCharacterService({
      ssabi,
      cutoffService: readingState.cutoffService,
      progressService: readingState.progressService,
    }),
  }
}
```

> ⚠️ `createCharacterService`는 Task 8에서 만든다. Task 7 시점에는 그 import와 필드를 주석 처리하고 Task 8 Step 5에서 되살린다.

- [ ] **Step 7: 라우트를 붙인다**

`backend/src/api/routes.ts` — import와 배선 추가:

```ts
import { createSsabiServices } from '../modules/ssabi/composition';
```

```ts
const ssabiServices = createSsabiServices(pool, readingState);
```

쿼리 파라미터 파서를 `requireDeviceId` 아래에 추가한다:

```ts
/**
 * 싸비 조회에 동봉되는 (page, seq). 서버는 이를 진도 이벤트와 동일하게 처리한다
 * (00-shared §2.5, team-sync §4.3). 둘 다 있고 유효할 때만 이벤트로 본다 —
 * 클라이언트가 "기준점"을 직접 보내는 경로는 존재하지 않는다 (절대 규칙 8번).
 */
function parseProgressQuery(req: Request): { page: number; seq: number } | undefined {
  const page = Number(req.query.page);
  const seq = Number(req.query.seq);
  if (!Number.isInteger(page) || page < 1) return undefined;
  if (!Number.isInteger(seq)) return undefined;
  return { page, seq };
}
```

**기존:**

```ts
router.get('/books/:bookId/ssabi/graph', (_req: Request, res: Response) => {
  return res.status(501).json({ error: 'NOT_IMPLEMENTED', message: 'R4 담당' });
});
```

**교체 후:**

```ts
router.get('/books/:bookId/ssabi/graph', async (req: Request, res: Response) => {
  const { bookId } = req.params;
  const deviceId = requireDeviceId(req, res);
  if (!deviceId) return;

  try {
    if (!(await ensureBookReady(contentServices.content, bookId, res))) return;

    const graph = await ssabiServices.graphService.getGraph(
      deviceId,
      bookId,
      parseProgressQuery(req)
    );
    return res.json(graph);
  } catch (error) {
    console.error('[API] Ssabi graph error', { bookId, error });
    // 조립 실패는 5xx — 부분 응답을 내지 않는다. 실패 = 미노출 (FR-SPL-005 🚦, R11)
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});
```

- [ ] **Step 8: 커밋**

```bash
git add backend/src/modules/ssabi/graph.ts backend/src/modules/ssabi/graph.service.ts backend/src/modules/ssabi/composition.ts backend/src/api/routes.ts backend/tests/unit/ssabi/graph.test.ts backend/tests/unit/ssabi/fixtures.ts
git commit -m "feat(R4): GET /ssabi/graph 관계도 — FR-CHR-001, FR-SPL-002, FR-SPL-005, A6, D6"
```

---

## Task 8: `GET /books/:bookId/ssabi/characters/:characterId` — 인물 상세

**Files:**
- Create: `backend/src/modules/ssabi/notes.ts` (순수 함수)
- Create: `backend/src/modules/ssabi/character.service.ts`
- Modify: `backend/src/modules/ssabi/composition.ts` (Task 7에서 주석 처리한 배선 복구)
- Modify: `backend/src/api/routes.ts` (`/ssabi/characters/:characterId` 핸들러 교체)
- Modify: `frontend/src/types/ssabi.ts` (`applied_cutoff` TODO 해소)
- Test: `backend/tests/unit/ssabi/notes.test.ts`
- Test: `backend/tests/unit/ssabi/character.service.test.ts`

**Interfaces:**
- Consumes: Task 6의 `SsabiRepository`, Task 7의 `ProgressEventInput`과 R2 서비스들.
- Produces: `truncateNotes(notes: CharacterNoteRow[]): string` (순수), `createCharacterService(deps): CharacterService`, `CharacterService.getCharacter(deviceId, bookId, characterId, event?): Promise<CharacterResponse | null>`.

- [ ] **Step 1: 노트 절단 테스트를 쓴다**

`backend/tests/unit/ssabi/notes.test.ts`:

```ts
/**
 * 인물 노트 표시 상한 — A5 (자가 검증 13·14)
 *
 * 기준점 이하 중 최대 8문장. 초과 시 **최초 1문장 + 최근 7문장**.
 * 절단은 서버가 한다 — 프론트가 자르지 않는다.
 */

import { truncateNotes } from '../../../src/modules/ssabi/notes'
import type { CharacterNoteRow } from '../../../src/modules/ssabi/repository'

function notes(count: number): CharacterNoteRow[] {
  return Array.from({ length: count }, (_, i) => ({ note: `문장${i + 1}`, source_page: i + 1 }))
}

describe('truncateNotes — A5', () => {
  test('자가 검증 14: 8문장 이하면 전부 표시한다', () => {
    expect(truncateNotes(notes(8))).toBe(
      '문장1 문장2 문장3 문장4 문장5 문장6 문장7 문장8'
    )
    expect(truncateNotes(notes(3))).toBe('문장1 문장2 문장3')
  })

  test('자가 검증 13: 8문장 초과면 최초 1문장 + 최근 7문장', () => {
    // 12문장 → 문장1 + 문장6~12
    expect(truncateNotes(notes(12))).toBe(
      '문장1 문장6 문장7 문장8 문장9 문장10 문장11 문장12'
    )
  })

  test('경계: 9문장이면 최초 1 + 최근 7 = 8문장이고 문장2가 빠진다', () => {
    const result = truncateNotes(notes(9))
    expect(result.split(' ')).toHaveLength(8)
    expect(result).toContain('문장1')
    expect(result).not.toContain('문장2 ')
    expect(result).toContain('문장9')
  })

  test('노트가 없으면 빈 문자열 — 없는 설명을 지어내지 않는다', () => {
    expect(truncateNotes([])).toBe('')
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd backend && npx jest tests/unit/ssabi/notes.test.ts`
Expected: FAIL — `Cannot find module '.../ssabi/notes'`

- [ ] **Step 3: 순수 함수를 구현한다**

`backend/src/modules/ssabi/notes.ts`:

```ts
/**
 * 인물 노트 표시 상한 — A5 (8/19 팀 확정)
 *
 * 조회 표시는 기준점 이하 중 최대 8문장, 초과 시 **최초 1문장 + 최근 7문장**.
 * 서술 1문장 = 근거 페이지 1개이고, 여러 페이지에 걸친 서술은 이른 페이지에 귀속된다.
 *
 * ⚠️ 절단은 서버가 한다. 프론트는 받은 문자열을 그대로 렌더한다 (handoff-r4.md §5 A5).
 * ⚠️ 입력은 이미 `source_page <= K`로 걸러지고 오름차순 정렬된 행들이다.
 */

import type { CharacterNoteRow } from './repository'

/** 표시 상한 문장 수 (A5) */
const MAX_SENTENCES = 8

export function truncateNotes(notes: CharacterNoteRow[]): string {
  const sentences = notes.map((note) => note.note)

  if (sentences.length <= MAX_SENTENCES) {
    return sentences.join(' ')
  }

  // 최초 1문장 + 최근 7문장 — 인물의 도입부 맥락을 잃지 않으면서 최신 서술을 보여준다
  const first = sentences[0]
  const recent = sentences.slice(-(MAX_SENTENCES - 1))
  return [first, ...recent].join(' ')
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd backend && npx jest tests/unit/ssabi/notes.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: 서비스 테스트를 쓰고 구현한다**

`backend/tests/unit/ssabi/character.service.test.ts`:

```ts
/**
 * GET /books/{b}/ssabi/characters/{c} — FR-CHR-004·005, A5, D6
 *
 * 본문 인물명 탭과 노드 선택이 **같은 응답**을 쓴다.
 */

import { createCharacterService } from '../../../src/modules/ssabi/character.service'
import type { SsabiRepository } from '../../../src/modules/ssabi/repository'

const SNAPSHOT = { current_page: 21, cutoff: 20, percent: 70, chapter: { chapter_no: 2, title: '제2장' } }

function deps(overrides: Partial<SsabiRepository> = {}, spy?: { calls: string[] }) {
  const ssabi: SsabiRepository = {
    findCharacters: async () => [],
    findAliases: async () => [],
    findRelationships: async () => [],
    findCharacter: async () => ({ id: 'c-jeong', name: '정주사', first_appearance_page: 1 }),
    findCharacterNotes: async () => [
      { note: '고무신 장사로 돈을 모았다.', source_page: 2 },
      { note: '딸 계봉을 키우고 있다.', source_page: 18 },
    ],
    findCharacterAliases: async () => [
      { character_id: 'c-jeong', alias: '정 주사', alias_type: 'name', first_appearance_page: 1 },
    ],
    ...overrides,
  }
  return {
    ssabi,
    cutoffService: { getCutoffSnapshot: async () => SNAPSHOT } as any,
    progressService: {
      acceptProgressEvent: async () => {
        spy?.calls.push('progress')
      },
    } as any,
  }
}

describe('CharacterService', () => {
  test('FR-CHR-004: 이름·최초 등장·별칭·노트를 한 응답으로 준다', async () => {
    const result = (await createCharacterService(deps()).getCharacter('d-1', 'takryu', 'c-jeong'))!

    expect(result.name).toBe('정주사')
    expect(result.first_appearance_page).toBe(1) // NFR-OBS-003
    expect(result.aliases).toEqual([
      { alias: '정 주사', type: 'name', first_appearance_page: 1 },
    ])
    expect(result.notes).toBe('고무신 장사로 돈을 모았다. 딸 계봉을 키우고 있다.')
    expect(result.applied_cutoff).toBe(20)
  })

  test('절대 규칙 7번: K 이하 결과에 없는 인물은 null — 초과인지 부재인지 판별하지 않는다', async () => {
    const service = createCharacterService(deps({ findCharacter: async () => null }))
    expect(await service.getCharacter('d-1', 'takryu', 'c-hyeongbo')).toBeNull()
  })

  test('FR-SVB-003: (page, seq) 동봉 시 진도를 먼저 반영한 뒤 스냅샷을 받는다', async () => {
    const spy = { calls: [] as string[] }
    const base = deps({}, spy)
    const service = createCharacterService({
      ...base,
      cutoffService: {
        getCutoffSnapshot: async () => {
          spy.calls.push('snapshot')
          return SNAPSHOT
        },
      } as any,
    })

    await service.getCharacter('d-1', 'takryu', 'c-jeong', { page: 21, seq: 7 })

    // 반대 순서면 한 박자 늦은 K로 답한다 (team-sync §3.4)
    expect(spy.calls).toEqual(['progress', 'snapshot'])
  })

  test('(page, seq)가 없으면 진도를 건드리지 않는다', async () => {
    const spy = { calls: [] as string[] }
    await createCharacterService(deps({}, spy)).getCharacter('d-1', 'takryu', 'c-jeong')
    expect(spy.calls).toEqual([])
  })

  test('A5: 노트가 8문장을 넘으면 서버가 잘라서 준다 — 프론트가 자르지 않는다', async () => {
    const service = createCharacterService(
      deps({
        findCharacterNotes: async () =>
          Array.from({ length: 10 }, (_, i) => ({ note: `s${i + 1}`, source_page: i + 1 })),
      })
    )
    const result = (await service.getCharacter('d-1', 'takryu', 'c-jeong'))!
    expect(result.notes.split(' ')).toHaveLength(8)
  })
})
```

`backend/src/modules/ssabi/character.service.ts`:

```ts
/**
 * GET /books/{b}/ssabi/characters/{c} — 인물 상세 (R4, S4)
 *
 * 조항: FR-CHR-004·005(기준점까지의 맥락 + 별칭) · A5(표시 상한) · D6(별칭 상한)
 *       · FR-SVB-003((page, seq) 동봉) · NFR-OBS-003(응답에 페이지 값)
 *
 * ⚠️ 본문 인물명 탭과 관계도 노드 선택이 **이 응답 하나를 공유한다** (FR-CHR-004·005).
 * ⚠️ 결과가 없으면 null이고, 호출부는 404를 낸다. "기준점 초과라서 없음"과 "원래 없음"의
 *    에러 메시지를 구분하지 않는다 — 문구가 갈리면 그게 판별기다 (절대 규칙 7번, team-sync §4.2).
 */

import type { CutoffService } from '../reading-state/cutoff.service'
import type { ProgressService } from '../reading-state/progress.service'
import { truncateNotes } from './notes'
import type { ProgressEventInput } from './graph.service'
import type { SsabiRepository } from './repository'

export interface CharacterAliasItem {
  alias: string
  type: string
  first_appearance_page: number
}

export interface CharacterResponse {
  name: string
  first_appearance_page: number
  aliases: CharacterAliasItem[]
  /** 근거 페이지 <= K, 최대 8문장. 절단은 서버가 한다 (A5) */
  notes: string
  /** 적용된 기준점 K — NFR-OBS-003 */
  applied_cutoff: number
}

export interface CharacterServiceDeps {
  ssabi: SsabiRepository
  cutoffService: CutoffService
  progressService: ProgressService
}

export interface CharacterService {
  getCharacter(
    deviceId: string,
    bookId: string,
    characterId: string,
    event?: ProgressEventInput
  ): Promise<CharacterResponse | null>
}

export function createCharacterService(deps: CharacterServiceDeps): CharacterService {
  const { ssabi, cutoffService, progressService } = deps

  return {
    async getCharacter(
      deviceId: string,
      bookId: string,
      characterId: string,
      event?: ProgressEventInput
    ): Promise<CharacterResponse | null> {
      // 순서 고정: 진도 반영 → 스냅샷 (graph.service.ts와 같은 이유)
      if (event) {
        await progressService.acceptProgressEvent(deviceId, bookId, event)
      }

      const { cutoff } = await cutoffService.getCutoffSnapshot(deviceId, bookId)

      const character = await ssabi.findCharacter(bookId, cutoff, characterId)
      if (character === null) return null

      const [notes, aliases] = await Promise.all([
        ssabi.findCharacterNotes(bookId, cutoff, characterId),
        ssabi.findCharacterAliases(bookId, cutoff, characterId),
      ])

      return {
        name: character.name,
        first_appearance_page: character.first_appearance_page,
        aliases: aliases.map((alias) => ({
          alias: alias.alias,
          type: alias.alias_type, // DB는 alias_type, 응답 계약은 type
          first_appearance_page: alias.first_appearance_page,
        })),
        notes: truncateNotes(notes),
        applied_cutoff: cutoff,
      }
    },
  }
}
```

그리고 `backend/src/modules/ssabi/composition.ts`에서 Task 7 Step 6에 주석 처리해 둔 `createCharacterService` import와 `characterService` 필드를 복구한다.

- [ ] **Step 6: 테스트가 통과하는지 확인한다**

Run: `cd backend && npx jest tests/unit/ssabi/`
Expected: PASS (notes 4 + character.service 5 + graph 12 + pg-repository 6 = 27 tests)

- [ ] **Step 7: 라우트를 붙인다**

**기존:**

```ts
router.get('/books/:bookId/ssabi/characters/:characterId', (_req: Request, res: Response) => {
  return res.status(501).json({ error: 'NOT_IMPLEMENTED', message: 'R4 담당' });
});
```

**교체 후:**

```ts
router.get('/books/:bookId/ssabi/characters/:characterId', async (req: Request, res: Response) => {
  const { bookId, characterId } = req.params;
  const deviceId = requireDeviceId(req, res);
  if (!deviceId) return;

  try {
    if (!(await ensureBookReady(contentServices.content, bookId, res))) return;

    const character = await ssabiServices.characterService.getCharacter(
      deviceId,
      bookId,
      characterId,
      parseProgressQuery(req)
    );

    if (character === null) {
      // 기준점 초과인지 원래 없는지 구분하지 않는다 — 메시지도 하나뿐이다 (절대 규칙 7번)
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Character not found' });
    }
    return res.json(character);
  } catch (error) {
    console.error('[API] Ssabi character error', { bookId, characterId, error });
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});
```

- [ ] **Step 8: 프론트 타입의 `applied_cutoff` TODO를 해소한다**

`frontend/src/types/ssabi.ts`:

```ts
/** GET /books/:bookId/ssabi/graph */
export interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /**
   * 적용된 기준점 K. NFR-OBS-003 이 요구하며, 없으면 FR-SPL-002 🚦 판정 자체가 불가능하다.
   * 최상단에 싣는 것은 team-sync-r4.md §4.2 에서 R2와 합의한 조회 응답 공통 규약이다.
   * 프론트는 이 값으로 초과 여부를 판별하지 않는다 (절대 규칙 7번) — 게이트 판정용이다.
   */
  applied_cutoff: number;
}

/** GET /books/:bookId/ssabi/characters/:characterId — 노드 선택과 본문 인물명 탭이 같은 응답 */
export interface CharacterResponse {
  name: string;
  first_appearance_page: number;
  aliases: CharacterAlias[];
  /** 근거 페이지 <= K, 최대 8문장. 초과 시 최초 1 + 최근 7 (A5) — 절단은 서버가 한다 */
  notes: string;
  /** 적용된 기준점 K — NFR-OBS-003 (team-sync §4.2) */
  applied_cutoff: number;
}
```

`frontend/mocks/server.ts`의 `mockGraphResponse`·`mockCharacterResponse` 반환값에도 `applied_cutoff: k`를 추가해 대역이 실제 응답과 같은 모양이 되게 한다.

- [ ] **Step 9: 전체 검사**

Run:
```bash
cd backend && npx jest && npx tsc --noEmit
cd ../frontend && npm test && npx tsc --noEmit
```
Expected: 백엔드·프론트 테스트 전부 PASS, 타입 에러 0건

- [ ] **Step 10: 커밋**

```bash
git add backend/src/modules/ssabi/notes.ts backend/src/modules/ssabi/character.service.ts backend/src/modules/ssabi/composition.ts backend/src/api/routes.ts backend/tests/unit/ssabi/notes.test.ts backend/tests/unit/ssabi/character.service.test.ts frontend/src/types/ssabi.ts frontend/mocks/server.ts
git commit -m "feat(R4): GET /ssabi/characters/{c} 인물 상세 — FR-CHR-004·005, A5, NFR-OBS-003"
```

---

## 완료 후 확인 (CP2 정지선)

`dev-spec-R4-frontend.md` §4의 CP2 통과 조건은 **"관계도가 렌더되는가 · 시드의 후반부 관계가 앞 기준점에서 안 보이는가"**다.

- [ ] `VITE_USE_MOCK=false`로 프론트를 띄우고 대시보드 → i 팝업 → 읽기 → 싸비 관계도 탭이 실제 API로 흐르는지 본다
- [ ] `npx jest` 전체 통과 — 특히 `tests/unit/ssabi/graph.test.ts`의 자가 검증 7·8·9·10·12
- [ ] `curl` 로 미완비 도서에 직접 요청해 403 `BOOK_NOT_READY`가 나오는지 확인한다 (자가 검증 25 — UI만으로는 부족하다)
- [ ] 관계도·인물 응답에 `applied_cutoff`가 실려 오는지 확인한다 (자가 검증 26 — 없으면 FR-SPL-002 판정 불가)

**여기서 끝나지 않는 것** — 이 계획의 게이트 테스트는 전부 fixture 기반이다. **실데이터(「탁류」 411페이지, K=40/80/130)로 같은 negative/positive 쌍을 다시 도는 것은 R1 파이프라인이 붙는 CP3(8/21)의 몫이다.** fixture가 통과했다고 게이트를 통과한 것으로 보고하지 않는다.

---

## 이 계획이 다루지 않는 것

| 항목 | 이유 |
| --- | --- |
| `alias_index` (본문 인물명 탭, FR-CHR-004 P0) | `GET /pages` 응답에 실을 계약이 아직 없다 — `team-sync-r4.md` §4.4가 🟡로 열려 있다. 계약이 닫히면 Task 5에 필드를 더한다 |
| 타임라인 탭 | `dev-spec-00-shared.md` §2.5가 `/ssabi/glossary`·`/timeline`을 **[이후 확장] — 만들지 않는다**로 명시했다. Figma 시안의 타임라인 탭은 이번 스코프 밖이다 |
| DB 시드 스크립트 | 공개 콘텐츠 스토어 쓰기는 파이프라인(⑦)만 한다 (절대 규칙 5번). R1 소관 |
| `shared/types.ts`의 `Character`·`Alias` 스키마 불일치 | 공용 타입 수정은 팀 합의 사항이다. R4는 자기 모듈 안에서 자체 Row 타입을 쓰고, 불일치는 team-sync에 올린다 |
| R3 `chatbot/repository.ts`의 컬럼명 오류 | 별건이다 — 아래 참조 |

### merge 후 R3에 전달할 것 (R4 범위 밖, 그러나 CP3를 막는다)

001 DDL과 대조하다 `backend/src/modules/chatbot/repository.ts`에서 **실행 즉시 깨지는 쿼리 3건**을 발견했다. R4가 남의 파일을 고치지 않으므로(CLAUDE.md 6장) 그대로 전달한다.

1. `getBackgroundKnowledge` — `SELECT background_knowledge FROM books WHERE id = $1`. `books`에 `background_knowledge` 컬럼이 없고(→ `background_and_intro` 테이블의 `kind='background'` 행), PK도 `id`가 아니라 `book_id`다.
2. `findChapterSummaries` — `SELECT chapter_no, title, summary, end_page FROM chapter_summaries`. `chapter_summaries`에는 `title`·`end_page`가 **없다**(둘 다 `chapters`). R2의 `pg-repository.ts`처럼 `JOIN chapters`가 필요하다.
3. `findAliases`/`findCharacterNotes` — `aliases`·`character_notes`에 `book_id` 컬럼이 실제로 있으므로 `characters` JOIN 없이 직접 필터가 가능하다(동작에는 문제 없음, 성능·가독성 사항).

---

## Self-Review 기록

**Spec coverage** — `dev-spec-R4-frontend.md` S1(Task 1·2·4·5) · S4(Task 6·7·8) · 자가 검증 1·2·3·5(Task 7) · 7·8·9·10(Task 7) · 11·12(Task 7) · 13·14(Task 8) · 24·25(Task 3) · 26(Task 7·8). API_CONTRACT 7~11번 전부. 자가 검증 4번(인물 노트 <= K)은 Task 6의 SQL 테스트 + Task 8의 서비스 테스트로 나뉘어 덮인다. 자가 검증 6번(배경지식은 K 무관)은 Task 4의 시그니처 테스트로 고정했다. **미덮임**: 자가 검증 15~23번은 프론트 불변식·브리핑 분기라 이 계획(백엔드 5종)의 범위 밖이며 이미 구현·검증돼 있다.

**Type consistency** — `ContentRepository`(Task 1)를 Task 2·3·4·5가, `SsabiRepository`(Task 6)를 Task 7·8이 같은 이름으로 쓴다. `ProgressEventInput`은 Task 7에서 정의해 Task 8이 import한다. `QueryClient`는 두 모듈이 각자 정의한다(R2도 같은 방식). `composition.ts` 두 개가 아직 없는 서비스를 참조하는 구간은 Task 2 Step 5·Task 7 Step 6에 주석 처리 지시를, Task 5 Step 5·Task 8 Step 5에 복구 지시를 명시했다.

**Placeholder scan** — "적절히 처리한다"류 없음. 모든 코드 스텝에 실제 코드가 있다. 결정이 필요한 3건은 임의로 채우지 않고 **착수 전 결정 항목**으로 분리했다.
