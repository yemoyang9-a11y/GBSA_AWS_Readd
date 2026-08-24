import { render, screen } from '@testing-library/react';
import RecapTab from './RecapTab';

describe('RecapTab', () => {
  it('본문은 brief-ink로 강조하고, brief-muted로 저평가하지 않는다', () => {
    render(<RecapTab text="정 주사는 미두장에서 재산을 잃었다." streaming={false} failed={false} />);
    const body = screen.getByText((_, el) => el?.tagName === 'P' && !!el.textContent?.startsWith('정 주사는'));
    expect(body).toHaveClass('text-brief-ink');
    expect(body).not.toHaveClass('text-brief-muted');
  });

  it('스트리밍 표시는 brief-muted를 쓴다', () => {
    render(<RecapTab text="정 주사는" streaming={true} failed={false} />);
    expect(screen.getByText('불러오는 중')).toHaveClass('text-brief-muted');
  });

  it('"지금까지" eyebrow 라벨과 장식용 인용부호를 보여준다', () => {
    render(<RecapTab text="정 주사는" streaming={false} failed={false} />);
    expect(screen.getByText('지금까지')).toBeInTheDocument();
    expect(screen.getByText('"', { exact: true })).toBeInTheDocument();
  });

  it('카드에 brief-rule 테두리를 둔다 (패널과 배경색이 같아 테두리가 유일한 경계다)', () => {
    const { container } = render(<RecapTab text="정 주사" streaming={false} failed={false} />);
    expect(container.firstElementChild?.className).toContain('border-brief-rule');
  });

  it('characterNames에 있는 이름은 굵게 강조한다', () => {
    render(
      <RecapTab
        text="정 주사는 미두장에서 재산을 잃었다."
        streaming={false}
        failed={false}
        characterNames={['정 주사']}
      />
    );
    const bold = screen.getByText('정 주사', { selector: 'b' });
    expect(bold).toHaveClass('font-bold');
  });

  it('characterNames가 없으면 강조 없이 그대로 렌더한다', () => {
    render(<RecapTab text="정 주사는 미두장에서 재산을 잃었다." streaming={false} failed={false} />);
    expect(screen.queryByText('정 주사', { selector: 'b' })).not.toBeInTheDocument();
  });

  it('빈 줄(\\n\\n)로 문단을 나눈다', () => {
    render(
      <RecapTab
        text={'정 주사는 재산을 잃었다.\n\n초봉은 약국에서 일한다.'}
        streaming={false}
        failed={false}
      />
    );
    const paragraphs = screen
      .getAllByText((_, el) => el?.tagName === 'P' && el.className.includes('font-dashSerif'))
      .filter((el) => el.textContent && el.textContent.length > 0);
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]).toHaveTextContent('정 주사는 재산을 잃었다.');
    expect(paragraphs[1]).toHaveTextContent('초봉은 약국에서 일한다.');
  });
});
