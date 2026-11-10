import { sendFeedbackMail } from '../../../src/modules/feedback/resend-mailer';

const fetchMock = jest.spyOn(global, 'fetch');

function requestInit(): RequestInit {
  return fetchMock.mock.calls[0][1] as RequestInit;
}

beforeEach(() => {
  fetchMock.mockReset();
  process.env.RESEND_API_KEY = 're_test_key';
});

afterAll(() => {
  fetchMock.mockRestore();
  delete process.env.RESEND_API_KEY;
});

describe('sendFeedbackMail', () => {
  test('posts the feedback as plain text to the fixed mailbox through the Resend emails API', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 'email-id' }), { status: 200 }));

    await sendFeedbackMail('<b>글자가</b> 작아요');

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.resend.com/emails');
    expect(requestInit().method).toBe('POST');
    expect(JSON.parse(requestInit().body as string)).toEqual({
      from: 'onboarding@resend.dev',
      to: 'yemoyang9@gmail.com',
      subject: '[READD] 서재 의견',
      text: '<b>글자가</b> 작아요',
    });
  });

  test('authenticates with the environment key and sends the required User-Agent', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));

    await sendFeedbackMail('의견');

    expect(requestInit().headers).toMatchObject({
      Authorization: 'Bearer re_test_key',
      'Content-Type': 'application/json',
      'User-Agent': expect.stringMatching(/\S/),
    });
  });

  test('gives up on a hanging provider through an abort signal', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));

    await sendFeedbackMail('의견');

    expect(requestInit().signal).toBeInstanceOf(AbortSignal);
  });

  test('fails without calling the provider when the key is not configured', async () => {
    delete process.env.RESEND_API_KEY;

    await expect(sendFeedbackMail('의견')).rejects.toThrow('RESEND_API_KEY');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('fails with the provider status when Resend refuses the mail', async () => {
    fetchMock.mockResolvedValue(new Response('{"message":"forbidden"}', { status: 403 }));

    await expect(sendFeedbackMail('의견')).rejects.toThrow('403');
  });
});
