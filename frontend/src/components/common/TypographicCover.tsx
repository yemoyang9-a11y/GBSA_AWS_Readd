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
}: {
  title: string;
  author: string;
  coverUrl?: string | null;
}) {
  if (coverUrl) {
    return (
      <img
        src={coverUrl}
        alt={`${title} 표지`}
        className="h-cover w-full rounded-cover object-cover"
      />
    );
  }

  return (
    <div
      className="flex h-cover w-full flex-col items-center justify-center gap-3 rounded-cover border border-line bg-canvas px-6 text-center"
      data-testid="typographic-cover"
      aria-hidden="true"
    >
      <span className="font-serif text-2xl font-bold leading-snug text-ink">{title}</span>
      <span className="h-px w-8 bg-line" />
      <span className="font-sans text-xs text-muted">{author}</span>
    </div>
  );
}
