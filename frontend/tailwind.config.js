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
      },
      fontFamily: {
        serif: ['"Nanum Myeongjo"', 'serif'],
        sans: ['"Gothic A1"', 'system-ui', 'sans-serif'],
        dashSerif: ['"Noto Serif KR"', 'serif'],
        dashSans: ['Pretendard', 'system-ui', 'sans-serif'],
        dashMono: ['"DM Mono"', 'monospace'],
      },
      borderRadius: { card: '16px', cover: '8px', pill: '20px' },
      boxShadow: { card: '0 8px 8px rgba(28, 27, 26, 0.03)' },
      spacing: { card: '18px', gutter: '24px' },
      width: { 'book-card': '312px', 'row-cover': '84px' },
      // 페이지 폭. 시안은 고정 프레임이라 넓은 화면에서의 상한을 정하지 않았다.
      // 책 카드 312px + 간격 24px 그리드에서 유도한다 —
      // page  = 312×3 + 24×2 + px-7 좌우 28×2 = 1040 (책 카드 3열)
      // stats = 312×2 + gap-3 12 = 636 (통계 카드를 1·2열에 맞춘다)
      maxWidth: { page: '1040px', stats: '636px' },
      height: { cover: '240px', navbar: '80px', 'hero-cover': '219px', 'row-cover': '118px' },
    },
  },
  plugins: [],
};
