import { useEffect, useRef, useState } from 'react';
import type { BriefingResponse, ChapterSummary } from '../../types';
import { resolveBriefingView } from '../../utils/briefingView';
import { EMPTY_RECAP_MESSAGE } from '../../utils/constants';
import { parseRecapParagraphs } from '../../utils/recapText';
import { splitHighlighted } from '../../components/Ssabi/highlightNames';
import ProgressBar from '../../components/Reader/ProgressBar';
import TypographicCover from '../../components/common/TypographicCover';
import { GREETING_LINES, MOCK_DAYS_SINCE_LABEL } from '../../pages/BriefingView';

// FR-BRF-002 FR-BRF-003 FR-SPL-005 🚦 FR-NAV-001
export default function MobileBriefingView({
  briefing,
  chapters,
  title,
  author,
  coverUrl,
  onContinue,
  onRequestFallback,
  onBack,
  onSelectChapter,
  streamedRecap,
  recapFailed,
  recapStreaming,
  characterNames,
}: {
  briefing: BriefingResponse;
  chapters: ChapterSummary[];
  title: string;
  author: string;
  coverUrl: string | null;
  onContinue: () => void;
  onRequestFallback: () => void;
  onBack: () => void;
  onSelectChapter: (startPage: number) => void;
  streamedRecap: string;
  recapFailed: boolean;
  recapStreaming: boolean;
  characterNames: string[];
}) {
  const view = resolveBriefingView(briefing);
  const requested = useRef(false);
  const [tocOpen, setTocOpen] = useState(false);

  // D13 NFR-AI-017
  useEffect(() => {
    if (view.kind !== 'fallback' || requested.current) return;
    requested.current = true;
    onRequestFallback();
  }, [view.kind, onRequestFallback]);

  const recapText = view.kind === 'recap' ? (briefing.recap ?? '') : streamedRecap;

  return (
    <div
      data-testid="mobile-briefing"
      data-mobile="true"
      className="min-h-[100dvh] bg-brief-paper font-dashSans text-brief-ink"
      style={{ paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)' }}
    >
      <main className="px-5 pb-10 pt-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="돌아가기"
          className="flex size-11 items-center justify-center rounded-full border border-brief-line bg-brief-paper text-brief-ink transition-opacity hover:opacity-65"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9.5 4.8 6.5 8 9.5 11.2" />
          </svg>
        </button>

        <div data-testid="brief-rule" className="my-5 h-[2px] w-full rounded-[1px] bg-brief-rule" />

        <div className="flex items-center gap-4">
          <TypographicCover size="brief-compact" title={title} author={author} coverUrl={coverUrl} />
          <div className="min-w-0 flex-1">
            <p className="m-0 text-sm font-bold text-[#555]">{MOCK_DAYS_SINCE_LABEL}</p>
            <h2 className="mt-2 break-keep font-dashSerif text-[22px] font-semibold leading-[1.35] tracking-[-.03em] text-brief-ink">
              {GREETING_LINES.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </h2>
            <p className="mt-2 text-[13px] text-brief-muted">
              {title} · {author}
            </p>
          </div>
        </div>

        <section aria-label="진도" className="mt-6 rounded-brief-panel bg-white p-5 shadow-brief-soft-sm">
          <div className="mb-6 flex items-start justify-between gap-3 text-sm">
            <b className="min-w-0 break-keep font-semibold text-brief-ink">
              제{briefing.current_chapter.chapter_no}장 {briefing.current_chapter.title}
            </b>
            <span className="shrink-0 font-semibold text-[#555]">{briefing.progress.total_pages}쪽</span>
          </div>
          <ProgressBar percent={briefing.progress.percent} tone="brief" size="md" runner />
          <div className="mt-6 text-sm font-semibold text-[#555]">{briefing.progress.percent}%</div>
          <button
            type="button"
            onClick={onContinue}
            className="mt-4 h-12 w-full rounded-full border border-brief-ink bg-transparent text-[15px] font-bold text-brief-ink transition-colors hover:bg-[rgba(31,31,31,0.05)] active:bg-[rgba(31,31,31,0.1)]"
          >
            이어서 읽기
          </button>
        </section>

        <div data-testid="brief-rule" className="my-7 h-[2px] w-full rounded-[1px] bg-brief-rule" />

        <h3 className="mb-3 font-dashSerif text-lg font-semibold tracking-[-.02em] text-brief-ink">
          그동안 이런 이야기였어요
        </h3>
        <div className="rounded-brief-panel bg-white p-5 shadow-brief-soft-sm">
          {view.kind === 'empty' ? (
            <p className="m-0 font-dashSerif text-[15px] leading-[1.85]">{EMPTY_RECAP_MESSAGE}</p>
          ) : null}

          {view.kind === 'fallback' && recapFailed ? (
            <p role="alert" className="m-0 font-dashSerif text-[15px] leading-[1.85]">
              리캡을 불러오지 못했습니다
            </p>
          ) : null}

          {view.kind === 'recap' || (view.kind === 'fallback' && !recapFailed) ? (
            <>
              <span
                aria-hidden="true"
                className="mb-2 block font-dashSerif text-[40px] leading-none text-brief-accent opacity-[.45]"
              >
                “
              </span>
              {parseRecapParagraphs(recapText).map((paragraph, i) => (
                <p
                  key={i}
                  className="whitespace-pre-wrap font-dashSerif text-[15px] leading-[1.85] [&:not(:first-child)]:mt-3"
                >
                  {splitHighlighted(paragraph, characterNames).map((segment, j) =>
                    segment.bold ? (
                      <b key={j} className="font-bold">
                        {segment.text}
                      </b>
                    ) : (
                      segment.text
                    )
                  )}
                </p>
              ))}
              {view.kind === 'fallback' && recapStreaming ? (
                <span aria-live="polite" className="mt-3 block text-[12px] text-brief-muted">
                  불러오는 중
                </span>
              ) : (
                <span
                  aria-hidden="true"
                  className="mt-2 block text-right font-dashSerif text-[40px] leading-none text-brief-accent opacity-[.45]"
                >
                  ”
                </span>
              )}
            </>
          ) : null}
        </div>

        <div data-testid="brief-rule" className="my-7 h-[2px] w-full rounded-[1px] bg-brief-rule" />

        <button
          type="button"
          aria-expanded={tocOpen}
          aria-controls="mobileTocPanel"
          onClick={() => setTocOpen((open) => !open)}
          className="flex min-h-12 w-full items-center justify-between rounded-lg"
        >
          <h3 className="m-0 font-dashSerif text-lg font-semibold tracking-[-.02em] text-brief-ink">목차</h3>
          <span className="flex size-9 items-center justify-center rounded-full bg-white shadow-brief-soft-sm">
            <span
              aria-hidden="true"
              className={`block text-[17px] leading-none transition-transform duration-200 ${tocOpen ? 'rotate-180' : ''}`}
            >
              ▾
            </span>
          </span>
        </button>

        <div
          id="mobileTocPanel"
          className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
            tocOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          }`}
        >
          <div className="overflow-hidden">
            <ul aria-label="목차" className="flex flex-col gap-2 pt-3">
              {chapters.map((chapter) => {
                const isNow = chapter.chapter_no === briefing.current_chapter.chapter_no;
                return (
                  <li key={chapter.chapter_no}>
                    <button
                      type="button"
                      aria-current={isNow ? 'true' : undefined}
                      tabIndex={tocOpen ? 0 : -1}
                      onClick={() => onSelectChapter(chapter.start_page)}
                      className={`group flex min-h-12 w-full items-center gap-3 rounded-brief-card px-4 py-2.5 text-left shadow-[0_1px_2px_rgba(42,38,32,0.05)] transition-[background-color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brief-accent/40 focus-visible:ring-offset-2 ${
                        isNow
                          ? 'bg-brief-accent-soft shadow-brief-soft-sm'
                          : 'bg-white hover:translate-x-0.5 hover:bg-brief-accent/10 hover:shadow-brief-soft-sm'
                      }`}
                    >
                      <span
                        className={`flex size-[26px] shrink-0 items-center justify-center rounded-full font-dashMono text-xs font-semibold ${
                          isNow
                            ? 'bg-brief-accent text-white'
                            : 'bg-brief-paper text-brief-muted transition-colors group-hover:bg-white group-hover:text-brief-accent'
                        }`}
                      >
                        {chapter.chapter_no}
                      </span>
                      <span
                        className={`min-w-0 flex-1 break-keep text-[15px] ${
                          isNow ? 'font-semibold text-brief-accent' : 'text-brief-ink transition-colors group-hover:text-brief-accent'
                        }`}
                      >
                        {chapter.title}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}
