# R4 인수인계 — 읽기 화면·싸비 패널 디자인 critique → polish (2026-08-21)

**브랜치** `feature/R4-query-endpoints` (커밋 안 됨 — 워킹 트리에 변경분만 존재, §1 파일 목록 참조)
**함께 볼 것** `PRODUCT.md`(신규) · `DESIGN.md`(신규) · `.impeccable/critique/2026-08-21T06-55-21Z__frontend-src-pages-reader-tsx.md`(critique 원본 스냅샷)

---

## 0. 30초 요약

**읽기 화면(Reader.tsx) + 싸비 패널만** `/impeccable init → critique → polish` 흐름을 한 바퀴 돌렸다.
critique에서 나온 P0 1건·P1 2건·P2 2건을 전부 고쳤고, 그 뒤 실 브라우저(백엔드 복구 후)로
직접 열어보다가 **추가로 3건을 더 발견해 그 자리에서 고쳤다.**

**대시보드·브리핑은 이번에 손대지 않았다** — 다음 세션에서 같은 방식(critique → 우선순위 확인 →
수정 → polish)으로 이어가기로 사용자와 확정했다.

**가장 중요한 건 코드가 아니라 발견한 백엔드 버그 3건이다(§4)** — 그중 하나(FR-CHR-001 🚦)는
릴리스 게이트 항목이고 CP4 freeze(8/22)가 코앞이라 팀에 오늘 안에 전달돼야 한다.

**검증** — 프론트 `tsc` 0건 / `eslint` 0건 / 32 files · **153 tests** 전부 통과(critique 이전
139 → P0/P1/P2/polish로 +14).

---

## 1. 완료 상태

### 문서 (신규)
| 파일 | 내용 |
| --- | --- |
| `PRODUCT.md` | 제품 인터뷰 결과 — 사용자·포지셔닝(독립 읽기 플랫폼으로 확정)·제약. 접근성은 미정으로 명시 |
| `DESIGN.md` + `.impeccable/design.json` | 기존 코드에서 추출한 디자인 시스템 문서화. North Star "표지 없는 고전의 조판실" |

### critique 결과 → 수정 (읽기 화면 + 싸비 패널)
| 우선순위 | 문제 | 수정 파일 | 상태 |
| --- | --- | --- | --- |
| P0 | 진입 판정 실패 시 에러 화면 없음(무한 로딩) | `Reader.tsx` | ✅ `.catch` + 재시도 UI, 테스트(`Reader.error.test.tsx`) |
| P1 | 기준점("몇 p까지 안전")을 상시 보여주는 지표 없음 | `useSSE.ts`, `SsabiPanel.tsx`, `Reader.tsx` | ✅ recap/chat의 `done.applied_cutoff`를 배지로 표시 (관계도만 본 상태는 계약에 값이 없어 표시 못함 — §4) |
| P1 | `Loading.tsx` 무스타일 | `Loading.tsx`, `Reader.tsx`, `RelationshipTab.tsx` | ✅ 중립 스피너 + 맥락별 문구 |
| P2 | 챗봇 말풍선 화자 구분 안 됨 | `ChatbotTab.tsx` | ✅ 싸비 답변만 `bg-ssabi-soft` |
| P2 | 리캡 본문이 `text-muted`(저평가) | `RecapTab.tsx` | ✅ `text-ink`로 승격 |

### polish에서 실측으로 추가 발견 → 수정
1. **P1 배지가 여닫기 토글 버튼과 정확히 같은 x좌표에서 겹쳐 잘림** — `SsabiPanel.tsx` 헤더에 `pr-20` 확보.
2. **챗봇 탭을 열면 질문 전에도 빈 말풍선이 떠 있었음** — `ChatbotTab.tsx`, `answer`가 있을 때만 렌더.
3. **인물 관계도가 실 데이터(30명·51개 관계)에서 중심 라벨이 뭉개져 안 읽힘** — `graphLayout.ts`에 `shouldShowEdgeLabels`(간선 15개 초과 시 캔버스 라벨 생략, 관계 목록엔 그대로 남음) 추가, `RelationshipGraph.tsx`에서 사용.

### 정리
- 죽은 스텁 삭제: `components/Reader/PageContent.tsx`, `PageNavigation.tsx` (아무 데서도 import 안 됨, 확인 후 삭제)
- `SsabiToggleButton.tsx` 오래된 주석("자리가 바뀐다") → 실제 구현(고정 위치)에 맞게 정정

### ⚠️ 이 세션과 무관한 기존 변경분 (혼동 주의)
`git status`에 `Header.tsx`·`Dashboard.tsx`·`tailwind.config.js`가 같이 떠 있는데,
**이 셋은 이번 세션 시작 전부터 있던 변경분이다.** 이번 세션에서 diff를 만들지 않았다
(diffstat으로 재확인함: Header +23/-11줄, Dashboard 4줄, tailwind.config 5줄 — 전부 내가 쓴 게 아님).
다음 세션에서 대시보드를 다룰 때 이 기존 변경분이 무엇인지부터 파악해야 한다(아마 이전 세션의
"tailwind.config.js는 HMR로 안 먹는다" lessons.md 항목과 관련된 페이지 폭 수정으로 추정 — 확인 필요).

---

## 2. 실행 환경

```bash
cd C:/Users/yemoy/aws-project/reading-recap
git branch --show-current        # feature/R4-query-endpoints
```

두 서버 (사용자가 백엔드를, 내가 프론트를 각자 띄웠다):
```bash
cd backend  && npx ts-node src/index.ts          # 3000 — API
cd frontend && npm run dev                       # 5173 — 화면 (vite 기본 포트)
```

