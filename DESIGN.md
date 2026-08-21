---
name: RE:ADD (싸비)
description: 표지 없는 고전을 읽은 만큼만 여는, 스포일러 세이프 독서 앱
colors:
  canvas: "#faf8f5"
  surface: "#ffffff"
  line: "#ebe6e0"
  line-subtle: "#edeae6"
  ink: "#1c1b1a"
  muted: "#6e6a66"
  faint: "#76726e"
  accent: "#3b3db2"
  active: "#111111"
  ssabi: "#c86b3d"
  ssabi-soft: "#fdf6f0"
typography:
  display:
    fontFamily: "\"Nanum Myeongjo\", serif"
    fontSize: "24px"
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: "0.05em"
  prose:
    fontFamily: "\"Nanum Myeongjo\", serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 2
    letterSpacing: "normal"
  title:
    fontFamily: "\"Nanum Myeongjo\", serif"
    fontSize: "16px"
    fontWeight: 800
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "\"Gothic A1\", system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "\"Gothic A1\", system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  sm: "2px"
  cover: "8px"
  lg: "8px"
  card: "16px"
  pill: "20px"
  full: "9999px"
spacing:
  card: "18px"
  gutter: "24px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "#ffffff"
    rounded: "{rounded.lg}"
    padding: "10px 20px"
  button-pill:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.faint}"
    rounded: "{rounded.pill}"
    padding: "8px 16px"
  tab-active:
    backgroundColor: "{colors.active}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    padding: "8px 16px"
  ssabi-tab-active:
    backgroundColor: "{colors.ssabi-soft}"
    textColor: "{colors.ssabi}"
    rounded: "{rounded.cover}"
    padding: "8px 12px"
---

# Design System: RE:ADD (싸비)

## Overview

**Creative North Star: "표지 없는 고전의 조판실" (The Typesetting Room for a Coverless Classic)**

「탁류」는 1937년 공개도메인 작품이라 정본 표지가 없다. 이 시스템은 그 결핍을 이미지로 메우는 대신, 명조체 조판으로 표지 구실을 하게 만든다(`TypographicCover`) — 이 결정 하나가 시스템 전체의 태도를 대표한다: **없는 것을 지어내지 않고, 활자 그 자체로 정체성을 세운다.**

톤은 차분한 에디토리얼 원톤이다. 따뜻한 오프화이트 캔버스(`#faf8f5`) 위에 흰 카드가 얹히고, 그림자는 있는 듯 없는 듯한 수준(`0 8px 8px rgba(28,27,26,0.03)`) 하나뿐이다. 게임화·네온·다크모드 테크 무드는 의도적으로 피한다 — 신문·잡지 지면에 가까운, 절제되고 사적인 서재의 느낌이다.

색은 정확히 두 개의 액센트만 쓴다. 차분한 인디고(`#3b3db2`, accent)는 진도·통계 숫자에만, 따뜻한 테라코타(`#c86b3d`, ssabi)는 "싸비"가 소유한 UI(활성 탭, 챗봇 전송 버튼 등)에만 쓰이고 둘은 코드 수준에서도 절대 섞이지 않는다. 서체는 명조(Nanum Myeongjo)와 고딕(Gothic A1) 두 종 — 명조는 "책 그 자체"(워드마크, 본문, 표지 대용 타이포)에, 고딕은 "인터페이스가 하는 일"(탭, 버튼, 캡션)에 쓰인다.

**Key Characteristics:**
- 따뜻한 오프화이트 캔버스 위, 거의 평면적인 흰 카드
- 명조 = 책의 목소리, 고딕 = 인터페이스의 목소리 — 절대 섞지 않는다
- 인디고(진도·통계)와 테라코타(싸비) 두 액센트만, 각자의 영역 밖으로 새지 않는다
- 표지·삽화 없이 활자 조판만으로 정체성을 세운다

## Colors

팔레트는 채도를 억누른 웜뉴트럴 베이스에, 두 개의 절제된 액센트만 얹는 구조다.

