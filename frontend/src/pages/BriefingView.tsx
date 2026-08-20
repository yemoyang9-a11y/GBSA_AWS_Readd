import { useEffect, useRef } from 'react';
import type { BriefingResponse, ChapterSummary } from '../types';
import { resolveBriefingView } from '../utils/briefingView';
import { EMPTY_RECAP_MESSAGE } from '../utils/constants';
import ProgressBar from '../components/Reader/ProgressBar';
import TypographicCover from '../components/common/TypographicCover';
import Button from '../components/common/Button';

/**
 * 브리핑 화면 — S6 (FR-BRF-002~005, D12, D13 ①)
 *
 * 분기 판정은 utils/briefingView 가 한다 — 첫 진입(cutoff = 0)과 저장분 부재(recap: null)를
 * 같은 분기로 묶으면 첫 진입에서 LLM 이 호출된다 (자가 검증 20·21번).
 * 목차는 표시 전용이라 이동 요소를 만들지 않는다 (FR-BRF-004, D12) — 읽기 화면의 목차만
 * 이동 가능하다. '마저 읽기'는 리캡 상태와 무관하게 항상 동작한다 (UC-28 E1, FR-SPL-005 🚦).
 */

/**
 * TODO(mock): 마지막 방문 시각을 주는 엔드포인트가 없어 고정값이다.
 *   `BriefingResponse` 에 마지막 방문 시각 필드가 생기면 그 값으로 계산해 교체한다.
 *   사용자 결정(2026-08-20): 시안의 자리를 만들어 두고 지금은 mock 으로 채운다.
 *   스펙 §7 의 계약 불일치 6번 항목이 "만들지 않는다"에서 이 처리로 바뀐 것이다.
 */
const MOCK_DAYS_SINCE_LABEL = '3일 만이에요';

const GREETING_LINES = ['다시 오셨네요.', '여기서부터 기억을 맞춰볼게요.'];

export default function BriefingView({
  briefing,
  chapters,
  title,
  author,
  onContinue,
  onRequestFallback,
  onBack,
  streamedRecap,
  recapFailed,
}: {
  briefing: BriefingResponse;
  chapters: ChapterSummary[];
  title: string;
  author: string;
  onContinue: () => void;
  onRequestFallback: () => void;
  onBack: () => void;
  streamedRecap?: string;
  recapFailed?: boolean;
}) {
  const view = resolveBriefingView(briefing);
  const requested = useRef(false);

  useEffect(() => {
    // 첫 진입(empty)에서는 호출하지 않는다 — 이 화면의 LLM 호출 0회 조건 (D13 ①)
    if (view.kind !== 'fallback' || requested.current) return;

    // 화면당 1회로 고정한다. 스트리밍이 들어오며 다시 그려질 때 재호출되면 그대로 LLM
    // 재호출이고, 디바이스·도서당 분당 3회 상한에 걸린다 (NFR-AI-017).
    requested.current = true;
    onRequestFallback();
  }, [view.kind, onRequestFallback]);

  return (
    <main className="mx-auto max-w-3xl bg-canvas px-7 py-6">
      <div className="mb-6 border-b border-line pb-4">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-ink transition-opacity hover:opacity-60"
        >
          <span aria-hidden="true">‹</span>
          돌아가기
        </button>
      </div>

      <div className="mb-6 flex items-start gap-8">
        <div className="w-24 shrink-0">
          <TypographicCover title={title} author={author} />
        </div>
        <div className="pt-2">
          <p className="text-[13px] font-bold text-accent">{MOCK_DAYS_SINCE_LABEL}</p>
          <h2 className="mt-2 font-serif text-2xl font-bold leading-snug text-ink">
            {GREETING_LINES.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </h2>
          <p className="mt-3 text-[13px] text-muted">
            {title} · {author}
          </p>
        </div>
      </div>

      <section
        aria-label="진도"
        className="mb-6 rounded-card border border-line bg-surface px-6 py-5"
      >
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-sm font-bold text-ink">{briefing.current_chapter.title}</span>
          <span className="text-sm font-bold text-accent">{briefing.progress.percent}%</span>
        </div>
        <ProgressBar percent={briefing.progress.percent} tone="accent" />
      </section>

      <section aria-label="리캡" className="mb-6">
        <h3 className="mb-3 font-serif text-base font-bold text-ink">그동안 이런 이야기였어요</h3>
        <div className="rounded-card border border-line bg-surface p-6 text-sm leading-relaxed text-muted">
          {view.kind === 'empty' ? <p>{EMPTY_RECAP_MESSAGE}</p> : null}
          {view.kind === 'recap' ? <p>{briefing.recap}</p> : null}
          {view.kind === 'fallback' ? (
            <p>{recapFailed ? '리캡을 불러오지 못했습니다' : (streamedRecap ?? '')}</p>
          ) : null}
        </div>
      </section>

      <section className="mb-6">
        <h3 className="mb-3 font-serif text-base font-bold text-ink">목차</h3>
        {/* 표시 전용 목차 — 이동 요소(a·button)를 만들지 않는다 (FR-BRF-004, D12) */}
        <ul aria-label="목차" className="flex flex-col gap-2">
          {chapters.map((chapter) => (
            <li
              key={chapter.chapter_no}
              aria-current={
                chapter.chapter_no === briefing.current_chapter.chapter_no ? 'true' : undefined
              }
              className="flex items-center gap-3 rounded-card border border-line bg-surface px-5 py-4"
            >
              <span className="flex size-7 items-center justify-center rounded-full bg-canvas font-serif text-xs text-accent">
                {chapter.chapter_no}
              </span>
              <span className="text-sm text-ink">{chapter.title}</span>
            </li>
          ))}
        </ul>
      </section>

      <Button variant="solid" onClick={onContinue}>
        마저 읽기
      </Button>
    </main>
  );
}
