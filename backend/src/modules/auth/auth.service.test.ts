import { FakeAccountRepository } from '../../../tests/unit/auth/fakes';
import { AuthService, CONSENT_VERSION } from './auth.service';
import { verifySessionToken } from './session-token';

const DEVICE_A = '11111111-1111-4111-8111-111111111111';
const DEVICE_B = '22222222-2222-4222-8222-222222222222';
const GOOGLE_PROFILE = { providerUserId: 'google-1', displayName: '구글 독자' };
const KAKAO_PROFILE = { providerUserId: 'kakao-1', displayName: '카카오 독자' };

describe('AuthService', () => {
  let accounts: FakeAccountRepository;
  let clock: Date;
  let service: AuthService;

  beforeEach(() => {
    process.env.AUTH_TOKEN_SECRET = 'test-only-signing-value-aaaaaaaaaaaa';
    accounts = new FakeAccountRepository();
    clock = new Date('2026-11-10T00:00:00.000Z');
    service = new AuthService(accounts, () => clock);
  });

  afterAll(() => {
    delete process.env.AUTH_TOKEN_SECRET;
  });

  test('처음 로그인한 계정의 reader_id는 state의 device_id다', async () => {
    const account = await service.completeLogin('google', GOOGLE_PROFILE, DEVICE_A);
    expect(account.reader_id).toBe(DEVICE_A);
  });

  test('같은 제공자 번호로 다시 로그인하면 같은 reader_id를 받는다', async () => {
    const first = await service.completeLogin('google', GOOGLE_PROFILE, DEVICE_A);
    const second = await service.completeLogin('google', GOOGLE_PROFILE, DEVICE_B);
    expect(second.reader_id).toBe(first.reader_id);
    expect(second.user_id).toBe(first.user_id);
    expect(accounts.accounts).toHaveLength(1);
  });

  test('이미 다른 계정의 reader_id인 기기로 새 계정을 만들면 새 reader_id를 받는다', async () => {
    const google = await service.completeLogin('google', GOOGLE_PROFILE, DEVICE_A);
    const kakao = await service.completeLogin('kakao', KAKAO_PROFILE, DEVICE_A);
    expect(kakao.user_id).not.toBe(google.user_id);
    expect(kakao.reader_id).not.toBe(DEVICE_A);
    expect(kakao.reader_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  test('1회용 코드를 교환하면 reader_id가 담긴 토큰과 표시 이름을 준다', async () => {
    const account = await service.completeLogin('google', GOOGLE_PROFILE, DEVICE_A);
    const code = await service.issueLoginCode(account.user_id);

    const session = await service.redeemLoginCode(code);

    expect(session?.display_name).toBe('구글 독자');
    await expect(verifySessionToken(session?.token as string)).resolves.toEqual({
      userId: account.user_id,
      readerId: DEVICE_A,
    });
  });

  test('1회용 코드는 두 번 쓸 수 없다', async () => {
    const account = await service.completeLogin('google', GOOGLE_PROFILE, DEVICE_A);
    const code = await service.issueLoginCode(account.user_id);

    await expect(service.redeemLoginCode(code)).resolves.not.toBeNull();
    await expect(service.redeemLoginCode(code)).resolves.toBeNull();
  });

  test('1회용 코드는 60초 뒤 만료된다', async () => {
    const account = await service.completeLogin('google', GOOGLE_PROFILE, DEVICE_A);
    const code = await service.issueLoginCode(account.user_id);

    clock = new Date(clock.getTime() + 60_000);

    await expect(service.redeemLoginCode(code)).resolves.toBeNull();
  });

  test('1회용 코드는 59초까지 쓸 수 있다', async () => {
    const account = await service.completeLogin('google', GOOGLE_PROFILE, DEVICE_A);
    const code = await service.issueLoginCode(account.user_id);

    clock = new Date(clock.getTime() + 59_000);

    await expect(service.redeemLoginCode(code)).resolves.not.toBeNull();
  });

  test('getMe는 표시 이름과 연결된 제공자를 돌려준다', async () => {
    const account = await service.completeLogin('kakao', KAKAO_PROFILE, DEVICE_A);
    await expect(service.getMe(account.user_id)).resolves.toEqual({
      display_name: '카카오 독자',
      providers: ['kakao'],
      consent_required: true,
    });
  });

  describe('첫 가입 동의', () => {
    const AGREEMENT = {
      terms_version: CONSENT_VERSION,
      privacy_version: CONSENT_VERSION,
      age_14_confirmed: true,
    };

    test('처음 가입한 계정은 consent_required가 true다', async () => {
      const account = await service.completeLogin('google', GOOGLE_PROFILE, DEVICE_A);
      const code = await service.issueLoginCode(account.user_id);
      const session = await service.redeemLoginCode(code);
      expect(session?.consent_required).toBe(true);
    });

    test('현재 버전에 동의하면 consent_required가 false다', async () => {
      const account = await service.completeLogin('google', GOOGLE_PROFILE, DEVICE_A);
      await expect(service.recordConsent(account.user_id, AGREEMENT)).resolves.toBe(true);

      const code = await service.issueLoginCode(account.user_id);
      await expect(service.redeemLoginCode(code)).resolves.toMatchObject({
        consent_required: false,
      });
      await expect(service.getMe(account.user_id)).resolves.toMatchObject({
        consent_required: false,
      });
    });

    test('동의 기록에는 계정·두 버전·14세 확인·동의 시각이 남는다', async () => {
      const account = await service.completeLogin('google', GOOGLE_PROFILE, DEVICE_A);
      await service.recordConsent(account.user_id, AGREEMENT);
      expect(accounts.consents).toEqual([
        {
          userId: account.user_id,
          termsVersion: CONSENT_VERSION,
          privacyVersion: CONSENT_VERSION,
          age14Confirmed: true,
          agreedAt: clock,
        },
      ]);
    });

    test('다른 버전에 동의한 기록만 있으면 다시 동의가 필요하다', async () => {
      const account = await service.completeLogin('google', GOOGLE_PROFILE, DEVICE_A);
      accounts.consents.push({
        userId: account.user_id,
        termsVersion: 'old',
        privacyVersion: 'old',
        age14Confirmed: true,
        agreedAt: clock,
      });
      await expect(service.getMe(account.user_id)).resolves.toMatchObject({
        consent_required: true,
      });
    });

    test.each([
      ['만 14세 이상 확인이 없으면', { ...AGREEMENT, age_14_confirmed: false }],
      ['이용약관 버전이 현재와 다르면', { ...AGREEMENT, terms_version: 'old' }],
      ['개인정보 버전이 현재와 다르면', { ...AGREEMENT, privacy_version: 'old' }],
      ['값이 비어 있으면', {}],
    ])('%s 저장하지 않는다', async (_label, body) => {
      const account = await service.completeLogin('google', GOOGLE_PROFILE, DEVICE_A);
      await expect(service.recordConsent(account.user_id, body)).resolves.toBe(false);
      expect(accounts.consents).toHaveLength(0);
    });
  });

  test('없는 계정의 getMe는 null이다', async () => {
    await expect(service.getMe('missing')).resolves.toBeNull();
  });

  test('탈퇴하면 계정과 reader_id의 독서 기록을 지운다', async () => {
    const account = await service.completeLogin('google', GOOGLE_PROFILE, DEVICE_A);

    await service.withdraw(account.user_id, account.reader_id);

    expect(accounts.accounts).toHaveLength(0);
    expect(accounts.identities).toHaveLength(0);
    expect(accounts.deletedReaders).toEqual([DEVICE_A]);
  });
});
