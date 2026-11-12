import AuthSheet, { CloseButton } from './AuthSheet';
import kakaoSymbol from '../../assets/auth/kakao-symbol.svg';
import googleG from '../../assets/auth/google-g.png';
import { startLogin, type AuthProvider } from '../../services/authService';
import { saveLoginReturn } from '../../utils/loginReturn';

export default function LoginGate({ bookId, onClose }: { bookId: string; onClose: () => void }) {
  function login(provider: AuthProvider) {
    saveLoginReturn(bookId);
    startLogin(provider);
  }

  return (
    <AuthSheet label="로그인" onClose={onClose}>
      <div className="flex justify-end">
        <CloseButton onClick={onClose} />
      </div>
      <h2 className="break-keep font-dashSerif text-[22px] font-bold leading-snug">
        로그인하고
        <br />
        책을 읽어 보세요
      </h2>
      <p className="mt-2 break-keep text-[14px] leading-relaxed text-dash-muted">
        읽은 위치가 계정에 저장돼 다른 기기에서도 이어 읽을 수 있어요.
      </p>
      <p className="mb-3 mt-9 text-center text-[13px] text-dash-muted">SNS 계정으로 로그인/가입</p>
      <div className="grid grid-cols-2 gap-2 pb-2">
        <button
          type="button"
          aria-label="카카오 로그인"
          onClick={() => login('kakao')}
          className="flex h-12 items-center justify-center gap-2 rounded-[12px] bg-[#FEE500] text-[15px] font-medium text-black/85"
        >
          <img src={kakaoSymbol} alt="" width={18} height={18} />
          로그인
        </button>
        <button
          type="button"
          aria-label="Google 로그인"
          onClick={() => login('google')}
          className="flex h-12 items-center justify-center gap-[10px] rounded-[4px] border border-[#747775] bg-white text-[14px] font-medium leading-5 text-[#1F1F1F]"
        >
          <img src={googleG} alt="" width={20} height={20} />
          로그인
        </button>
      </div>
    </AuthSheet>
  );
}
