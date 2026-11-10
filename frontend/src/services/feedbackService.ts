import { api } from './api';

export async function submitFeedback(message: string): Promise<void> {
  await api.post('/feedback', { message });
}
