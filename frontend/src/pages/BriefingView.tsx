import { useEffect } from 'react';
import type { BriefingResponse, ChapterSummary } from '../types';
import { resolveBriefingView } from '../utils/briefingView';
import { EMPTY_RECAP_MESSAGE } from '../utils/constants';
import ProgressBar from '../components/Reader/ProgressBar';

/**
 * 브리핑 화면 — S6 (FR-BRF-002~005, D12, D13 ①)
 *
 * 분기 판정은 utils/briefingView 가 한다 — 첫 진입(cutoff = 0)과 저장분 부재(recap: null)를
 * 같은 분기로 묶으면 첫 진입에서 LLM 이 호출된다 (자가 검증 20·21번).
 * 목차는 표시 전용이라 이동 요소를 만들지 않는다 (FR-BRF-004, D12) — 읽기 화면의 목차만
 * 이동 가능하다. '마저 읽기'는 리캡 상태와 무관하게 항상 동작한다 (UC-28 E1, FR-SPL-005 🚦).
 */
export default function BriefingView({
  briefing,
  chapters,
  onContinue,
  onRequestFallback,
  streamedRecap,
  recapFailed,
}: {
  briefing: BriefingResponse;
  chapters: ChapterSummary[];
  onContinue: () => void;
  onRequestFallback: () => void;
  streamedRecap?: string;
  recapFailed?: boolean;
}) {
  const view = resolveBriefingView(briefing);

  useEffect(() => {
    if (view.kind === 'fallback') onRequestFallback();
    // 첫 진입(empty)에서는 호출하지 않는다 — 이 화면의 LLM 호출 0회 조건 (D13 ①)
  }, [view.kind, onRequestFallback]);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <section aria-label="리캡">
        {view.kind === 'empty' ? <p>{EMPTY_RECAP_MESSAGE}</p> : null}
        {view.kind === 'recap' ? <p>{briefing.recap}</p> : null}
        {view.kind === 'fallback' ? (
          <p>{recapFailed ? '리캡을 불러오지 못했습니다' : (streamedRecap ?? '')}</p>
        ) : null}
      </section>

      <section aria-label="진도">
        <ProgressBar percent={briefing.progress.percent} />
      </section>

      {/* 표시 전용 목차 — 이동 요소(a·button)를 만들지 않는다 (FR-BRF-004, D12) */}
      <ul aria-label="목차">
        {chapters.map((chapter) => (
          <li
            key={chapter.chapter_no}
            aria-current={
              chapter.chapter_no === briefing.current_chapter.chapter_no ? 'true' : undefined
            }
          >
            {chapter.title}
          </li>
        ))}
      </ul>

      <button type="button" onClick={onContinue}>
        마저 읽기
      </button>
    </main>
  );
}
