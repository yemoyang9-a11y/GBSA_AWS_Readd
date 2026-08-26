/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#faf8f5', // 페이지 배경 — 따뜻한 오프화이트
        surface: '#ffffff', // 카드·패널 배경
        line: {
          DEFAULT: '#ebe6e0', // nav 하단선, 진도 트랙, 구분선
          subtle: '#edeae6', // 통계 카드·비활성 탭 테두리
        },
        ink: '#1c1b1a', // 본문·제목·진도 채움
        muted: '#6e6a66', // 저자·소개·보조 설명
        faint: '#76726e', // 비활성 탭 라벨
        accent: '#3b3db2', // 통계 숫자 강조
        active: '#111111', // 활성 탭 배경
        // 공용 강조 남색(2026-08-25, 사용자 결정) — 원래 진도 바 채움 통일 목적으로
        // 골랐다(대시보드 ink · 브리핑 brief-accent 남보라, 시안 5종 비교 후 이 색으로
        // 합침. ProgressBar.tsx tone="dash"·"brief" 둘 다 사용, 트랙 색은 여전히
        // dash-line/brief-line 유지). 같은 날 챗봇 답변 말풍선 테두리(ChatbotTab.tsx,
        // 기존 brief-accent)에도 재사용해 화면 간 강조색을 맞췄다 — 이름은 progress지만
        // 진도 바 전용이 아니다.
        progress: '#35536b',
        ssabi: {
          // 싸비 전용 강조색. accent(남보라)와 별개다 — 시안이 진도·통계는 남보라로,
          // 싸비 관련 UI는 테라코타로 구분한다. 한 토큰으로 묶으면 두 계열이 함께 움직인다.
          DEFAULT: '#c86b3d', // 싸비 활성 탭 테두리·글자, 챗봇 버튼 배경
          soft: '#fdf6f0', // 싸비 활성 탭 배경
        },
        dash: {
          // 대시보드 재설계 전용(2026-08-23 시안 확정). 기존 ink/muted/line과 값이
          // 미세하게 다르고 브리핑·읽기·싸비는 여전히 옛 값을 쓰므로 섞지 않는다.
          ink: '#1f1f1f',
          muted: '#777777',
          line: '#dedede',
          paper: '#fbf9f7',
        },
        brief: {
          // 브리핑 재설계 전용(2026-08-23 시안 확정). 대시보드(dash-*, 무채색)와 달리
          // 보라 액센트를 쓴다 — 화면마다 팔레트가 다르므로 섞지 않는다.
          // 읽기 화면(.reader-scr)이 같은 CSS 변수 세트를 그대로 쓰므로 여기 토큰을
          // 공유한다 — page(읽기 영역 배경)만 브리핑엔 없던 값이라 추가했다.
          // 시안 실측값은 #fbf8f2였으나, 배포 후 "읽기 화면이 너무 황토색 느낌"이라는
          // 사용자 피드백으로 조정했다(2026-08-24). 1차로 밝기만 올렸다가("더 밝게"만
          // 처리, #fdfcf9) 그래도 노랗다는 재피드백을 받고, R·B 채널 격차 자체를
          // 줄여 채도(누런 기운)를 낮췄다 — 밝기만으로는 안 풀리는 문제였다.
          paper: '#fdfdfa',
          // 시안 실측값은 #f6f1e4(본문 영역만 더 누런 톤)이었으나, 실제로 켜보니
          // topbar/패널(paper)과 본문(page)이 두 톤으로 갈라져 보인다는 사용자 피드백으로
          // paper와 동일하게 통일했다(2026-08-24).
          page: '#fdfdfa',
          ink: '#272623',
          muted: '#86847c',
          line: '#ebe8e1',
          // 시안 실측값은 #d3c6a8 — 테두리·구분선뿐 아니라 .brief-scroll 스크롤바 색으로도
          // 쓰이는데, 스크롤바는 면적이 넓어 특히 "황토색"으로 튀어 보인다는 피드백(2026-08-24)
          // 으로 더 옅게, 이어서 더 중립적인 톤으로 조정했다.
          rule: '#e4e0d5',
          // 보라/남색 액센트를 세이지 그린으로 교체(2026-08-25, 사용자 요청 — 배경·글자색은
          // 그대로 두고 액센트 색만 바꿔 달라고 함). 배경(paper/page)은 원래 값으로 되돌렸다.
          accent: '#4f7052',
          'accent-soft': '#e8ecdd',
        },
      },
      fontFamily: {
        serif: ['"Nanum Myeongjo"', 'serif'],
        sans: ['"Gothic A1"', 'system-ui', 'sans-serif'],
        dashSerif: ['"Noto Serif KR"', 'serif'],
        dashSans: ['Pretendard', 'system-ui', 'sans-serif'],
        dashMono: ['"DM Mono"', 'monospace'],
      },
      borderRadius: {
        card: '16px',
        cover: '8px',
        pill: '20px',
        // 대시보드 재설계 다듬기(2026-08-23) — 각진 패널·카드·표지를 부드럽게.
        // 브리핑 화면 critique 때 쓴 "14px 모서리 + 부드러운 그림자"(hairline+각짐 회피)와
        // 같은 처방을 대시보드에도 적용해 화면 간 톤을 맞춘다.
        'dash-panel': '18px',
        'dash-card': '14px',
        'dash-hero-cover': '10px',
        'dash-row-cover': '8px',
        'brief-panel': '14px',
        'brief-card': '10px',
      },
      boxShadow: {
        card: '0 8px 8px rgba(28, 27, 26, 0.03)',
        'dash-soft': '0 2px 10px rgba(31, 31, 31, 0.07)',
        'brief-soft': '0 10px 24px rgba(42, 38, 32, 0.07), 0 2px 6px rgba(42, 38, 32, 0.05)',
        'brief-soft-sm': '0 4px 10px rgba(42, 38, 32, 0.08)',
      },
      spacing: { card: '18px', gutter: '24px' },
      width: { 'book-card': '312px', 'row-cover': '84px', 'brief-cover': '168px' },
      // 페이지 폭. 시안은 고정 프레임이라 넓은 화면에서의 상한을 정하지 않았다.
      // 책 카드 312px + 간격 24px 그리드에서 유도한다 —
      // page  = 312×3 + 24×2 + px-7 좌우 28×2 = 1040 (책 카드 3열)
      // stats = 312×2 + gap-3 12 = 636 (통계 카드를 1·2열에 맞춘다)
      maxWidth: { page: '1040px', stats: '636px' },
      height: {
        cover: '240px',
        navbar: '80px',
        'hero-cover': '219px',
        'row-cover': '118px',
        'brief-cover': '230px',
      },
      keyframes: {
        // 싸비 탭 전환(2026-08-25 사용자 요청) — 탭을 바꿀 때 카드가 살짝 아래에서
        // 떠오르며 스치듯 나타나게 한다. key={tab}로 리마운트될 때마다 재생된다.
        'tab-in': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        // 팝업류 등장(2026-08-25 사용자 요청 — "인용 팝오버·선택한 문장 카드가 거칠게
        // 뜬다") — 표준 transform 대신 별개 CSS 프로퍼티인 scale을 쓴다. 이 두 요소는
        // 이미 transform으로 위치를 잡아 두는데(QuotePopover의 -translate-y-full 등),
        // 여기서 transform도 같이 애니메이션하면 그 위치용 transform 값을 덮어써 버린다.
        'pop-in': {
          '0%': { opacity: '0', scale: '.92' },
          '100%': { opacity: '1', scale: '1' },
        },
        // 진도 바 위 아모(2026-08-26, 사용자 요청 — "뛰어가는 느낌"). 가로 중앙 정렬을
        // translateX(-50% ± Npx)로 각 스텝 transform 안에 같이 넣는다 — pop-in과 같은
        // 이유로, 위치용 transform과 애니메이션용 transform이 서로 다른 자리(유틸리티
        // 클래스 vs 키프레임)에 있으면 뒤엣것이 앞엣것을 덮어써 버린다.
        // 3차 조정 — "바 위에서 이끌어가는 느낌 + 더 뛰는 모션"(2026-08-26 재요청)으로
        // 발판 마커를 없애고 아모가 직접 그 지점을 딛게 했다(translateY 기준선 0).
        // 좌우로 calc(-50% ± px) 스텝을 넣어 제자리 통통이 아니라 발걸음처럼 보이게
        // 했다.
        // 4차 조정 — 420ms는 "너무 빠르다"는 재요청으로 720ms로 늦추고, 회전·좌우
        // 스텝 폭도 살짝 줄여 더 차분한 발걸음으로 다듬었다.
        'amo-run': {
          '0%, 100%': { transform: 'translateX(calc(-50% - 2px)) translateY(0) rotate(-9deg)' },
          '25%': { transform: 'translateX(calc(-50% + 1px)) translateY(-6px) rotate(6deg)' },
          '50%': { transform: 'translateX(-50%) translateY(-1px) rotate(9deg)' },
          '75%': { transform: 'translateX(calc(-50% - 1px)) translateY(-6px) rotate(-6deg)' },
        },
      },
      animation: {
        'tab-in': 'tab-in 200ms ease-out',
        'pop-in': 'pop-in 160ms ease-out',
        // 720ms도 "더 느리게"(2026-08-26 재요청)로 1100ms로 더 늦췄다.
        'amo-run': 'amo-run 1100ms ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
