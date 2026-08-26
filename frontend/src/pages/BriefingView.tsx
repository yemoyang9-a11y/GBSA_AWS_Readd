import { useEffect, useRef, useState } from 'react';
import type { BriefingResponse, ChapterSummary } from '../types';
import { resolveBriefingView } from '../utils/briefingView';
import { EMPTY_RECAP_MESSAGE } from '../utils/constants';
import { parseRecapParagraphs } from '../utils/recapText';
import { splitHighlighted } from '../components/Ssabi/highlightNames';
import ProgressBar from '../components/Reader/ProgressBar';
import TypographicCover from '../components/common/TypographicCover';

/**
 * 브리핑 화면 — S6 (FR-BRF-002~005, D12, D13 ①) — 재설계 2026-08-23
 *
 * 분기 판정은 utils/briefingView 가 한다 — 첫 진입(cutoff = 0)과 저장분 부재(recap: null)를
 * 같은 분기로 묶으면 첫 진입에서 LLM 이 호출된다 (자가 검증 20·21번).
 * '이어서 읽기'는 리캡 상태와 무관하게 항상 동작한다 (UC-28 E1, FR-SPL-005 🚦).
 *
 * ⚠️ 목차 이동 (2026-08-26, 사용자 결정 — FR-BRF-004·D12 뒤집음)
 *    원래 이 목차는 표시 전용이었다. 이동하면 진도가 갱신되어 방금 띄운 리캡이 무효가 되고
 *    (R8 — 저장 리캡은 기준점이 정확히 일치할 때만 재사용), 다음 브리핑 진입에서 LLM으로
 *    다시 만들어야 하기 때문이다. 그 비용을 알고도 추가하기로 했다 — 읽기 화면 목차로 장을
 *    건너뛰어도 똑같이 무효화되므로 원래 규칙의 보호 효과가 이미 부분적이었다.
 *    동작·스타일은 읽기 화면 목차(components/Reader/TocPanel.tsx)와 같은 것을 쓴다.
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
  onSelectChapter,
  streamedRecap,
  recapFailed,
  recapStreaming = false,
  characterNames = [],
}: {
  briefing: BriefingResponse;
  chapters: ChapterSummary[];
  title: string;
  author: string;
  coverUrl?: string | null;
  onContinue: () => void;
  onRequestFallback: () => void;
  onBack: () => void;
  /** 장을 고르면 그 장의 start_page로 읽기 화면을 연다 — 서버가 준 값을 그대로 넘긴다 */
  onSelectChapter: (startPage: number) => void;
  streamedRecap?: string;
  recapFailed?: boolean;
  /** 폴백(실시간 생성) 스트림이 아직 진행 중인지 — RecapTab과 같은 "불러오는 중" 표시에 쓴다 */
  recapStreaming?: boolean;
  /** 리캡 인물명 강조(RecapTab.tsx와 동일) — 이미 K 이하로 걸러진 /ssabi/graph 이름 목록 */
  characterNames?: string[];
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
    <div className="min-h-screen bg-brief-paper">
    <main className="mx-auto max-w-[760px] px-[38px] py-8 font-dashSans text-brief-ink">
      <button
        type="button"
        onClick={onBack}
        aria-label="돌아가기"
        className="flex size-9 items-center justify-center rounded-full border border-brief-line bg-brief-paper text-brief-ink transition-opacity hover:opacity-65"
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

      <div className="my-5 h-[2px] w-full rounded-[1px] bg-brief-rule" />

      <div className="flex items-start gap-[30px]">
        <TypographicCover size="brief" title={title} author={author} coverUrl={coverUrl} />
        <div>
          {/* 2026-08-26, 사용자 요청 — 초록 액센트 대신 대시보드와 같은 회색(#555)으로 */}
          <p className="m-0 font-dashSans text-base font-bold text-[#555]">
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
          {/* 2026-08-26, 사용자 요청 — 위 날짜 라벨·아래 퍼센트와 같은 회색으로 */}
          <span className="font-semibold text-[#555]">
            {briefing.progress.total_pages}쪽
          </span>
        </div>
        {/* 2026-08-26, 사용자 요청 — 진도 바 위에서 아모가 뛰어가는 느낌 */}
        <ProgressBar percent={briefing.progress.percent} tone="brief" size="md" runner />
        {/* 퍼센트 — 좌하단, 바로 아래(2026-08-25, 사용자 요청. 예전엔 우상단에 있었다).
            색은 대시보드 히어로의 "N% 완료"(ContinueReadingHero.tsx, text-[#555])와
            맞췄다(2026-08-26, 사용자 요청 — 브리핑만 초록으로 튀어 보인다고 함). */}
        <div className="mt-2 font-dashSans text-sm font-semibold text-[#555]">
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
        중복이라 가져오지 않았다. 인물 이름 강조(RecapTab의 characterNames, highlightNames.ts)는
        처음엔 이 화면에 해당 데이터가 없어 범위에서 뺐으나(사용자 요청, 2026-08-25),
        Briefing.tsx가 /ssabi/graph를 별도로 1회 조회해 characterNames prop으로 내려주는
        방식으로 추가했다 — 조회는 RecapTab과 마찬가지로 이미 K 이하로 걸러진 응답이라
        여기서 새로 판별하지 않는다(types/ssabi.ts:3).
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
        aria-hidden 을 두지 않는다 — 걸면 접힌 동안 스크린리더 접근성 트리 전체에서 사라져
        getByRole('list') 로도 못 찾게 된다(자가 검증 23 테스트가 그 사정을 모른 채 항상
        찾을 수 있다고 가정한다). 접힌 목차의 이동 버튼이 키보드 포커스를 먹는 문제는
        각 버튼의 tabIndex 로 따로 막는다(아래) — 목차에 이동 요소가 생긴 뒤로는
        "인터랙티브 요소 0개라 안전하다"는 예전 전제가 더 이상 성립하지 않는다.

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
          {/* 장을 누르면 그 장의 start_page로 읽기 화면을 연다 (2026-08-26 — 위 ⚠️ 주석).
              hover·focus 처리는 읽기 화면 목차(TocPanel.tsx)와 같은 것을 쓰고, 카드 형태만
              이 화면의 것을 유지한다. */}
          <ul aria-label="목차" className="flex flex-col gap-2.5 pt-0.5">
            {chapters.map((chapter) => {
              const isNow = chapter.chapter_no === briefing.current_chapter.chapter_no;
              return (
                <li key={chapter.chapter_no}>
                  <button
                    type="button"
                    aria-current={isNow ? 'true' : undefined}
                    // 접힌 동안에는 탭 순서에서 뺀다 — 시각적으로만 숨겨져 있어(grid-rows-[0fr])
                    // 그대로 두면 보이지 않는 버튼에 키보드 포커스가 걸린다. React 18이라
                    // inert를 못 써서 tabIndex로 처리한다. 토글 버튼의 aria-expanded·
                    // aria-controls가 접힘 상태 자체는 이미 알려 준다.
                    tabIndex={tocOpen ? 0 : -1}
                    onClick={() => onSelectChapter(chapter.start_page)}
                    className={`group flex w-full items-center gap-3.5 rounded-brief-card px-[18px] py-3.5 text-left shadow-[0_1px_2px_rgba(42,38,32,0.05)] transition-[background-color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brief-accent/40 focus-visible:ring-offset-2 ${
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
                      className={`font-dashSans text-[14.5px] ${
                        isNow
                          ? 'font-semibold text-brief-accent'
                          : 'text-brief-ink transition-colors group-hover:text-brief-accent'
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
