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
 *
 * "N일 만이에요"는 만들지 않는다 — BriefingResponse 에 마지막 방문 시각이 없다 (스펙 §7 #6).
 */
export default function BriefingView({
  briefing,
  chapters,
  title,
  author,
  onContinue,
  onRequestFallback,
  streamedRecap,
  recapFailed,
}: {
  briefing: BriefingResponse;
  chapters: ChapterSummary[];
  title: string;
  author: string;
  onContinue: () => void;
  onRequestFallback: () => void;
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
      <div className="mb-6 flex items-center gap-4">
        <div className="w-24 shrink-0">
          <TypographicCover title={title} author={author} />
        </div>
        <div>
          <h2 className="font-serif text-xl font-bold text-ink">{title}</h2>
          <p className="mt-0.5 text-xs text-muted">{author}</p>
        </div>
      </div>

      <section aria-label="진도" className="mb-6">
        <div className="mb-1.5 flex items-center justify-between text-[11px]">
          <span className="text-muted">{briefing.current_chapter.title}</span>
          <span className="font-bold text-ink">{briefing.progress.percent}%</span>
        </div>
        <ProgressBar percent={briefing.progress.percent} />
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
