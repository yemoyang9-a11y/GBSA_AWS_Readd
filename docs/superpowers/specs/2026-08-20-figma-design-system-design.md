# Figma 시안 적용 설계 — 프론트엔드 디자인 시스템

**작성** 2026-08-20 · **파트** R4 · **브랜치** `feature/R4-frontend`
**시안** Figma `AWS 프로젝트` (`u1rpA2C7aoD7YinAMyY0Tm`) — 캔버스 우측 하단 화면군
**선행 문서** `dev-specs/R4-frontend.md` S2·S3·S5 · `CLAUDE.md` 2장 절대 규칙 · `team-sync-r4.md`

---

## 1. 목적과 범위

읽기·조회 로직이 이미 동작하는 프론트엔드에 Figma 시안의 시각 디자인을 입힌다. 레이아웃과 구성은 시안을 따르고, 책 정보는 데모 대상인 「탁류」로 채운다.

**이번 범위 — 데모 동선 4화면**

| 화면 | Figma 노드 | 라우트 |
| --- | --- | --- |
| 대시보드 | `1:476` | `/` |
| 브리핑 | `1:477` | `/books/:bookId/briefing` |
| 읽기 + 싸비 리캡 | `1:480` | `/books/:bookId/read` |
| 싸비 인물 관계도 | `48:1067` | 〃 (탭 전환) |
| 싸비 챗봇 | `79:1254` | 〃 (탭 전환) |

**이번 범위 밖** — `i` 팝업(책 간략 정보, `47:189`), 싸비 없는 읽기(`47:132`). 시간이 남으면 추가한다. CP3 관통 동선에 필요한 화면이 아니다.

이 설계는 **시각 계층만** 다룬다. 데이터 배선·라우팅·상태 관리는 이미 동작하며 건드리지 않는다.

---

## 2. 현황 (2026-08-20 실측)

- Tailwind 3.4.19가 **설치·작동 중**이다. `tailwind.config.js`(content 글롭 정상)·`postcss.config.js`·`@tailwind` 지시문·`main.tsx`의 CSS import가 모두 제자리에 있고, dev server가 유틸리티 클래스를 정상 컴파일한다. 화면이 휑했던 원인은 설정이 아니라 **컴포넌트에 뼈대 클래스만 있어서**다.
- `theme.extend`가 비어 있다. 디자인 토큰이 없다.
- Figma 파일에 변수(variables)가 정의돼 있지 않다(`get_variable_defs` → `{}`). 토큰은 시안에서 직접 추출한다.
- **빈 스텁 5개**: `Header`(`<header>싸비</header>`), `Sidebar`(`<aside />`), `ProgressBar`(빈 div + `role="progressbar"`), `Button`(무스타일 button), `RelationshipGraph`(`<div />`).
- 표지 에셋이 없다. mock fixture의 `cover_url`이 빈 문자열이고 `src/assets/images/`는 비어 있다. **R1의 `run-register.ts`도 `cover_url`을 설정하지 않으므로 실데이터에서도 비어 있을 가능성이 크다.**
- 프론트 테스트 77개(18파일)가 통과 중이다. 다수가 role·텍스트로 요소를 찾는다.

---

## 3. 디자인 토큰

`1:476`의 `get_design_context` 실측값이다. `tailwind.config.js`의 `theme.extend`에 심고, 컴포넌트는 임의 값(`text-[#1c1b1a]`) 대신 토큰 이름을 쓴다.

```js
// tailwind.config.js
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#faf8f5',        // 페이지 배경 — 따뜻한 오프화이트
        surface: '#ffffff',       // 카드·패널 배경
        line: {
          DEFAULT: '#ebe6e0',     // nav 하단선, 진도 트랙, 구분선
          subtle: '#edeae6',      // 통계 카드·비활성 탭 테두리
        },
        ink: '#1c1b1a',           // 본문·제목·진도 채움
        muted: '#6e6a66',         // 저자·소개·보조 설명
        faint: '#76726e',         // 비활성 탭 라벨
        accent: '#3b3db2',        // 통계 숫자 강조 (남보라)
        active: '#111111',        // 활성 탭 배경
      },
      fontFamily: {
        serif: ['"Nanum Myeongjo"', 'serif'],       // 제목·숫자·본문 조판
        sans: ['"Gothic A1"', 'system-ui', 'sans-serif'], // 보조 텍스트·UI
      },
      borderRadius: {
        card: '16px',
        cover: '8px',
        pill: '20px',
      },
      boxShadow: {
        card: '0 8px 8px rgba(28, 27, 26, 0.03)',
      },
      spacing: {
        card: '18px',   // 카드 내부 패딩
        gutter: '24px', // 카드 사이 간격
      },
      width: {
        'book-card': '312px',
      },
      height: {
        cover: '240px',
        navbar: '80px',
      },
    },
  },
  plugins: [],
};
```

