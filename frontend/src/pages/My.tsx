import AccountCard from '../components/My/AccountCard';
import ReaderPrefsControls from '../components/Reader/ReaderPrefsControls';
import FeedbackEntry from '../components/Feedback/FeedbackEntry';
import { useReaderPrefs } from '../hooks/useReaderPrefs';
import { isMobileDevice } from '../mobile/device';

// NFR-USE
export default function My() {
  const prefsApi = useReaderPrefs();
  const isMobile = isMobileDevice(window.screen);

  return (
    <div className="mx-auto w-full max-w-[560px] px-6 py-8 mobile:px-4 mobile:py-5">
      <h1 className="font-dashSerif text-[24px] font-bold text-dash-ink mobile:text-[20px]">MY</h1>
      <section className="mt-5">
        <AccountCard />
      </section>
      <section aria-labelledby="my-prefs" className="mt-8">
        <h2 id="my-prefs" className="font-dashSerif text-[17px] font-bold text-dash-ink">
          보기 설정
        </h2>
        <div className="mt-2">
          <ReaderPrefsControls {...prefsApi} tone="dash" />
        </div>
      </section>
      <FeedbackEntry variant={isMobile ? 'sheet' : 'modal'} />
    </div>
  );
}
