---
target: 대시보드 화면 (Dashboard.tsx + Header/StatCard/FilterTabs/BookGrid/BookCard)
total_score: 14
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
timestamp: 2026-08-22T07-24-10Z
slug: frontend-src-pages-dashboard-tsx
---
Method: dual-agent (A: a5e3837077673fecc 디자인 리뷰 · B: a789a1b418f7fb680 탐지기·브라우저 증거)

증거 단서: 평가 도중 백엔드가 죽었다(exit 127, Bedrock CredentialsProviderError). B는 살아 있을 때 받은 실제 응답 JSON을 브라우저 안에서만 XHR로 되돌려 렌더했다 — DOM·CSS·폰트·컴포넌트는 실물, 데이터 전달 경로만 스텁. 파일 미수정.

## Design Health Score

| # | 휴리스틱 | 점수 | 핵심 문제 |
|---|---|---|---|
| 1 | 시스템 상태 가시성 | 1 | 카드 탭 후 enterBook 왕복 동안 스피너·눌림·비활성 없이 침묵 |
| 2 | 시스템과 현실의 일치 | 2 | "완독 0"은 "0권 완독"으로 읽히나 실제 뜻은 "측정 수단 없음" |
| 3 | 이용자 통제와 자유 | 2 | 도서 선택은 취소 수단 없는 편도 전이 |
| 4 | 일관성과 표준 | 2 | 토큰 규율은 지켜지나 타입 램프 이탈 3건 |
| 5 | 오류 방지 | 2 | 진행 중 잠금 없어 POST /entry 연타 발신 |
| 6 | 회상보다 인식 | 2 | "완독" 탭이 왜 항상 비는지 설명 0줄 |
| 7 | 유연성과 효율 | 1 | 재개 지름길 0개 |
| 8 | 심미성과 미니멀리즘 | 2 | 절제된 팔레트는 강점이나 항상 비는 컨트롤 3개 상주 |
| 9 | 오류 인지·진단·복구 | 0 | .catch 부재로 백엔드 장애 시 영구 스피너 |
| 10 | 도움말과 문서 | 0 | 완독=0·검색 비활성·"싸비" 셋 다 설명 없음 |
| 총점 | | 14/40 (35%) | Poor — 주요 UX 보수 필요 |

점수 조정 1건: A는 4번에 1점(근거: Reader와의 .catch 비대칭)을 줬으나 그 결함은 9번에서 이미 0점으로 계산돼 이중 감점이므로 2점으로 상향.
비교 주의: 읽기 화면 19/32(59%)는 크리틱 한 바퀴를 돌고 고친 뒤의 점수라 직접 비교는 불공정.

## Design Specificity 판정

부분 저작. TypographicCover는 진짜 저작 — 표지 결핍을 이미지 생성으로 메우지 않고 명조 조판으로 채우며 cover_url이 생기면 같은 슬롯이 이미지로 전환된다. 그러나 그 아이디어가 위계 싸움에서 진다: 화면 최대 활자이자 유일한 컬러 액센트는 StatCard의 24px 명조 인디고이고, 그 값 하나는 하드코딩 0이다.
구조(통계 2 → 알약 필터 → 표지 그리드)는 어떤 콘텐츠 라이브러리에도 붙는 관행이며, 이 제품의 특수 조건(도서 1권·표지 없음·"돌아온 독자")을 반영하지 않았다. 결정적으로 이 화면에 "마저 읽기"라는 말이 없다.

결정론적 스캔: 정식 명령은 종료 코드 0 / 0건. 그러나 loadDesignSystemForTarget이 null을 반환한다 — frontend/에 package.json과 .impeccable/이 있어 프로젝트 경계로 판정되고 walk-up이 멈추는데, 디자인 시스템은 그 경계 위(reading-recap/)에 있다. 즉 디자인 시스템 규칙이 프론트엔드 파일에 한 번도 적용된 적이 없다. 루트 시스템 강제 주입 시 1건 검출: BookCard.tsx:48 text-[11px] (design-system-font-size, advisory).
추가: HTML/CSS 엔진 DEGRADED(htmlparser2·css-select·css-tree·domutils 미설치) — 계산된 대비·선택자 매칭 규칙은 한 번도 돌지 않았다. 종료 코드 0을 접근성 통과로 읽으면 안 된다.
시각 오버레이 없음(주입 미수행). B는 gstack browse 헤드리스로 실측 스크린샷과 getBoundingClientRect 수치를 확보.

