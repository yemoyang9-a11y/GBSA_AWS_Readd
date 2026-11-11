import { useEffect, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ssabiFace from '../assets/images/ssabi-face.png';
import BookCover from '../components/common/BookCover';
import ChapterList from '../components/BookDetail/ChapterList';
import ProgressBar from '../components/Reader/ProgressBar';
import { useBookDetail, type BookDetail as BookDetailState } from '../hooks/useBookDetail';
import { useBookPosition } from '../hooks/useBookPosition';
import { useEnterBook } from '../hooks/useEnterBook';
import { clearPendingJump, setPendingJump } from '../utils/pendingJump';
import { resumeLabel } from '../utils/resumeLabel';
import { APP_ROUTES } from '../utils/routes';
import type { PositionResponse } from '../services/positionService';
import type { ChapterSummary } from '../types';

const TABS = [
  { id: 'toc', label: '목차' },
  { id: 'intro', label: '작품 소개' },
  { id: 'background', label: '배경 지식' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const NOTICE = 'py-10 text-center text-sm text-dash-ink';
const OUTLINE_BUTTON =
  'inline-flex min-h-11 items-center justify-center rounded-full border border-dash-ink bg-white px-5 text-sm font-bold text-dash-ink transition-colors hover:bg-dash-ink/5 active:bg-dash-ink/10';

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="뒤로 가기"
      onClick={onClick}
      className="-ml-3 grid size-11 place-items-center rounded-full text-dash-ink transition-colors hover:bg-dash-ink/5"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M15 5l-7 7 7 7" />
      </svg>
    </button>
  );
}

function RetryNotice({ onRetry }: { onRetry: () => void }) {
  return (
    <div className={NOTICE}>
      <p>작품 정보를 불러오지 못했습니다</p>
      <button type="button" onClick={onRetry} className={`${OUTLINE_BUTTON} mt-4`}>
        다시 시도
      </button>
    </div>
  );
}

function BookTabs({
  detail,
  position,
  onSelectChapter,
}: {
  detail: BookDetailState;
  position: PositionResponse | null;
  onSelectChapter: (chapter: ChapterSummary) => void;
}) {
  const [tab, setTab] = useState<TabId>('toc');

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const index = TABS.findIndex((t) => t.id === tab);
    const next = TABS[(index + (event.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length];
    setTab(next.id);
    document.getElementById(`book-tab-${next.id}`)?.focus();
  }

  return (
    <>
      <div role="tablist" aria-label="작품 정보" className="flex gap-[22px] border-b border-dash-line">
        {TABS.map((t) => {
          const selected = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`book-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`book-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setTab(t.id)}
              onKeyDown={onKeyDown}
              className={`-mb-px min-h-11 min-w-11 border-b-2 text-sm ${
                selected ? 'border-dash-ink font-bold text-dash-ink' : 'border-transparent text-dash-muted'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={`book-panel-${tab}`} aria-labelledby={`book-tab-${tab}`}>
        {tab === 'toc' && (
          <ChapterList
            chapters={detail.chapters}
            position={position}
            disabled={!detail.book?.ssabi_ready}
            onSelect={onSelectChapter}
          />
        )}
        {tab === 'intro' && (
          <p className="pt-4 text-[14.5px] leading-relaxed text-dash-ink">
            {detail.introduction ?? '작품 소개가 아직 없습니다.'}
          </p>
        )}
        {tab === 'background' &&
          (detail.background.length > 0 ? (
            <ol className="m-0 list-none space-y-3.5 p-0 pt-4">
              {detail.background.map((item, index) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="mt-0.5 grid size-[22px] shrink-0 place-items-center rounded-full border border-dash-line font-dashMono text-xs text-dash-ink">
                    {index + 1}
                  </span>
                  <p className="text-[14.5px] leading-relaxed text-dash-ink">{item}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="pt-4 text-[14.5px] text-dash-ink">배경 지식이 아직 없습니다.</p>
          ))}
      </div>
    </>
  );
}

// FR-BRW-003 FR-NAV-001 FR-SPL-002 FR-BRF-001 FR-ADM-005
export default function BookDetail() {
  const { bookId = '' } = useParams();
  const navigate = useNavigate();
  const detail = useBookDetail(bookId);
  const { book, status } = detail;
  const position = useBookPosition(bookId, status === 'ready');
  const { enter, busyId, failed } = useEnterBook();

  // FR-PRG-003
  useEffect(() => {
    clearPendingJump();
  }, [bookId]);

  // FR-PRG-003 FR-SPL-005
  useEffect(() => {
    if (failed) clearPendingJump();
  }, [failed]);

  function goBack() {
    if (window.history.state?.idx === 0) navigate(APP_ROUTES.home);
    else navigate(-1);
  }

  // FR-PRG-003
  function selectChapter(chapter: ChapterSummary) {
    if (busyId) return;
    setPendingJump(bookId, chapter.start_page);
    void enter(bookId);
  }

  // FR-BRF-001
  function startReading() {
    clearPendingJump();
    void enter(bookId);
  }

  const container = 'mx-auto w-full max-w-page px-7 pb-12 pt-4 mobile:px-[18px] mobile:pb-24 mobile:pt-1';

  if (!book || status === 'not-found') {
    return (
      <div className={container}>
        <BackButton onClick={goBack} />
        {status === 'loading' && (
          <p role="status" className={NOTICE}>
            불러오는 중
          </p>
        )}
        {status === 'error' && <RetryNotice onRetry={detail.retry} />}
        {status === 'not-found' && (
          <div className={NOTICE}>
            <p>찾을 수 없는 작품입니다</p>
            <Link to={APP_ROUTES.home} className={`${OUTLINE_BUTTON} mt-4`}>
              홈으로
            </Link>
          </div>
        )}
      </div>
    );
  }

  const busy = busyId === book.book_id;

  return (
    <div className={container}>
      <BackButton onClick={goBack} />
      <div className="mt-2 grid grid-cols-[170px_minmax(0,1fr)] gap-[26px] mobile:mt-0 mobile:block">
        <div>
          <div className="mobile:flex mobile:gap-[14px]">
            <BookCover book={book} size="detail" />
            <div className="mt-3 min-w-0 mobile:mt-0 mobile:flex-1">
              <h1 className="break-keep font-dashSerif text-[22px] font-bold leading-tight text-dash-ink">
                {book.title}
              </h1>
              <p className="mt-1 text-[13px] text-dash-muted">{book.author} 지음</p>
              {book.genre && <p className="mt-1.5 text-xs text-dash-muted">{book.genre}</p>}
              {book.progress && (
                <div className="mt-3 flex items-center gap-2">
                  <div className="flex-1">
                    <ProgressBar percent={book.progress.percent} tone="dash" />
                  </div>
                  <span className="font-dashMono text-xs text-dash-ink">{book.progress.percent}%</span>
                </div>
              )}
            </div>
          </div>
          <div className="mt-4 mobile:fixed mobile:inset-x-0 mobile:bottom-0 mobile:z-10 mobile:mt-0 mobile:border-t mobile:border-dash-line mobile:bg-dash-paper mobile:px-[18px] mobile:pb-[calc(12px+var(--safe-bottom))] mobile:pt-3">
            <button
              type="button"
              onClick={startReading}
              disabled={!book.ssabi_ready || busy || status === 'loading' || status === 'not-ready'}
              className="flex min-h-11 w-full items-center justify-center rounded-full border border-dash-ink bg-white px-4 text-sm font-bold text-dash-ink transition-colors hover:bg-dash-ink/5 active:bg-dash-ink/10 disabled:opacity-40 disabled:hover:bg-white mobile:min-h-12 mobile:text-[15px]"
            >
              {resumeLabel(book, busy)}
            </button>
            {failed && (
              <p role="alert" className="mt-2 text-center text-xs text-dash-ink">
                열지 못했습니다. 다시 시도해 주세요.
              </p>
            )}
          </div>
        </div>

        <section className="min-w-0 mobile:mt-4">
          {status === 'loading' && (
            <p role="status" className={NOTICE}>
              불러오는 중
            </p>
          )}
          {status === 'not-ready' && <p className={NOTICE}>아직 준비 중인 작품입니다</p>}
          {status === 'error' && <RetryNotice onRetry={detail.retry} />}
          {status === 'ready' && (
            <>
              {position && position.applied_cutoff > 0 && (
                <p className="mb-2 flex min-h-11 items-center gap-2.5 rounded-dash-card bg-brief-accent-soft px-3 py-2 text-[13px] text-brief-ink">
                  <img src={ssabiFace} alt="" aria-hidden="true" className="h-6 w-auto shrink-0" />
                  <span>{`아모가 ${position.applied_cutoff}쪽까지 줄거리를 정리해 뒀어요`}</span>
                </p>
              )}
              <BookTabs detail={detail} position={position} onSelectChapter={selectChapter} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