### Primary
- **차분한 인디고 (Calm Indigo)** (`#3b3db2`): 진도·통계 숫자 전용(`StatCard` 값, 브리핑 진도 바 채움). 읽기 화면·싸비 패널에는 절대 나타나지 않는다.

### Secondary
- **따뜻한 테라코타 (Warm Terracotta)** (`#c86b3d`): 싸비가 소유한 UI 전용 — 활성 탭 테두리·글자, 챗봇 전송 버튼. 배경 짝은 `#fdf6f0`(ssabi-soft, 활성 탭 배경).

### Neutral
- **캔버스 (Canvas)** (`#faf8f5`): 페이지 배경. 따뜻한 오프화이트.
- **서페이스 (Surface)** (`#ffffff`): 카드·패널 배경.
- **라인 (Line)** (`#ebe6e0` / subtle `#edeae6`): nav 하단선, 진도 트랙, 카드·비활성 탭 테두리.
- **잉크 (Ink)** (`#1c1b1a`): 본문·제목·진도 채움. 가장 짙은 텍스트.
- **뮤티드 (Muted)** (`#6e6a66`): 저자·소개·보조 설명.
- **페인트 (Faint)** (`#76726e`): 비활성 탭 라벨.
- **액티브 (Active)** (`#111111`): 필터탭 활성 배경 — ink보다 한 단계 더 짙은, 선택 상태 전용 검정.

### Named Rules
**The Two Accents Rule.** 인디고는 진도·통계에만, 테라코타는 싸비 UI에만 쓴다. 한 요소에 두 액센트가 동시에 나타나는 순간 "진도"와 "싸비"라는 서로 다른 두 개념이 시각적으로 뒤섞인다 — 이 시스템은 그 경계를 색으로 지킨다.

## Typography

**Display/Prose Font:** "Nanum Myeongjo" (with serif 폴백)
**Body/Label Font:** "Gothic A1" (with system-ui, sans-serif 폴백)

**Character:** 명조는 이 앱이 "책"이라고 부르는 모든 것 — 워드마크, 도서 제목, 표지 대용 타이포, 그리고 본문 그 자체 — 를 맡는다. 고딕은 이 앱이 "인터페이스"로 하는 모든 것을 맡는다. 이 둘은 절대 같은 요소 안에서 섞이지 않는다.

### Hierarchy
- **Display** (800, 24px, 행간 1.25, 자간 0.05em, 명조): RE:ADD 워드마크(`tracking-widest`), 도서 카드 제목.
- **Prose** (400, 18px, 행간 2, 명조): 읽기 화면 본문(`ReaderView`) — 이 시스템에서 유일하게 폭을 560px로 제한하는 텍스트.
- **Title** (800, 16px, 명조): 패널 헤더("싸비의 가이드북").
- **Body** (400, 15px, 행간 1.6, 고딕, 보통 `muted`): 싸비 패널 탭 본문(리캡 등).
- **Label** (400, 13px, 고딕): 탭 라벨, nav 텍스트, 캡션, 스트리밍 표시.

### Named Rules
**The Serif Page Rule.** 명조는 "독자가 책으로서 대하는 것"에만 쓴다. 인터페이스 요소(버튼, 탭, 캡션)가 명조를 빌리는 순간 그 요소는 스스로를 "본문의 일부"라고 주장하는 셈이 되므로, 절대 넘어오지 않는다.

## Layout

태블릿 PC 우선 반응형(`NFR-USE`). 본문 영역은 페이지 폭·글자 크기가 바뀌어도 **다시 나누지 않는다** — 스크롤 길이만 늘어난다(절대 규칙 10번). 대시보드·브리핑 등 목록형 화면은 `max-w-page`(1040px, 책 카드 3열 그리드에서 유도)와 `max-w-stats`(636px, 통계 카드 2열)로 상한을 두고, 넓은 화면에서 nav 콘텐츠와 좌우 끝을 맞춘다. 읽기 화면은 반대로 본문을 `max-w-[560px]`로 좁혀 가독성을 지키고, 싸비 패널이 열리면 우측에 고정폭 420px 슬랩이 추가된다. 간격은 카드 내부 18px(`spacing.card`), 그리드 사이 24px(`spacing.gutter`)를 기본 리듬으로 쓴다.