## 잘 되고 있는 것

1. 결핍을 정체성으로 바꾼 표지 처리(TypographicCover). 이미지 자리와 조판 자리가 동일 슬롯.
2. 비활성이 스타일이 아니라 실제 차단 — disabled가 클릭을 막고 서버도 403으로 거절하는 이중 방어.
3. The Two Accents Rule이 코드에서 실제로 지켜짐. 커스텀 클래스 8개 전부 실제 CSS에 정상 생성, 조용히 무시된 클래스 없음.

## 우선순위 이슈

[P0] 카탈로그 조회 실패 시 영구 스피너 — Dashboard.tsx:39 void fetchCatalog().then(...)에 .catch 없음. books가 null로 남아 Loading이 영구 유지. ErrorBoundary는 비동기 rejection을 못 잡는다. B가 백엔드 다운 상태의 실물을 촬영. path="/"인 앱의 유일한 입구. 고칠 방법: Reader.tsx:63이 이미 같은 문제를 고쳐 놨다(주석에 "크리틱 P0" 명기) — catalogError 상태 + loadCatalog 콜백 + role="alert" + "다시 시도" 이식. → /impeccable harden

[P0] "완독" 필터가 화면을 백지로 만든다 — filter==='done'이면 visible이 []가 되고 BookGrid가 빈 ul만 렌더. 빈 상태 분기 없음(B가 DOM 확인). 3개 탭 중 1개가 100% 확률로 백지에 도달하는 함정. "숨기지 않는다"는 결정이 "아무것도 알려주지 않기"로 번역돼 의도와 정반대로 전달된다. 고칠 방법: BookGrid에 emptyMessage prop, 완독 탭 문구 "완독 여부를 판정할 데이터가 아직 없습니다." → /impeccable onboard

[P1] 도서 선택 시 무피드백 + 중복 발신 — handleSelect가 await enterBook 동안 UI 변화 0, .catch 없음, 진행 중 잠금 없어 연타 시 POST /entry 중복(각각 resetSeq() 호출). BookCard에 hover·active 전환 전무(Button.tsx에는 transition-opacity 있음). → /impeccable harden

[P1] 시각 위계가 뒤집혀 있다 — 항상 0인 통계가 최대 활자와 유일한 액센트를 가져가고 재개 정보(104쪽·25.3%)는 최하단 11px. (a) 완독 StatCard 제거 또는 값 "—"·라벨 "완독(판정 불가)" (b) 진도 블록 상단 이동 + 11px→13px 승급 (c) "마저 읽기" 동사 추가. → /impeccable layout

[P2] 카드 하단 진도 영역이 죽은 영역 — button은 표지·제목·저자·소개까지만 감싸고 진도 블록은 버튼 밖 형제 div(BookCard.tsx:44-52). 하단 약 60px 무반응. 접근 가능 이름이 "탁류 채만식"뿐, ProgressBar에 aria-label 없어 "25.3 퍼센트"로만 읽힘. → /impeccable audit

[P2] 반응형 규칙이 0개 — frontend/src 전체에서 sm:/md:/lg:/xl: 0건, 소스 CSS @media 0건, 커스텀 screens 없음. 1440·1024·768 세 폭에서 카드(312×401)·통계행(636)·헤더(80) 완전 동일. max-w-page 1040px은 3열 가정에서 유도했으나 태블릿 랜드스케이프 1024px에서는 콘텐츠 968px이라 3열(984px 필요)이 안 들어간다 — 그리드 유도 근거와 기기 목표가 어긋남. → /impeccable adapt

[P3] 토큰 드리프트 4건 — Header "도서 검색" text-sm(14px, 램프에 없음) / BookCard 도서 제목 text-lg(18px·700)인데 DESIGN.md display는 24px·800 / StatCard font-medium(500)은 Gothic A1이 400·700만 로드돼 합성 굵기 / index.html title이 "싸비 — Reading Recap"(앱 이름은 RE:ADD). → /impeccable typeset

