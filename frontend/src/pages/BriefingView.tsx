import { useEffect, useRef, useState } from 'react';
import type { BriefingResponse, ChapterSummary } from '../types';
import { resolveBriefingView } from '../utils/briefingView';
import { EMPTY_RECAP_MESSAGE } from '../utils/constants';
import { parseRecapParagraphs } from '../utils/recapText';
import ProgressBar from '../components/Reader/ProgressBar';
import TypographicCover from '../components/common/TypographicCover';

/**
 * 브리핑 화면 — S6 (FR-BRF-002~005, D12, D13 ①) — 재설계 2026-08-23
 *
 * 분기 판정은 utils/briefingView 가 한다 — 첫 진입(cutoff = 0)과 저장분 부재(recap: null)를
 * 같은 분기로 묶으면 첫 진입에서 LLM 이 호출된다 (자가 검증 20·21번).
 * 목차는 표시 전용이라 이동 요소를 만들지 않는다 (FR-BRF-004, D12) — 읽기 화면의 목차만
 * 이동 가능하다. '이어서 읽기'는 리캡 상태와 무관하게 항상 동작한다 (UC-28 E1, FR-SPL-005 🚦).
 */

/**
 * TODO(mock): 마지막 방문 시각을 주는 엔드포인트가 없어 고정값이다.
 *   `BriefingResponse` 에 마지막 방문 시각 필드가 생기면 그 값으로 계산해 교체한다.
 *   사용자 결정(2026-08-20): 시안의 자리를 만들어 두고 지금은 mock 으로 채운다.
 */
const MOCK_DAYS_SINCE_LABEL = '3일 만이에요';

const GREETING_LINES = ['다시 오셨네요.', '여기서부터 기억을 맞춰볼게요.'];

