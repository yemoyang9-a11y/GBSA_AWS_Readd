import { useNavigate, useParams } from 'react-router-dom';
import Loading from '../../components/common/Loading';
import { useBriefingSession } from '../../hooks/useBriefingSession';
import MobileBriefingView from '../components/MobileBriefingView';

// FR-BRF-001 FR-SPL-005 🚦
export default function MobileBriefing() {
  const { bookId = '' } = useParams();
  const navigate = useNavigate();
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
      onBack={() => navigate('/')}
      streamedRecap={session.streamedRecap}
      recapFailed={session.recapFailed}
      recapStreaming={session.recapStreaming}
      characterNames={session.characterNames}
    />
  );
}
