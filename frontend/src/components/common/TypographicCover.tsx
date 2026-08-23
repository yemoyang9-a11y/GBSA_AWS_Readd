/**
 * 표지 자리 — 시안의 book-cover 영역
 *
 * 「탁류」는 1937년 공개도메인 작품이라 정본 표지가 없고, mock fixture 와 R1 파이프라인
 * 모두 cover_url 을 채우지 않는다. 이미지가 없을 때 빈 사각형을 두는 대신 제목·저자를
 * 명조로 조판해 표지 구실을 하게 한다 (스펙 §7 #4).
 *
 * cover_url 이 채워지면 별도 수정 없이 이미지로 전환된다.
 *
 * size: 'card'(기존, 240px, 8px 모서리) · 'hero'(대시보드 재설계 히어로, 219px, 모서리 없음)
 * · 'row'(대시보드 재설계 목록 행, 84×118px, 모서리 없음). hero/row는 2026-08-23 시안이
 * 확정한 대시보드 전용 dash-* 톤을 쓴다.
 */
export default function TypographicCover({
  title,
  author,
  coverUrl,
  dimmed = false,
  size = 'card',
}: {
  title: string;
  author: string;
  coverUrl?: string | null;
  /**
   * 아직 열 수 없는 도서의 표지를 죽인다. 흐리게 하는 건 **표지뿐**이고 제목·저자 글자는
   * 건드리지 않는다 — 카드 전체에 opacity 를 걸면 본문 글자의 명도 대비까지 같이 떨어진다.
   */
  dimmed?: boolean;
  size?: 'card' | 'hero' | 'row';
}) {
  const dim = dimmed ? ' opacity-60' : '';
  const isDash = size !== 'card';
  const heightClass = size === 'hero' ? 'h-hero-cover' : size === 'row' ? 'h-row-cover' : 'h-cover';
  const widthClass = size === 'row' ? 'w-row-cover flex-none' : 'w-full';
  const roundedClass = size === 'card' ? ' rounded-cover' : '';
  const titleFont = isDash ? 'font-dashSerif' : 'font-serif';
  const titleSize = size === 'row' ? 'text-xs' : size === 'hero' ? 'text-xl' : 'text-2xl';
  const authorFont = isDash ? 'font-dashSans' : 'font-sans';
  const borderColor = isDash ? 'border-dash-line' : 'border-line';
  const bgColor = isDash ? 'bg-dash-paper' : 'bg-canvas';

  if (coverUrl) {
    return (
      <img
        src={coverUrl}
        alt={`${title} 표지`}
        className={`${heightClass} ${widthClass}${roundedClass} object-cover${dim}`}
      />
    );
  }

  return (
    <div
      className={`flex ${heightClass} ${widthClass} flex-col items-center justify-center gap-3${roundedClass} border ${borderColor} ${bgColor} px-6 text-center${dim}`}
      data-testid="typographic-cover"
      aria-hidden="true"
    >
      <span className={`${titleFont} ${titleSize} font-bold leading-snug text-ink`}>{title}</span>
      <span className="h-px w-8 bg-line" />
      <span className={`${authorFont} text-xs text-muted`}>{author}</span>
    </div>
  );
}
