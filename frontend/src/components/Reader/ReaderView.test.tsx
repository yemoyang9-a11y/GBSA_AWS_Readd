import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReaderView from './ReaderView';

const baseProps = {
  content: '정 주사는 여전히 미두장 앞을 서성이고 있었다.',
  currentPage: 21,
  totalPages: 30,
  // ±1 이 아닌 값을 일부러 쓴다 — 컴포넌트가 계산하지 않고 받은 값을 쓰는지 가려내기 위해서다
  prevPage: 15,
  nextPage: 27,
  onMove: () => {},
};

/**
 * 읽기 화면 (S3) — FR-PRG-001·002·004, 절대 규칙 9·10번
 *
 * 이동할 페이지 번호는 서버가 내려준 prev_page·next_page 를 그대로 쓴다. 프론트가
 * `page ± 1` 을 계산하지 않는다 — 파생값은 전부 서버가 만든다 (절대 규칙 2번의 정신).
 */
describe('읽기 화면', () => {
  it('본문을 렌더한다', () => {
    render(<ReaderView {...baseProps} />);
    expect(screen.getByText(/미두장 앞을 서성이고/)).toBeInTheDocument();
  });

  it('FR-PRG-004: 페이지 번호를 입력창으로 표시하고 진도 바를 두지 않는다', () => {
    render(<ReaderView {...baseProps} />);

    expect(screen.getByRole('textbox', { name: '페이지로 이동' })).toHaveValue('21');
    expect(screen.getByText('/ 30')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('페이지 입력창에 숫자를 넣고 Enter를 누르면 그 페이지로 이동한다', async () => {
    const onMove = vi.fn();
    render(<ReaderView {...baseProps} onMove={onMove} />);

    const input = screen.getByRole('textbox', { name: '페이지로 이동' });
    await userEvent.clear(input);
    await userEvent.type(input, '9{Enter}');

    expect(onMove).toHaveBeenCalledWith(9);
  });

  it('입력값을 1~totalPages 범위로 자른다', async () => {
    const onMove = vi.fn();
    render(<ReaderView {...baseProps} onMove={onMove} />);

    const input = screen.getByRole('textbox', { name: '페이지로 이동' });
    await userEvent.clear(input);
    await userEvent.type(input, '999{Enter}');

    expect(onMove).toHaveBeenCalledWith(30); // totalPages
  });

  it('숫자가 아닌 값을 넣고 포커스를 벗어나면 원래 페이지로 되돌린다', async () => {
    const onMove = vi.fn();
    render(<ReaderView {...baseProps} onMove={onMove} />);

    const input = screen.getByRole('textbox', { name: '페이지로 이동' });
    await userEvent.clear(input);
    await userEvent.tab(); // blur, 빈 값

    expect(input).toHaveValue('21');
    expect(onMove).not.toHaveBeenCalled();
  });

  it('FR-PRG-002: 다음 페이지로 이동하면 서버가 준 next_page 를 그대로 알린다', async () => {
    const onMove = vi.fn();
    render(<ReaderView {...baseProps} onMove={onMove} />);

    await userEvent.click(screen.getByRole('button', { name: '다음 페이지' }));

    expect(onMove).toHaveBeenCalledWith(27);
  });

  it('FR-PRG-003: 앞으로 돌아가는 이동도 똑같이 알린다 (기준점은 앞뒤 모두 따라 움직인다)', async () => {
    const onMove = vi.fn();
    render(<ReaderView {...baseProps} onMove={onMove} />);

    await userEvent.click(screen.getByRole('button', { name: '이전 페이지' }));

    expect(onMove).toHaveBeenCalledWith(15);
  });

  it('서버가 이웃 페이지를 주지 않으면(null) 그 방향으로는 이동할 수 없다', () => {
    // 경계가 아닌 페이지에서도 서버가 null 을 주면 막힌다 — 경계 산술로 판정하지 않는다
    const { unmount } = render(<ReaderView {...baseProps} prevPage={null} />);
    expect(screen.getByRole('button', { name: '이전 페이지' })).toBeDisabled();
    unmount();

    render(<ReaderView {...baseProps} nextPage={null} />);
    expect(screen.getByRole('button', { name: '다음 페이지' })).toBeDisabled();
  });

  it('자가 검증 18 / 절대 규칙 9번: 본문 영역 스크롤은 이동을 알리지 않는다', () => {
    const onMove = vi.fn();
    render(<ReaderView {...baseProps} onMove={onMove} />);

    const article = screen.getByRole('article');
    article.dispatchEvent(new Event('scroll', { bubbles: true }));

    expect(onMove).not.toHaveBeenCalled();
  });

  it('FR-PRG-001: 본문 영역이 스크롤 컨테이너다 — 재분할 없이 길이만 늘어난다', () => {
    render(
      <ReaderView content="본문" currentPage={1} totalPages={30} prevPage={null} nextPage={2} onMove={() => {}} />
    );
    expect(screen.getByRole('article').parentElement?.className).toMatch(/overflow-y-auto/);
  });

  describe('본문 드래그 → 챗봇 인용', () => {
    // 실제 사용자는 mousedown → 드래그 → mouseup 순으로 선택을 끝낸다. 팝오버는
    // 드래그가 끝난(mouseup) 시점에만 뜬다(2026-08-25 — 드래그 도중 계속 뜨면 버튼이
    // 본문 위를 휙휙 옮겨 다닌다) — 그래서 여기서도 selectionchange만으론 부족하고
    // mouseup까지 함께 흉내 내야 한다.
    function selectArticleText(start: number, end: number) {
      const article = screen.getByRole('article');
      const textNode = article.firstChild!;
      const range = document.createRange();
      range.setStart(textNode, start);
      range.setEnd(textNode, end);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      fireEvent(document, new Event('selectionchange'));
      fireEvent.mouseUp(document);
    }

    it('본문 일부를 선택하면(드래그 종료) 인용 팝오버가 뜬다', () => {
      render(<ReaderView {...baseProps} onQuote={() => {}} />);
      selectArticleText(0, 4); // "정 주사"

      expect(screen.getByRole('button', { name: '아모에게 물어보기' })).toBeInTheDocument();
    });

    it('드래그 도중(mouseup 전)에는 팝오버를 띄우지 않는다', () => {
      render(<ReaderView {...baseProps} onQuote={() => {}} />);
      const article = screen.getByRole('article');
      const textNode = article.firstChild!;
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, 4);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      fireEvent(document, new Event('selectionchange'));

      expect(screen.queryByRole('button', { name: '아모에게 물어보기' })).not.toBeInTheDocument();
    });

    it('팝오버를 누르면 선택한 문장 그대로 onQuote로 전달한다', async () => {
      const onQuote = vi.fn();
      render(<ReaderView {...baseProps} onQuote={onQuote} />);
      selectArticleText(0, 4); // "정 주사"

      await userEvent.click(screen.getByRole('button', { name: '아모에게 물어보기' }));

      expect(onQuote).toHaveBeenCalledWith('정 주사');
    });

    it('선택이 풀리면 팝오버도 사라진다', () => {
      render(<ReaderView {...baseProps} onQuote={() => {}} />);
      selectArticleText(0, 4);
      expect(screen.getByRole('button', { name: '아모에게 물어보기' })).toBeInTheDocument();

      window.getSelection()!.removeAllRanges();
      fireEvent(document, new Event('selectionchange'));

      expect(screen.queryByRole('button', { name: '아모에게 물어보기' })).not.toBeInTheDocument();
    });

    it('onQuote를 넘기지 않으면(부모가 아직 연결 안 함) 팝오버를 그리지 않는다', () => {
      render(<ReaderView {...baseProps} />);
      selectArticleText(0, 4);

      expect(screen.queryByRole('button', { name: '아모에게 물어보기' })).not.toBeInTheDocument();
    });
  });

  describe('2026-08-25: 장 시작 표시 — FR-NAV-001, 상한 대상 아님', () => {
    it('chapterStart가 있으면 본문 위에 장 번호·제목을 보여준다', () => {
      render(<ReaderView {...baseProps} chapterStart={{ chapter_no: 8, title: '조그마한 사업' }} />);

      expect(screen.getByText('제 8장')).toBeInTheDocument();
      expect(screen.getByText('조그마한 사업')).toBeInTheDocument();
    });

    it('chapterStart가 없으면(장 중간 페이지) 아무것도 보여주지 않는다', () => {
      render(<ReaderView {...baseProps} chapterStart={null} />);

      expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
    });
  });

  describe('2026-08-25: 인용 하이라이트 — 챗봇 "선택한 문장" 카드와 같은 문장을 본문에서 강조', () => {
    it('highlightedQuote가 본문 안에 있으면 강조 표시(mark)한다', () => {
      const { container } = render(
        <ReaderView {...baseProps} highlightedQuote="여전히 미두장 앞을" />
      );
      const mark = container.querySelector('mark');
      expect(mark).not.toBeNull();
      expect(mark).toHaveTextContent('여전히 미두장 앞을');
    });

    it('highlightedQuote가 없으면(null) 강조하지 않는다', () => {
      const { container } = render(<ReaderView {...baseProps} highlightedQuote={null} />);
      expect(container.querySelector('mark')).toBeNull();
    });

    it('highlightedQuote가 본문에 없으면(다른 페이지 등) 원문을 그대로 보여준다 — 지어내지 않는다', () => {
      const { container } = render(
        <ReaderView {...baseProps} highlightedQuote="본문에 전혀 없는 문장입니다" />
      );
      expect(container.querySelector('mark')).toBeNull();
      expect(screen.getByText(/미두장 앞을 서성이고/)).toBeInTheDocument();
    });
  });
});