export default function BriefingView({
  briefing,
  chapters,
  title,
  author,
  coverUrl,
  onContinue,
  onRequestFallback,
  onBack,
  streamedRecap,
  recapFailed,
  recapStreaming = false,
}: {
  briefing: BriefingResponse;
  chapters: ChapterSummary[];
  title: string;
  author: string;
  coverUrl?: string | null;
  onContinue: () => void;
  onRequestFallback: () => void;
  onBack: () => void;
  streamedRecap?: string;
  recapFailed?: boolean;
  /** 폴백(실시간 생성) 스트림이 아직 진행 중인지 — RecapTab과 같은 "불러오는 중" 표시에 쓴다 */
  recapStreaming?: boolean;
}) {
  const view = resolveBriefingView(briefing);
  const requested = useRef(false);
  const [tocOpen, setTocOpen] = useState(false);

  useEffect(() => {
    // 첫 진입(empty)에서는 호출하지 않는다 — 이 화면의 LLM 호출 0회 조건 (D13 ①)
    if (view.kind !== 'fallback' || requested.current) return;

    // 화면당 1회로 고정한다. 스트리밍이 들어오며 다시 그려질 때 재호출되면 그대로 LLM
    // 재호출이고, 디바이스·도서당 분당 3회 상한에 걸린다 (NFR-AI-017).
    requested.current = true;
    onRequestFallback();
  }, [view.kind, onRequestFallback]);

  return (
    <main className="mx-auto max-w-[760px] bg-brief-paper px-[38px] py-8 font-dashSans text-brief-ink">
      <button
        type="button"
        onClick={onBack}
        aria-label="돌아가기"
        className="flex size-9 items-center justify-center rounded-full border border-brief-line bg-brief-paper text-brief-ink transition-opacity hover:opacity-65"
      >
        <span aria-hidden="true" className="text-base">
          ‹
        </span>
      </button>

      <div className="my-5 h-[2px] w-full rounded-[1px] bg-brief-rule" />

      <div className="flex items-start gap-[30px]">
        <TypographicCover size="brief" title={title} author={author} coverUrl={coverUrl} />
        <div>
          <p className="m-0 font-dashSans text-base font-bold text-brief-accent">
            {MOCK_DAYS_SINCE_LABEL}
          </p>
          <h2 className="mt-3 font-dashSerif text-[28px] font-semibold leading-[1.35] tracking-[-.03em] text-brief-ink">
            {GREETING_LINES.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </h2>
          <p className="mt-3.5 font-dashSans text-sm text-brief-muted">
            {title} · {author}
          </p>
        </div>
      </div>

      <section
        aria-label="진도"
        className="mt-6 rounded-brief-panel bg-white p-5 shadow-brief-soft-sm"
      >
        <div className="mb-3 flex items-center justify-between font-dashSans text-sm">
          <b className="font-semibold text-brief-ink">{briefing.current_chapter.title}</b>
          {/* 전체 페이지 수 — 우상단(2026-08-25, 사용자 요청. 대시보드 히어로와 같은
              정보를 보여주되, 이 화면은 챕터 제목이 이미 좌상단을 쓰고 있어 퍼센트를
              바 아래로 내리고 이 자리를 전체 페이지 수로 채웠다). briefing.progress에
              total_pages가 이미 있어(API_CONTRACT, 서버 계산값) 그대로 쓴다 — 대시보드와
              달리 여기는 계약에서 뺀 적이 없는 필드다. */}
          <span className="font-semibold text-brief-accent">
            {briefing.progress.total_pages}쪽
          </span>
        </div>
        <ProgressBar percent={briefing.progress.percent} tone="brief" size="md" />
        {/* 퍼센트 — 좌하단, 바로 아래(2026-08-25, 사용자 요청. 예전엔 우상단에 있었다) */}
        <div className="mt-2 font-dashSans text-sm font-semibold text-brief-accent">
          {briefing.progress.percent}%
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onContinue}
            className="rounded-full border border-brief-ink bg-transparent px-3.5 py-2 font-dashSans text-xs font-bold text-brief-ink transition-colors hover:bg-[rgba(31,31,31,0.05)] active:bg-[rgba(31,31,31,0.1)]"
          >
            이어서 읽기
          </button>
        </div>
      </section>

      <div className="my-7 h-[2px] w-full rounded-[1px] bg-brief-rule" />

      <h3 className="mb-3.5 font-dashSerif text-lg font-semibold tracking-[-.02em] text-brief-ink">
        그동안 이런 이야기였어요
      </h3>
      {/*
        읽기 화면 리캡 탭(RecapTab.tsx)과 같은 형식으로 통일했다(2026-08-25, 사용자 요청) —
        세리프 폰트·문단 분리·장식용 인용부호. "그동안 이런 이야기였어요" h3가 이미 이
        섹션의 라벨 역할을 하므로 RecapTab의 작은 eyebrow 라벨("이전 이야기 요약")은
        중복이라 가져오지 않았다. 인물 이름 강조(RecapTab의 characterNames)도 이 화면엔
        해당 데이터(인물 관계도 조회) 자체가 없어 이번 범위에서 뺐다 — 필요하면 별도로
        조회를 추가해야 한다.
      */}
      <div className="rounded-brief-panel bg-white p-6 shadow-brief-soft-sm">
        {view.kind === 'empty' ? (
          <p className="m-0 font-dashSerif text-[15px] leading-[1.85] text-brief-ink">
            {EMPTY_RECAP_MESSAGE}
          </p>
        ) : null}

        {view.kind === 'fallback' && recapFailed ? (
          <p role="alert" className="m-0 font-dashSerif text-[15px] leading-[1.85] text-brief-ink">
            리캡을 불러오지 못했습니다
          </p>
        ) : null}

        {view.kind === 'recap' || (view.kind === 'fallback' && !recapFailed) ? (
          <>
            <span
              aria-hidden="true"
              className="mb-4 block font-dashSerif text-[52px] leading-none text-brief-accent opacity-[.45]"
            >
              “
            </span>
            {parseRecapParagraphs(
              view.kind === 'recap' ? (briefing.recap ?? '') : (streamedRecap ?? '')
            ).map((paragraph, i) => (
              <p
                key={i}
                className="whitespace-pre-wrap font-dashSerif text-[15px] leading-[1.85] text-brief-ink [&:not(:first-child)]:mt-3"
              >
                {paragraph}
              </p>
            ))}
            {view.kind === 'fallback' && recapStreaming ? (
              <span aria-live="polite" className="mt-3 block text-[11px] text-brief-muted">
                불러오는 중
              </span>
            ) : (
              <span
                aria-hidden="true"
                className="mt-4 block text-right font-dashSerif text-[52px] leading-none text-brief-accent opacity-[.45]"
              >
                ”
              </span>
            )}
          </>
        ) : null}
      </div>

      <div className="my-7 h-[2px] w-full rounded-[1px] bg-brief-rule" />

      <button
        type="button"
        id="tocToggle"
        aria-expanded={tocOpen}
        aria-controls="tocPanel"
        onClick={() => setTocOpen((open) => !open)}
        className="mb-3.5 flex w-full items-center justify-between rounded-lg py-4"
      >
        <h3 className="m-0 font-dashSerif text-lg font-semibold tracking-[-.02em] text-brief-ink">
          목차
        </h3>
        <span className="flex size-9 items-center justify-center rounded-full bg-white shadow-brief-soft-sm">
          <span
            aria-hidden="true"
            className={`block text-[17px] leading-none text-brief-ink transition-transform duration-200 ${tocOpen ? 'rotate-180' : ''}`}
          >
            ▾
          </span>
        </span>
      </button>

      {/*
        aria-hidden 을 두지 않는다 — 목차는 인터랙티브 요소가 0개라(FR-BRF-004) 접혔을 때
        포커스가 걸리는 위험이 없다. aria-hidden 을 걸면 접힌 동안 스크린리더 접근성 트리
        전체에서 사라져 getByRole('list') 로도 못 찾게 된다(자가 검증 23 테스트가 그 사정을
        모른 채 항상 찾을 수 있다고 가정한다). 시각적 숨김(grid-rows-[0fr])만으로 충분하다.

        max-height 상한을 추측하는 방식(예: max-h-[1000px])은 쓰지 않는다 — 실제 장이 많은
        책(탁류 19장)에서 목록 총높이가 상한을 넘어 마지막 항목이 잘렸다(2026-08-23 실측
        발견). `grid-template-rows: 0fr ↔ 1fr` 트랜지션은 콘텐츠의 실제 높이에 항상 맞으므로
        장 수와 무관하게 안전하다.
      */}
      <div
        id="tocPanel"
        data-testid="toc-panel"
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
          tocOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          {/* 표시 전용 목차 — 이동 요소(a·button)를 만들지 않는다 (FR-BRF-004, D12) */}
          <ul aria-label="목차" className="flex flex-col gap-2.5 pt-0.5">
            {chapters.map((chapter) => {
              const isNow = chapter.chapter_no === briefing.current_chapter.chapter_no;
              return (
                <li
                  key={chapter.chapter_no}
                  aria-current={isNow ? 'true' : undefined}
                  className={`flex items-center gap-3.5 rounded-brief-card px-[18px] py-3.5 shadow-[0_1px_2px_rgba(42,38,32,0.05)] ${
                    isNow ? 'bg-brief-accent-soft shadow-brief-soft-sm' : 'bg-white'
                  }`}
                >
                  <span
                    className={`flex size-[26px] shrink-0 items-center justify-center rounded-full font-dashMono text-xs font-semibold ${
                      isNow ? 'bg-brief-accent text-white' : 'bg-brief-paper text-brief-muted'
                    }`}
                  >
                    {chapter.chapter_no}
                  </span>
                  <span
                    className={`font-dashSans text-[14.5px] ${isNow ? 'font-semibold text-brief-accent' : 'text-brief-ink'}`}
                  >
                    {chapter.title}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </main>
  );
}
