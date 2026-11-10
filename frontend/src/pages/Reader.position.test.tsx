import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import type { ComponentProps } from 'react';
import Reader from './Reader';
import { enterBook, sendProgress } from '../services/progressService';
import { fetchPage } from '../services/bookService';
import { streamRecap } from '../services/recapService';
import {
  askChatbot,
  fetchChatConversations,
  fetchChatConversationDetail,
} from '../services/chatbotService';
import type { SseFrame } from '../types';

vi.mock('../services/progressService', () => ({
  enterBook: vi.fn(),
  sendProgress: vi.fn(async () => 90),
}));
vi.mock('../services/bookService', () => ({
  fetchBookInfo: vi.fn(async () => ({ chapters: [] })),
  fetchPage: vi.fn(),
}));
vi.mock('../services/recapService', () => ({ streamRecap: vi.fn() }));
vi.mock('../services/chatbotService', () => ({
  askChatbot: vi.fn(),
  fetchChatConversations: vi.fn(async () => []),
  fetchChatConversationDetail: vi.fn(),
  deleteChatConversation: vi.fn(),
}));
vi.mock('../hooks/useHeartbeat', () => ({ useHeartbeat: vi.fn() }));
vi.mock('../services/ssabiService', () => ({
  fetchGraph: vi.fn(async () => ({ nodes: [], edges: [] })),
}));
vi.mock('../components/common/SsabiToggleButton', () => ({
  default: ({ onToggle }: { onToggle: () => void }) => <button onClick={onToggle}>panel</button>,
}));
vi.mock('../components/Reader/ReaderView', () => ({
  default: (props: ComponentProps<typeof import('../components/Reader/ReaderView').default>) => (
    <div>
      <p>{props.content}</p>
      <button onClick={() => props.onMove(40)}>move to 40</button>
      <button onClick={() => props.onQuote?.('selected from old body')}>select body</button>
    </div>
  ),
}));
vi.mock('../components/Ssabi/SsabiPanel', () => ({
  default: (props: ComponentProps<typeof import('../components/Ssabi/SsabiPanel').default>) => (
    <div>
      <button onClick={() => props.onTabChange('recap')}>recap</button>
      <button onClick={() => props.onTabChange('chatbot')}>chat</button>
      <button onClick={() => props.onAsk('question')}>ask</button>
      <button onClick={props.onToggleChatHistory}>history</button>
      <button onClick={() => props.onSelectChatConversation(3)}>history detail</button>
      <button onClick={() => props.onRecapQuote?.(props.recapText)}>select recap</button>
      <p data-testid="recap">{props.recapText}</p>
      <p data-testid="quote">{props.pendingQuote?.text}</p>
      <p data-testid="chat">{props.chatTurns.map((turn) => turn.text).join('|')}</p>
      <p data-testid="chat-error">{props.chatError}</p>
    </div>
  ),
}));

function SwitchBook() {
  const navigate = useNavigate();
  return <button onClick={() => navigate('/books/other/read')}>other book</button>;
}
function renderReader() {
  render(
    <MemoryRouter initialEntries={['/books/book/read']}>
      <SwitchBook />
      <Routes>
        <Route path="/books/:bookId/read" element={<Reader />} />
      </Routes>
    </MemoryRouter>
  );
}
async function* frames(...values: SseFrame[]): AsyncGenerator<SseFrame> {
  yield* values;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(sendProgress).mockResolvedValue(90);
  vi.mocked(enterBook).mockResolvedValue({
    route: 'reader',
    page: 90,
    is_new_session: false,
    session_epoch: 1,
  });
  vi.mocked(fetchPage).mockImplementation(async (_book, page) => ({
    page_no: page,
    content: `body ${page}`,
    prev_page: 40,
    next_page: null,
  }));
  vi.mocked(streamRecap).mockImplementation(() =>
    frames({ type: 'delta', text: 'future recap' }, { type: 'done', applied_cutoff: 90 })
  );
  vi.mocked(askChatbot).mockImplementation(() =>
    frames({ type: 'delta', text: 'future answer' }, { type: 'done', applied_cutoff: 90 })
  );
});

it('hides old recap, selected quote, body, and chat on K90 to K40 while the new page is still loading', async () => {
  renderReader();
  await screen.findByText('body 90');
  fireEvent.click(screen.getByText('panel'));
  fireEvent.click(await screen.findByText('recap', { selector: 'button' }));
  await waitFor(() => expect(screen.getByTestId('recap')).toHaveTextContent('future recap'));
  fireEvent.click(screen.getByText('select recap'));
  expect(screen.getByTestId('quote')).toHaveTextContent('future recap');
  fireEvent.click(screen.getByText('ask'));
  await waitFor(() => expect(screen.getByTestId('chat')).toHaveTextContent('future answer'));
  vi.mocked(fetchPage).mockReturnValueOnce(new Promise(() => {}));
  fireEvent.click(screen.getByText('move to 40'));
  expect(screen.getByTestId('recap')).toBeEmptyDOMElement();
  expect(screen.getByTestId('quote')).toBeEmptyDOMElement();
  expect(screen.getByTestId('chat')).toBeEmptyDOMElement();
  expect(screen.queryByText('body 90')).not.toBeInTheDocument();
  expect(streamRecap).toHaveBeenCalledTimes(1);
});

