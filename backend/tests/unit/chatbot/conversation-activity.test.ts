import { recordTurns } from '../../../src/modules/chatbot/conversation-service';
import * as repo from '../../../src/modules/chatbot/conversation-repository';

jest.mock('../../../src/modules/chatbot/conversation-repository');

describe('conversation activity timestamp', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('updates the session activity time after a completed question and answer', async () => {
    (repo.getMaxTurnNo as jest.Mock).mockResolvedValue(2);

    await recordTurns(12, 'second question', 'second answer', 106);

    expect(
      (repo as unknown as { touchConversation: jest.Mock }).touchConversation
    ).toHaveBeenCalledWith(12);
  });
});
