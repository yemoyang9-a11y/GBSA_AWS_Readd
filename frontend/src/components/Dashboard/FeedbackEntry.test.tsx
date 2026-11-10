import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FeedbackEntry from './FeedbackEntry';
import { api } from '../../services/api';

vi.mock('../../services/api', () => ({ api: { post: vi.fn() } }));

const PROMPT = '여러분의 소중한 의견 남겨주시면 감사하겠습니다.';
const post = vi.mocked(api.post);

async function open(variant: 'modal' | 'sheet') {
  const user = userEvent.setup();
  render(<FeedbackEntry variant={variant} />);
  await user.click(screen.getByRole('button', { name: '의견 남기기' }));
  return user;
}

function input() {
  return screen.getByRole('textbox', { name: PROMPT });
}

describe.each(['modal', 'sheet'] as const)('FeedbackEntry (%s)', (variant) => {
  beforeEach(() => {
    post.mockReset();
    post.mockResolvedValue({ data: { success: true } });
  });

  it('누르기 전에는 입력 창이 없다', () => {
    render(<FeedbackEntry variant={variant} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('누르면 문구로 라벨된 입력칸 하나와 제출 버튼이 뜬다', async () => {
    await open(variant);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getAllByRole('textbox')).toEqual([input()]);
    expect(screen.getByRole('button', { name: '제출' })).toBeInTheDocument();
  });

  it('공백만 입력하면 제출할 수 없다', async () => {
    const user = await open(variant);
    const submit = screen.getByRole('button', { name: '제출' });

    expect(submit).toBeDisabled();
    await user.type(input(), '   ');
    expect(submit).toBeDisabled();
  });

  it('입력은 서버 상한 2000자에서 잘린다', async () => {
    const user = await open(variant);

    await user.click(input());
    await user.paste('가'.repeat(2001));

    expect(input()).toHaveValue('가'.repeat(2000));
  });

  it('제출하면 내용을 서버로 보내고 성공 안내로 바뀐다', async () => {
    const user = await open(variant);

    await user.type(input(), '글자가 작아요');
    await user.click(screen.getByRole('button', { name: '제출' }));

    expect(await screen.findByRole('status')).toHaveTextContent('소중한 의견 감사합니다.');
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('/feedback', { message: '글자가 작아요' });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('전송 중에는 중복 제출되지 않고 닫히지도 않는다', async () => {
    let finish!: (value: { data: { success: boolean } }) => void;
    post.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const user = await open(variant);

    await user.type(input(), '의견');
    await user.click(screen.getByRole('button', { name: '제출' }));

    const submittedMessage = (input() as HTMLTextAreaElement).value;
    expect(input()).toBeDisabled();
    await user.type(input(), ' extra');
    expect(input()).toHaveValue(submittedMessage);

    const sending = screen.getByRole('button', { name: '보내는 중' });
    expect(sending).toBeDisabled();
    fireEvent.submit(sending.closest('form')!);
    expect(post).toHaveBeenCalledTimes(1);

    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: '닫기' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    finish({ data: { success: true } });
    expect(await screen.findByRole('status')).toBeInTheDocument();
  });

  it('실패하면 오류를 알리고 입력을 유지하며 다시 보낼 수 있다', async () => {
    post.mockRejectedValueOnce(new Error('network'));
    const user = await open(variant);

    await user.type(input(), '꼭 전하고 싶은 말');
    await user.click(screen.getByRole('button', { name: '제출' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('의견을 보내지 못했습니다');
    expect(input()).toHaveValue('꼭 전하고 싶은 말');
    expect(input()).toBeEnabled();

    await user.click(screen.getByRole('button', { name: '제출' }));

    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('Esc로 닫으면 연 버튼으로 포커스가 돌아간다', async () => {
    const user = await open(variant);

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '의견 남기기' })).toHaveFocus();
  });

  it('닫기 버튼으로 닫는다', async () => {
    const user = await open(variant);

    await user.click(screen.getByRole('button', { name: '닫기' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('바깥을 눌러도 작성 중인 내용이 사라지지 않는다', async () => {
    const user = await open(variant);

    await user.type(input(), '작성 중');
    await user.click(screen.getByTestId('feedback-overlay'));

    expect(input()).toHaveValue('작성 중');
  });
});

describe('FeedbackEntry (sheet) 배경 스크롤', () => {
  it('열려 있는 동안 배경 스크롤을 막고 닫으면 되돌린다', async () => {
    const user = await open('sheet');
    expect(document.body.style.overflow).toBe('hidden');

    await user.click(screen.getByRole('button', { name: '닫기' }));

    expect(document.body.style.overflow).toBe('');
  });
});