it('ignores late recap deltas after moving and preserves recap at the same position across tabs', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  async function* old(): AsyncGenerator<SseFrame> {
    yield { type: 'delta', text: 'future recap' };
    await gate;
    yield { type: 'delta', text: ' late leak' };
    yield { type: 'done', applied_cutoff: 90 };
  }
  vi.mocked(streamRecap).mockReturnValueOnce(old());
  renderReader();
  await screen.findByText('body 90');
  fireEvent.click(screen.getByText('panel'));
  fireEvent.click(await screen.findByText('recap', { selector: 'button' }));
  await waitFor(() => expect(screen.getByTestId('recap')).toHaveTextContent('future recap'));
  fireEvent.click(screen.getByText('chat', { selector: 'button' }));
  expect(screen.getByTestId('recap')).toHaveTextContent('future recap');
  fireEvent.click(screen.getByText('move to 40'));
  await screen.findByText('body 40');
  await act(async () => {
    release();
  });
  expect(screen.getByTestId('recap')).toBeEmptyDOMElement();
});

it('clears old book data before the next book entry resolves', async () => {
  renderReader();
  await screen.findByText('body 90');
  fireEvent.click(screen.getByText('panel'));
  fireEvent.click(await screen.findByText('recap', { selector: 'button' }));
  await waitFor(() => expect(screen.getByTestId('recap')).toHaveTextContent('future recap'));
  vi.mocked(enterBook).mockReturnValueOnce(new Promise(() => {}));
  fireEvent.click(screen.getByText('other book'));
  expect(screen.queryByText('body 90')).not.toBeInTheDocument();
  expect(screen.queryByText('future recap')).not.toBeInTheDocument();
});

it('shows a retryable error when the new page request rejects', async () => {
  renderReader();
  await screen.findByText('body 90');
  vi.mocked(fetchPage).mockRejectedValueOnce(new Error('offline'));
  fireEvent.click(screen.getByText('move to 40'));
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(screen.queryByText('body 90')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
  await screen.findByText('body 40');
});

it.each(['history', 'history detail'])(
  'waits for K40 progress acknowledgment before fetching %s',
  async (action) => {
    let acknowledge!: (cutoff: number) => void;
    renderReader();
    await screen.findByText('body 90');
    vi.mocked(sendProgress).mockReturnValueOnce(
      new Promise((resolve) => {
        acknowledge = resolve;
      })
    );
    fireEvent.click(screen.getByText('move to 40'));
    await screen.findByText('body 40');
    fireEvent.click(screen.getByText('panel'));
    fireEvent.click(await screen.findByText(action, { selector: 'button' }));
    await act(async () => {});
    expect(fetchChatConversations).not.toHaveBeenCalled();
    expect(fetchChatConversationDetail).not.toHaveBeenCalled();
    await act(async () => {
      acknowledge(40);
    });
    await waitFor(() =>
      expect(
        action === 'history' ? fetchChatConversations : fetchChatConversationDetail
      ).toHaveBeenCalledTimes(1)
    );
  }
);

it('blocks history on failed progress and retries progress when history is retried', async () => {
  renderReader();
  await screen.findByText('body 90');
  vi.mocked(sendProgress).mockResolvedValueOnce(null);
  fireEvent.click(screen.getByText('move to 40'));
  await screen.findByText('body 40');
  fireEvent.click(screen.getByText('panel'));
  fireEvent.click(await screen.findByText('history', { selector: 'button' }));
  await waitFor(() => expect(screen.getByTestId('chat-error')).not.toBeEmptyDOMElement());
  expect(fetchChatConversations).not.toHaveBeenCalled();
  vi.mocked(sendProgress).mockResolvedValueOnce(40);
  fireEvent.click(screen.getByText('history', { selector: 'button' }));
  fireEvent.click(screen.getByText('history', { selector: 'button' }));
  await waitFor(() => expect(fetchChatConversations).toHaveBeenCalledTimes(1));
  expect(sendProgress).toHaveBeenLastCalledWith('book', 40);
});

it('forwards the expected position and retries progress after the server rejects a mismatched position', async () => {
  renderReader();
  await screen.findByText('body 90');
  fireEvent.click(screen.getByText('move to 40'));
  await screen.findByText('body 40');
  vi.mocked(fetchChatConversations).mockRejectedValueOnce(new Error('409: position changed'));
  fireEvent.click(screen.getByText('panel'));
  fireEvent.click(await screen.findByText('history', { selector: 'button' }));
  await waitFor(() => expect(screen.getByTestId('chat-error')).not.toBeEmptyDOMElement());
  expect(fetchChatConversations).toHaveBeenLastCalledWith('book', 40);
  const progressCalls = vi.mocked(sendProgress).mock.calls.length;
  fireEvent.click(screen.getByText('history', { selector: 'button' }));
  fireEvent.click(screen.getByText('history', { selector: 'button' }));
  await waitFor(() => expect(sendProgress).toHaveBeenCalledTimes(progressCalls + 1));
});