**타이포 스케일** (시안 실측, px)

| 용도 | 크기 | 서체 | 굵기 |
| --- | --- | --- | --- |
| 서재 제목 ("수진님의 서재") | 22 | 명조 | ExtraBold |
| 통계 숫자 | 24 | 명조 | Bold |
| 책 제목 | 18 | 명조 | Bold |
| nav 링크 | 14 | Gothic A1 | Regular |
| 탭 라벨 · 부제 | 13 | Gothic A1 | Regular·Bold |
| 저자 · 소개 · 통계 라벨 | 12 | Gothic A1 | Regular |
| 진도 라벨 | 11 | Gothic A1 | Regular / Bold |

시안에는 Inter도 섞여 있으나(탭·통계 라벨), 한글이 없는 구간이고 Gothic A1과 시각적 차이가 작다. **Inter를 별도로 불러오지 않고 Gothic A1로 통일한다** — 웹폰트 요청을 하나 줄여 발표장 네트워크에서 첫 렌더가 늦어질 위험을 낮춘다(NFR-PERF).

### 3.1 서체 로딩

`index.html`의 `<head>`에 Google Fonts를 링크한다.

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@400;700;800&family=Gothic+A1:wght@400;700&display=swap"
  rel="stylesheet"
/>
```

`display=swap`으로 폰트 미도착 시에도 텍스트가 먼저 보이게 한다. **발표장 네트워크가 막히면 시스템 명조·고딕으로 폴백된다** — 레이아웃이 깨지지 않도록 `fontFamily`에 폴백을 함께 지정했다(위 config 참조).

---

## 4. 컴포넌트 인벤토리

각 항목은 **한 가지 책임**을 갖고 props로만 소통한다. 데이터 조회·상태 판단을 하지 않는다 — 전부 페이지가 내려준 값을 렌더한다.

### 4.1 신규 (`src/components/common/`)

| 컴포넌트 | 책임 | props |
| --- | --- | --- |
| `TypographicCover` | 표지 자리. `coverUrl`이 있으면 이미지, 없으면 제목·저자를 명조로 조판한 표지를 그린다. 높이 240px·모서리 8px 고정 | `{ title, author, coverUrl }` |
| `BookCard` | 표지 + 제목·저자 + 소개 + 구분선 + 진도. 대시보드 그리드의 한 칸 | `{ book, onSelect }` |
| `StatCard` | 숫자 + 라벨. 테두리 카드 | `{ value, label }` |
| `FilterTabs` | 알약형 탭 그룹. 활성 1개 | `{ tabs, active, onChange }` |

### 4.2 스텁 채우기

| 컴포넌트 | 지금 | 채울 내용 |
| --- | --- | --- |
| `common/ProgressBar` | 빈 div + `role="progressbar"` | 높이 4px 트랙(`line`) + 채움(`ink`), 모서리 2px. **`role="progressbar"`와 `aria-valuenow`를 그대로 유지한다** |
| `common/Button` | 무스타일 `<button>` | 솔리드(`ink` 배경·흰 글씨)와 알약형 두 변형 |
| `Layout/Header` | `<header>싸비</header>` | nav-bar — 좌측 프로필 요약(제목 22px 명조 + 부제 13px), 우측 "도서 검색"·RE:ADD 로고. 높이 80px, 하단 `line` 보더 |
| `Ssabi/RelationshipGraph` | `<div />` | React Flow + 원형 배치 (§6) |

`Layout/Sidebar`는 **손대지 않는다.** 시안에 대응 영역이 없고(시안의 `sidebar` 노드는 nav 안의 프로필 블록이다) 현재 어디서도 쓰이지 않는다.

### 4.3 스타일만 입히는 것

`BookGrid`, `ReaderView`, `PageContent`, `PageNavigation`, `SsabiPanel`, `RecapTab`, `RelationshipTab`, `ChatbotTab`, `Dashboard`, `BriefingView`, `Reader`, `Loading`, `NotFound`.

---

## 5. 화면별 조립

각 화면 구현 시 해당 노드에 `get_design_context`를 호출해 정확한 간격·정렬을 확인한다. 아래는 구조 수준의 결정이다.

### 5.1 대시보드 (`1:476`)

```
Header (nav-bar 80px)
└ 좌: "수진님의 서재" + "오늘도 나만의 페이스로 활자를 마주합니다."
└ 우: 도서 검색(비활성) · RE:ADD 로고