프론트는 `VITE_USE_MOCK=false`로 실 API를 본다. 데모 디바이스는
`device_id = 11111111-1111-4111-8111-111111111111`, 도서 `takryu`, 이 세션 기준
`current_page = 101`(cutoff=100). 화면 이동하면 진도가 실제로 바뀌어 이 상태가 바뀐다 —
필요하면 `handoff-r4-query-endpoints.md` §2의 시드 스크립트로 복구.

바로 확인하려면: `http://localhost:5173/books/takryu/read`

---

## 3. 브라우저로 확인한 것 (백엔드 복구 후, claude-in-chrome로 실측)

- 읽기 화면 닫힌 상태, 싸비 패널 열림(기본 탭 인물 관계도), 리캡 탭, 챗봇 탭 — 전부 스크린샷으로 확인.
- 위 polish 발견 3건(§1) 전부 수정 전/후 스크린샷 대조로 개선 확인.
- 백엔드 첫 요청은 워밍업 중 500을 반환했다가 재시도로 정상화되는 패턴을 봤다 — 재현성은
  확인 안 함, 매번 그런지는 다음 세션에서 지켜볼 것.

---

## 4. 🔴 다른 파트에 반드시 전달할 것 (freeze 전 확인 필요)

### 백엔드 팀 전체에

**FR-CHR-001 🚦 위반을 실 데이터에서 확인했다.** `GET /ssabi/graph` 응답(K=100)에서 노드 30·간선
51인데, **47개 고유 인물 쌍 중 4쌍이 중복 간선**으로 내려온다 — 같은 쌍에 대해 서로 다른 라벨·
`established_page`를 가진 간선이 둘 다 존재한다(예: 초봉이↔고태수 = "점원과 단골 손님"(29p) +
"혼인 예정자"(91p)). 명세는 "이력형 최신 라벨 1개만"이고, 프론트 코드(`RelationshipGraph.tsx`,
`graphLayout.ts`) 자체가 이미 이 전제를 문서화해 갖고 있었다 — 실 데이터가 그 전제를 어겼다.
**프론트에서 de-dup하지 않았다** — 백엔드 쿼리(R1/R2) 문제라 임의로 감추면 게이트가 조용히
넘어간다. 재현: 위 §2 환경으로 `curl "http://localhost:3000/books/takryu/ssabi/graph?page=101&seq=1" -H "X-Device-Id: 11111111-1111-4111-8111-111111111111"` 후 (source,target) 정렬쌍 중복 확인.

### R3에게

챗봇에 질문하면 **"Stream processing failed"라는 영문 원본 에러가 그대로 화면에 노출된다.**
프론트(`chatbotService.ts`)는 서버가 보낸 에러 문구를 그대로 렌더할 뿐 판별하지 않으므로
(절대 규칙 7번), 이 문구 자체가 백엔드/LLM 게이트웨이에서 나온 것이다. 실제 호출이 실패하는
원인도 확인 필요, 문구도 한국어로 바꿔야 한다.

### R1에게

본문에 `??성층권의 연구??` 같은 깨진 문자가 보인다(101페이지 근방). 원문의 낫표(「」) 등
특수문자가 데이터 파이프라인에서 인코딩 손상된 것으로 보인다 — 다른 페이지에도 있는지 전수
확인 필요.

### 팀 전체에 (기존 미해소 항목, 다시 확인됨)

`GraphResponse`에 `applied_cutoff`가 없다는 게 `handoff-r4-query-endpoints.md`(§5)에도 이미
적혀 있던 항목인데 아직 그대로다. 이번 P1 수정(기준점 배지)이 관계도 탭에서는 뜨지 못하는
직접적 원인이다 — 이 필드가 추가되면 배지를 관계도 탭에도 바로 연결할 수 있다.

---

## 5. 확인하지 못한 것

- **FR-CHR-001 중복 간선이 다른 페이지(K값)에서도 재현되는지**는 확인 안 함. K=100 1건만 봤다.
- **접근성**(대비·키보드 포커스·스크린리더)은 이번 라운드에서 검증하지 않았다 — PRODUCT.md에
  적힌 대로 아직 요구사항 자체가 미정이다.
- **모바일/좁은 뷰포트 검증은 못 했다** — `resize_window` 도구가 이 세션에서 실제 뷰포트를
  바꾸지 못하는 것으로 보여(스크린샷 크기가 그대로였음) 시도만 하고 중단했다. 다음 세션에서
  다른 방법(디바이스 툴바 강제 등)으로 재시도 필요.
- **P0(진입 실패 재시도)를 백엔드 죽인 상태에서 실측 재현하지는 않았다** — 자동화 테스트로만
  확인했다(백엔드를 다시 죽이는 건 사용자가 관리 중인 서버라 건드리지 않았다).

---

## 6. 재개 방법

```bash
cd C:/Users/yemoy/aws-project/reading-recap
git status                        # 워킹 트리 그대로 남아 있을 것 — 커밋 안 했음
cd backend  && npx ts-node src/index.ts
cd frontend && npm run dev
```

다음 세션 순서(사용자 확정): **대시보드**에 같은 흐름(`/impeccable critique` → 우선순위 확인 →
수정 → `/impeccable polish`) 적용. 시작 전에 §1의 "이 세션과 무관한 기존 변경분"부터 정체를
파악할 것 — 대시보드를 만지는 순간 그 변경분과 섞이게 된다.
