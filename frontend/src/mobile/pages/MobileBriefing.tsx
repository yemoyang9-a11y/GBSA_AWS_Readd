import { useParams } from 'react-router-dom';
import Loading from '../../components/common/Loading';
import { useBriefingSession } from '../../hooks/useBriefingSession';
import MobileBriefingView from '../components/MobileBriefingView';

// FR-BRF-001 FR-SPL-005 🚦
export default function MobileBriefing() {
  const { bookId = '' } = useParams();
  const session = useBriefingSession(bookId);

  if (!session.briefing) return <Loading />;

  return (
    <MobileBriefingView
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
