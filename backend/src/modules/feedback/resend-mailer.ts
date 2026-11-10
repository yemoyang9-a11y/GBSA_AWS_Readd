const RESEND_EMAILS_URL = 'https://api.resend.com/emails';
const SEND_TIMEOUT_MS = 10_000;

export async function sendFeedbackMail(message: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is not set');

  const response = await fetch(RESEND_EMAILS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'readd-feedback/1.0',
    },
    body: JSON.stringify({
      from: 'onboarding@resend.dev',
      to: 'yemoyang9@gmail.com',
      subject: '[READD] 서재 의견',
      text: message,
    }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Resend responded ${response.status}: ${await response.text()}`);
  }
}