## 페르소나 레드 플래그

Alex(성급한 파워 유저): 두 번 탭 시 POST /entry 두 번 + resetSeq() 두 번. 키보드 진입 시 disabled인 "도서 검색"은 탭 순서에서 빠지고 필터 탭 3개를 지나야 카드에 닿는데 그중 하나는 자기 책이 사라지는 탭. 스타일시트에 focus 규칙 0줄이라 브라우저 기본 파란 링이 웜뉴트럴 팔레트 위에 뜬다.

Sam(접근성 의존): 서재 화면에 heading 요소가 하나도 없다. 앱 전체 h1 0개, heading은 SsabiPanel·BriefingView·RelationshipTab에만. 랜드마크는 있으나 제목 탐색 불가. 필터로 그리드가 비어도 live region이 없어 무음. (접근성 요구사항은 PRODUCT.md 기준 미정 — 확정 위반이 아니라 미정 상태의 위험으로 분류)

지연(프로젝트 고유, PRODUCT.md 독자상에서 생성 — "104쪽에서 덮고 열흘 만에 돌아온 독자"): 화면이 가장 크게 말하는 첫 마디가 "0 · 완독". 진짜 답은 최하단 11px, "마저 읽기"라는 말은 없다. 헤더 좌측 화면 제목 자리에는 카피 "오늘도 나만의 페이스로 활자를 마주합니다" — 열흘 비운 사람에게 공백에 대한 지적으로 읽힐 수 있다.

## 실제 사용 장면 — 도서 1권 문제

실 API: 탁류 1권, cover_url·intro_summary 둘 다 null. 발표일(8/28)까지 이게 실제 화면.
B 실측: 1440px에서 카드 오른쪽 728px, 1024px에서 712px 빈 공간. 필터 3개가 1권을 1/0/1로 거르고 통계는 "1"과 "0". 화면의 크롬 전부가 카드 한 장을 설명하기 위해 존재한다.
이건 데이터 부족이 아니라 설계가 상정한 사용 장면과 실제 사용 장면이 다르다는 뜻이다. 통계·필터·검색은 "책이 여러 권 있는 서재"의 어휘인데 실제 서재에는 책이 하나다.

## 사소한 관찰

- Dashboard가 <Loading />을 인자 없이 호출해 기본값 "불러오는 중"이 뜬다. DESIGN.md는 맥락별 문구를 요구하고 Loading.tsx 주석 스스로 "서재 목록"을 용례로 적어 놨다.
- "읽는 중"이 세 높이에 수직으로 쌓임 — 통계 라벨(개수)/필터 탭(필터)/카드 라벨(상태), 의미가 전부 다른데 근접성이 "하나의 컨트롤"이라 거짓말한다. Dashboard.test.tsx가 이 중복을 주석에 기록하고 data-testid로 우회 중 — 테스트가 UX 문제를 문서화해 놓고 지나갔다.
- 통계 행 636px vs 그리드 1040px 상한이라 카드 1장일 때 세 블록 우측 끝이 제각각.
- 25.3% 소수점 표기는 서버 값 그대로라 프론트 수정 대상 아님(옳음). 서버가 반올림 값을 함께 내려주면 프론트는 렌더만 하면 되므로 계약 소유자에게 넘길 질문.

## 생각해볼 질문

1. 발표까지 카탈로그가 1권이라면 서재 "그리드"는 왜 존재하나? 이 화면을 "탁류로 돌아가는 화면"으로 다시 쓰면 통계·필터·검색이 사라지고 조판 표지 + "104쪽 · 25.3%" + "마저 읽기"만 남는다. 그리드는 2권째가 생긴 날 되살리면 된다.
2. "데이터 없음을 숨기지 않는 것"과 "없는 자리에 0을 인디고 24px로 렌더하는 것"은 같은 일인가? PRODUCT.md 원칙 4번(실패 시 기본값은 미노출)을 통계에 적용하면 완독 카드는 0이 아니라 "—"이거나 자리 자체가 없어야 한다.
3. 노스스타가 "표지 없는 고전의 조판실"인데 서재 타이포그래피의 정점이 왜 0인가? 지금은 인터페이스가 명조를 빌려 자기 통계를 크게 말하고 있다.
