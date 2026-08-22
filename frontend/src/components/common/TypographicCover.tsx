/**
 * 표지 자리 — 시안의 book-cover 영역 (높이 240px, 모서리 8px)
 *
 * 「탁류」는 1937년 공개도메인 작품이라 정본 표지가 없고, mock fixture 와 R1 파이프라인
 * 모두 cover_url 을 채우지 않는다. 이미지가 없을 때 빈 사각형을 두는 대신 제목·저자를
 * 명조로 조판해 표지 구실을 하게 한다 (스펙 §7 #4).
 *
 * cover_url 이 채워지면 별도 수정 없이 이미지로 전환된다.
 */
export default function TypographicCover({
  title,
  author,
  coverUrl,
  dimmed = false,
}: {
  title: string;
  author: string;
  coverUrl?: string | null;
  /**
   * 아직 열 수 없는 도서의 표지를 죽인다. 흐리게 하는 건 **표지뿐**이고 제목·저자 글자는
   * 건드리지 않는다 — 카드 전체에 opacity 를 걸면 본문 글자의 명도 대비까지 같이 떨어진다.
   */
  dimmed?: boolean;
}) {
  const dim = dimmed ? ' opacity-60' : '';

  if (coverUrl) {
    return (
      <img
        src={coverUrl}
        alt={`${title} 표지`}
        className={`h-cover w-full rounded-cover object-cover${dim}`}
      />
    );
  }

  return (
    <div
      className={`flex h-cover w-full flex-col items-center justify-center gap-3 rounded-cover border border-line bg-canvas px-6 text-center${dim}`}
      data-testid="typographic-cover"
      aria-hidden="true"
    >
      <span className="font-serif text-2xl font-bold leading-snug text-ink">{title}</span>
      <span className="h-px w-8 bg-line" />
      <span className="font-sans text-xs text-muted">{author}</span>
    </div>
  );
}
