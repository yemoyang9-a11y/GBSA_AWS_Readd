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
          accent: '#4b3fd6',
          'accent-soft': '#f1effc',
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
    },
  },
  plugins: [],
};