StatCard × 2   ("읽는 중" n / "완독" n)      ← gap 12px
FilterTabs     (읽는 중 · 완독 · 전체)
BookGrid       → BookCard 반복, gap 24px, 카드 폭 312px
```

카드 내부는 표지(240px) → 제목(18px 명조) → 저자(12px) → 소개 2줄(12px, `line-clamp-2`) → 구분선 → 진도 라벨("읽는 중" / "n% 완료") + 진도 바(4px) 순이다.

### 5.2 브리핑 (`1:477`)

표지 + "N일 만이에요" + 인사 문구 + 책 제목·저자 → 현재 장·퍼센트 진도 바 → "그동안 이런 이야기였어요"(리캡 본문) → 목차 리스트 → '마저 읽기'.

**목차 항목에 이동 요소를 만들지 않는다**(FR-BRF-004, D12). 시안의 목차 행 우측 "읽기" 버튼은 8/19에 제거로 확정된 프로토타입 잔재이므로 **렌더하지 않는다.**

### 5.3 읽기 화면 + 싸비 패널 (`1:480` · `48:1067` · `79:1254`)

```
top-bar    로고 · 책 제목 | (우) 현재 장 제목
body       ┌ 본문 영역 (flex-1)        ┐  ┌ 싸비 패널 (고정폭) ┐
           │ PageContent — 명조 조판   │  │ 패널 헤더          │
           │                           │  │ TabBar (3탭)       │
           └ PageNavigation (하단)     ┘  └ 탭 콘텐츠          ┘
```

- 하단은 **페이지 번호만** 표시한다("21 / 30"). 진도 바를 두지 않는다 (FR-PRG-004).
- 본문은 페이지를 재분할하지 않는다. 폰트·화면 크기가 바뀌어도 페이지 내 스크롤 길이만 변한다 (FR-PRG-001, 절대 규칙 10번).
- 탭 콘텐츠: 리캡(텍스트), 인물 관계도(`RelationshipGraph` + 인물 카드 목록), 챗봇(선택 문장 인용 + 대화 + 입력창).

---

## 6. 관계도 배치

React Flow는 노드 좌표를 요구한다. 외부 레이아웃 라이브러리를 추가하지 않고 **원형 배치**를 직접 계산한다.

```
노드 i (전체 N개):
  θ = 2π · i / N − π/2          // 12시 방향에서 시작
  x = cx + R·cos θ
  y = cy + R·sin θ
  R = min(panelWidth, graphHeight)/2 − nodeRadius − margin
