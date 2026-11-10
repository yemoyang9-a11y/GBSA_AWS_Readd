import express, { Request, Response, Router } from 'express';

const MAX_MESSAGE_LENGTH = 2000;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const MAX_REQUESTS_PER_CLIENT = 5;
const MAX_REQUESTS_TOTAL = 20;

export function createFeedbackRouter({
  sendMail,
  now = Date.now,
}: {
  sendMail: (message: string) => Promise<void>;
  now?: () => number;
}): Router {
  const router = express.Router();
  let accepted: { client: string; at: number }[] = [];

  router.post('/feedback', async (req: Request, res: Response) => {
    const raw: unknown = req.body?.message;
    const message = typeof raw === 'string' ? raw.trim() : '';
    if (!message || message.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({
        error: 'BAD_REQUEST',
        message: `message must be 1-${MAX_MESSAGE_LENGTH} characters`,
      });
    }

    const client = (req.headers['fly-client-ip'] as string | undefined) ?? req.ip ?? 'unknown';
    const current = now();
    accepted = accepted.filter((entry) => entry.at > current - RATE_WINDOW_MS);
    const fromClient = accepted.filter((entry) => entry.client === client);
    const oldestBlocking =
      fromClient.length >= MAX_REQUESTS_PER_CLIENT
        ? fromClient[0]
        : accepted.length >= MAX_REQUESTS_TOTAL
          ? accepted[0]
          : null;
    if (oldestBlocking) {
      return res.status(429).json({
        error: 'RATE_LIMIT',
        message: 'Too many feedback requests',
        retry_after: Math.ceil((oldestBlocking.at + RATE_WINDOW_MS - current) / 1000),
      });
    }
    accepted.push({ client, at: current });

    try {
      await sendMail(message);
      return res.json({ success: true });
    } catch (error) {
      console.error('[API] Feedback send error', { error });
      return res
        .status(502)
        .json({ error: 'FEEDBACK_SEND_FAILED', message: 'Feedback could not be sent' });
    }
  });

  return router;
}