## Elevation & Depth

그림자는 시스템 전체에 **딱 하나** 존재한다. 나머지는 전부 `line` 테두리와 배경색 대비로만 깊이를 표현하는 평면 구조다.

### Shadow Vocabulary
- **card** (`box-shadow: 0 8px 8px rgba(28, 27, 26, 0.03)`): 도서 카드에만 쓰는 앰비언트 리프트. 카드가 바닥에서 살짝 떠 있다는 안심감만 주며, 극적인 입체감은 이 시스템의 문법이 아니다.

### Named Rules
**The Barely-There Rule.** 그림자는 있는 듯 없는 듯해야 한다. 오프셋을 키우거나 블러를 진하게 하거나 색을 넣고 싶어지는 순간, 그건 이 시스템이 아니라 다른 시스템을 만들고 있다는 신호다.

## Shapes

모서리는 전부 부드럽고 작다 — 날카로운 직각이 없다. 트랙류 요소(진도 바)는 2px(`rounded-sm`)로 거의 각지지 않은 수준, 표지·싸비 탭은 8px(`cover`), 버튼·아이콘 버튼은 8px(`lg`), 카드는 16px(`card`), 필터 탭·챗봇 입력창 같은 알약형 요소는 20px 또는 완전한 pill(`rounded-full`, 원형 뒤로가기 버튼)을 쓴다. 테두리는 항상 `line`/`line-subtle` 1px, 강조가 필요할 때만 `ssabi` 1px로 바뀐다.

## Components

### Buttons
- **Shape:** 기본 8px 라운드(`rounded-lg`).
- **Primary (solid):** ink 배경(`#1c1b1a`) + 흰 글씨, `px-5 py-2.5`, 13px 굵게. "마저 읽기", 에러 재시도 등 강조 동작.
- **Pill (secondary):** `rounded-pill`(20px), `line-subtle` 테두리, `surface` 배경, `faint` 텍스트. 보조 동작.
- **Disabled:** `opacity-40`. 별도 색 변경 없음.