```

인물 5명 규모에서 시안과 유사한 방사형 모양이 나온다. 새 의존성이 없고, 노드 수가 변해도 좌표가 결정적이다.

**간선 라벨은 React Flow `label`로 글자를 병기한다.** 색상만으로 관계를 구분하지 않는다 (NFR-USE-006). 간선은 서버가 이력형 최신 1개만 내려주므로 프론트에서 중복 제거를 하지 않는다 (A6, FR-CHR-001 🚦 — 판별 코드를 만들지 않는다, 절대 규칙 7번).

---

## 7. 시안과 데이터·계약의 불일치 처리

| # | 시안에 있는 것 | 계약 상태 | 처리 |
| --- | --- | --- | --- |
| 1 | 통계 카드 "읽는 중 3 / 완독 12" | `GET /books`에 완독 여부·집계 없음 | 카탈로그 응답에서 **프론트가 센다** — `progress`가 있으면 읽는 중. "완독"은 판정 데이터가 없으므로 0으로 둔다. 목록 길이 세기일 뿐 기준점 파생값이 아니라 **절대 규칙 2번과 무관**하다 |
| 2 | 필터 탭 "읽는 중 / 완독 / 전체" | 상태 필터 파라미터 없음 | 같은 기준으로 **클라이언트 필터**. 서버 재호출 없음 |
| 3 | nav "도서 검색" | 대응 엔드포인트 없음 | 자리만 두고 **비활성**. 없는 엔드포인트를 지어내지 않는다 (CLAUDE.md 6장) |
| 4 | 책 표지 이미지 | `cover_url` 빈 값, R1도 미설정 | `TypographicCover` — 제목·저자 조판. `cover_url`이 채워지면 자동으로 이미지로 전환된다 |
| 5 | 카드 소개 문구 | `BookSummary`에 필드 없음 | `GET /books` 응답에 `intro_summary` 추가 (엔드포인트 계획 D-3) — **미확정. 확정 전까지 프론트는 필드가 없으면 소개 영역을 비운다** |

### 7.1 시안에서 의도적으로 벗어나는 지점 — 1건

**싸비 패널 탭을 4개가 아니라 3개로 만든다.** 시안에는 리캡·인물 관계도·타임라인·챗봇 4탭이 있으나, `dev-specs/00-shared.md` §2.5가 `GET /books/{b}/ssabi/timeline`을 **"[이후 확장] — 만들지 않는다"**로 명시했다. 만들 수 없는 탭을 UI에만 두면 발표에서 눌렀을 때 빈 화면이 나온다.

이것이 시안 대비 유일한 구조적 차이다.

---

## 8. 테스트

**77개를 계속 통과시키는 것을 완료 조건에 포함한다.**

마크업이 바뀌면 테스트 쿼리를 함께 옮긴다. 다만 **게이트가 걸린 검증의 의미는 유지한다** — 아래 세 가지는 어떤 형태로든 살아 있어야 한다.

| 검증 | 조항 |
| --- | --- |
| 읽기 화면에 진도 바가 없다 | FR-PRG-004 |
| 관계 라벨이 텍스트로 병기된다 (색상 단독 아님) | NFR-USE-006 |
| 미완비 도서 카드가 비활성이다 | FR-BRW-002 🚦 |

`ProgressBar`는 시각 요소를 채우되 `role="progressbar"`·`aria-valuenow`를 유지해 기존 접근성 쿼리가 그대로 동작하게 한다. **테스트를 느슨하게 바꾸는 방식은 쓰지 않는다** (CLAUDE.md 7장).

정적 게이트도 유지된다 — R2의 `derived-value-single-source.test.ts`가 `frontend/src` 전체에서 `page - 1`·`/ total`·`Math.floor(...*100)` 패턴을 0건으로 강제한다. 통계 집계(§7 #1)는 배열 길이 세기이므로 이 패턴에 걸리지 않는다.

---

## 9. 범위 밖

| 항목 | 이유 |
| --- | --- |
| `i` 팝업(`47:189`) · 싸비 없는 읽기(`47:132`) | CP3 관통 동선 밖. 시간이 남으면 추가 |
| 타임라인 탭 | `00-shared.md` §2.5 "[이후 확장] — 만들지 않는다" |
| 도서 검색 기능 | 엔드포인트 없음 (§7 #3) |
| 백엔드 조회 엔드포인트 5종 | 별도 계획 — `docs/superpowers/plans/2026-08-20-r4-query-endpoints.md` |
| 다크 모드 | 시안에 없다 |

---

## 10. 열려 있는 항목

1. **`intro_summary` 필드 확정** — 엔드포인트 계획 D-3. 확정 전까지 카드 소개 영역은 비워둔다. `/books`가 R4 소유 엔드포인트라 R4가 정할 수 있다.
2. **「탁류」소개 문구·부제 문안** — 시안의 "서울 청파동 골목길…" 자리에 들어갈 탁류 문구. R1의 `intro_summary` 또는 `background_and_intro`에서 오지만 아직 값이 없다. 임시 문구로 채우고 실데이터 전환 시 교체한다.
3. **대시보드 인사 문구의 이름** — 시안은 "수진님의 서재". 데모에서 어떤 이름을 쓸지 미정. 계정 개념이 없으므로(디바이스 식별만) 고정 문구가 된다.

---

## 11. 검증

작업 단위마다 아래를 확인한다.

- `npx tsc --noEmit` 0건, `npm test` 77개 이상 통과
- `npm run dev`로 띄워 실제 브라우저에서 해당 화면 확인 — **스크린샷을 눈으로 본다.** 빈 화면은 실패다
- 태블릿 가로(1133×744)를 기준 뷰포트로 확인한다 (시안 기준, 태블릿 PC 우선 — `dev-specs/R4-frontend.md`)
