import { useParams } from 'react-router-dom';
import BriefingView from './BriefingView';
import Loading from '../components/common/Loading';
import { useBriefingSession } from '../hooks/useBriefingSession';

/**
 * 브리핑 화면 컨테이너 — S6
 *
 * 데이터만 모아 BriefingView 에 넘긴다. 화면 분기(리캡/폴백/빈 상태)는 뷰가 판정한다.
 * 목차는 GET /info 에서 1회 받아 쓴다 — 브리핑 응답에 목차를 중복으로 싣지 않는다
 * (team-sync-r4.md §1.3, R2 확인).
 */
export default function Briefing() {
  const { bookId = '' } = useParams();
  const session = useBriefingSession(bookId);

  if (!session.briefing) return <Loading />;

  return (
    <BriefingView
      briefing={session.briefing}
      chapters={session.chapters}
      title={session.title}
      author={session.author}
      coverUrl={session.coverUrl}
      onContinue={session.continueReading}
      onRequestFallback={session.requestFallback}
      onSelectChapter={session.selectChapter}
      onBack={session.goBack}
      streamedRecap={session.streamedRecap}
      recapFailed={session.recapFailed}
      recapStreaming={session.recapStreaming}
      characterNames={session.characterNames}
    />
  );
}