### Tabs (알약형 필터)
- **Style:** `rounded-pill`, `px-4 py-2`, 13px.
- **Selected:** `active`(#111111) 배경 + 흰 글씨.
- **Unselected:** `line-subtle` 테두리 + `surface` 배경 + `faint` 텍스트.

### Ssabi Tabs (패널 내부 3탭)
- **Style:** `rounded-cover`(8px), `px-3 py-2`, 12px.
- **Selected:** `ssabi-soft` 배경 + `ssabi` 테두리 1px + `ssabi` 텍스트.
- **Unselected:** 투명 테두리 + `muted` 텍스트. 필터 탭과 달리 배경색으로 채우지 않는다 — 싸비 영역은 좀 더 조용한 선택 신호를 쓴다.

### Cards
- **Book Card:** 312px 고정폭, `rounded-card`(16px), `p-card`(18px), `shadow-card`. 미완비 도서는 버튼 자체를 disabled로 막는다(단순 스타일이 아니라 실제 클릭 차단).
- **Stat Card:** `rounded-card`, `line-subtle` 테두리, `p-4`. 값은 명조 24px 굵게 인디고, 라벨은 고딕 12px `faint`.
- **Typographic Cover:** 표지 이미지가 없을 때 240px 높이 박스에 명조 제목 + 얇은 구분선(`h-px w-8 bg-line`) + 고딕 저자명을 조판해 표지를 대신한다. `cover_url`이 채워지면 별도 수정 없이 이미지로 자동 전환된다 — 이미지 자리와 조판 자리는 동일한 슬롯이다.

### Inputs
- **챗봇 입력:** `rounded-pill` 컨테이너(`line` 테두리, `surface` 배경), 내부 `input`은 투명 배경 + 12px, placeholder는 `faint`.

### Navigation
- **Nav-bar:** 고정 높이 80px(`navbar`), 하단 `line` 보더. 좌측 부제(고딕 13px `muted`), 우측 도서 검색(비활성)·RE:ADD 워드마크(명조 20px 굵게, `tracking-widest`).
- **읽기 화면 top-bar:** 72px, 뒤로가기(원형 아이콘 버튼) + 워드마크(작은 버전, 12px "탁류" 부제) 조합. 진행률 바 없음 — 페이지 번호만 표시(의도적 생략, FR-PRG-004).

### Loading
- **Style:** 중립 스피너(`size-5`, `border-line`/`border-t-ink` 2px, `rounded-full`, `animate-spin`) + `muted` 13px 캡션. 액센트 두 색(인디고·테라코타)은 로딩에 쓰지 않는다 — 어느 영역에서도 뜨는 공용 컴포넌트라 The Two Accents Rule의 적용을 받는다.
- **fullScreen:** 전체 화면 로딩(진입 판정·본문·서재 목록)은 `bg-canvas` 중앙 정렬. 패널 내부 로딩(관계도 조회)은 배경 없이 여백만 준다 — 이미 `surface` 배경 위에 얹히기 때문이다.
- **Copy:** 맥락별 문구를 쓴다("책을 펼치는 중", "인물 관계를 정리하는 중") — 기본값은 "불러오는 중".

### Ssabi Panel (시그니처 컴포넌트)
420px 고정폭, `surface` 배경, 좌측 `line` 보더. 헤더는 명조 16px 굵게("싸비의 가이드북") + 확인된 경우에만 뜨는 "Np까지 확인" 배지(`ssabi-soft` 배경, `ssabi` 텍스트, pill) — 리캡·챗봇 스트림이 서버로부터 확인해 준 기준점만 표시하며, 프론트가 계산한 값이 아니다. 관계도만 본 상태에서는 배지가 없다(계약에 값이 아직 없음). 그 아래 3탭, 탭 콘텐츠는 스크롤 영역. 패널은 숨기는 대신 **언마운트**한다 — 닫힌 패널의 스트리밍이 계속 돌며 LLM 호출 상한에 걸리는 걸 막기 위한 구조적 선택으로, 시각적 규칙이라기보다 이 컴포넌트의 정체성이다. 여닫기 버튼은 상태와 무관하게 화면의 같은 자리(우측 상단, top-bar 72px 아래·24px)에 고정된다.

## Do's and Don'ts

### Do:
- **Do** 인디고(`accent`)는 진도·통계 숫자에만, 테라코타(`ssabi`)는 싸비 소유 UI에만 쓴다.
- **Do** 명조는 "책"(워드마크·제목·본문), 고딕은 "인터페이스"(탭·버튼·캡션)로 엄격히 나눈다.
- **Do** 표지가 없는 도서는 이미지를 지어내지 말고 명조 조판(`TypographicCover`)으로 대신한다.
- **Do** 그림자는 `card` 토큰 하나만 쓴다 — 앰비언트 리프트 이상으로 진하게 하지 않는다.
- **Do** 읽기 화면 본문은 폭 560px, 명조 18px/행간 2를 유지하고, 폰트·화면 크기 변화에 페이지를 다시 나누지 않는다(구조적 제약, FR-PRG-001).

### Don't:
- **Don't** 진도 바를 읽기 화면에 넣지 않는다 — 페이지 번호만 표시한다(FR-PRG-004, 의도적 생략).
- **Don't** 아이콘 전용 컨트롤에 텍스트 라벨이나 `aria-label` 없이 배포하지 않는다.
- **Don't** 액센트 두 색을 한 요소 안에서 함께 쓰지 않는다.
- **Don't** 그림자·입체감을 이 시스템의 표현 수단으로 늘리지 않는다 — 깊이는 `line` 테두리와 배경 대비로만 낸다.
