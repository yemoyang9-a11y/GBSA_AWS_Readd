import { fireEvent, render, screen, within } from '@testing-library/react';
import RelationshipTab from './RelationshipTab';
import type { GraphResponse } from '../../types';

const graph: GraphResponse = {
  nodes: [
    { id: 'c1', name: '정주사', first_appearance_page: 1, aliases: ['정 주사'] },
    { id: 'c2', name: '초봉', first_appearance_page: 3, aliases: [] },
  ],
  edges: [{ source: 'c1', target: 'c2', label: '부녀', established_page: 5 }],
};

/**
 * 인물 관계도 탭 — FR-SVB-002, FR-SPL-005 🚦, NFR-USE-006
 *
 * ⚠️ 정책 변경(2026-08-24, 지도형 리디자인) — 관계 라벨은 더 이상 항상 펼쳐져 있지
 *    않다. 인물 카드를 선택(그래프 클릭과 동등)해야 그 인물의 관계가 글자로 나온다.
 *    NFR-USE-006("라벨을 글자로 병기, 색상만으로 구분하지 않는다")의 검증 지점이
 *    "항상 보임"에서 "선택하면 보임"으로 옮겨졌다 — 라벨이 사라진 게 아니라 위치가
 *    바뀐 것이다.
 *
 * ⚠️ 인물 이름은 그래프 노드와 인물 카드 **양쪽**에 나온다. 전역 쿼리는 다중 매치로
 *    실패하므로 aria-label 로 구획한 영역 안에서 찾는다.
 */
describe('RelationshipTab', () => {
  it('NFR-USE-006: 인물을 선택하면 관계 라벨이 글자로 나온다 — 색상만으로 구분하지 않는다', () => {
    render(<RelationshipTab graph={graph} failed={false} />);

    const people = screen.getByRole('region', { name: '인물' });
    fireEvent.click(within(people).getByText('정주사'));

    expect(within(people).getByText('부녀', { exact: false })).toBeInTheDocument();
  });

  it('선택하지 않으면 관계 라벨이 카드에 없다', () => {
    render(<RelationshipTab graph={graph} failed={false} />);

    const people = screen.getByRole('region', { name: '인물' });
    expect(within(people).queryByText('부녀', { exact: false })).not.toBeInTheDocument();
  });

  it('같은 인물을 다시 선택하면 접힌다', () => {
    render(<RelationshipTab graph={graph} failed={false} />);

    const people = screen.getByRole('region', { name: '인물' });
    const card = within(people).getByText('정주사');
    fireEvent.click(card);
    expect(within(people).getByText('부녀', { exact: false })).toBeInTheDocument();

    fireEvent.click(card);
    expect(within(people).queryByText('부녀', { exact: false })).not.toBeInTheDocument();
  });

  it('인물 이름과 별칭을 카드로 렌더한다', () => {
    render(<RelationshipTab graph={graph} failed={false} />);

    const people = screen.getByRole('region', { name: '인물' });
    expect(within(people).getByText('정주사')).toBeInTheDocument();
    expect(within(people).getByText('초봉')).toBeInTheDocument();
    expect(within(people).getByText('정 주사')).toBeInTheDocument();
  });

  it('되감기 슬라이더의 오른쪽 끝이 현재 진도다 — 처음에는 받은 것 전부가 보인다', () => {
    render(<RelationshipTab graph={graph} failed={false} />);

    const scrub = screen.getByLabelText('시점 되감기');
    // 눈금은 받은 데이터에서 만들어진다 — 정주사(1)·초봉(3)·부녀(5)
    expect(scrub).toHaveValue('2');
    expect(screen.getByText('현재까지')).toBeInTheDocument();

    const people = screen.getByRole('region', { name: '인물' });
    expect(within(people).getByText('초봉')).toBeInTheDocument();
  });

  it('되감으면 그 시점 이후에 등장한 인물·관계가 사라진다', async () => {
    render(<RelationshipTab graph={graph} failed={false} />);

    // 1페이지 시점 — 정주사만 있고 초봉도 관계도 아직 없다
    fireEvent.change(screen.getByLabelText('시점 되감기'), { target: { value: '0' } });

    expect(screen.getByText('1페이지 시점')).toBeInTheDocument();
    const people = screen.getByRole('region', { name: '인물' });
    expect(within(people).getByText('정주사')).toBeInTheDocument();
    expect(within(people).queryByText('초봉')).not.toBeInTheDocument();

    // 이 시점의 정주사를 선택해도 관계는 아직 확립 전이라 안 나온다
    fireEvent.click(within(people).getByText('정주사'));
    expect(within(people).queryByText('부녀', { exact: false })).not.toBeInTheDocument();
  });

  it('FR-SPL-005 🚦: 조회 실패는 부분 표시로 넘어가지 않는다', () => {
    render(<RelationshipTab graph={null} failed={true} />);

    expect(screen.getByRole('alert')).toHaveTextContent('관계도를 불러오지 못했습니다');
    expect(screen.queryByText('정주사')).not.toBeInTheDocument();
    expect(screen.queryByText('부녀')).not.toBeInTheDocument();
  });

  it('인물 카드는 brief 톤 카드 스타일을 쓴다 (미선택 상태)', () => {
    render(<RelationshipTab graph={graph} failed={false} />);
    const people = screen.getByRole('region', { name: '인물' });
    const card = within(people).getByText('정주사').closest('button')!;
    expect(card.className).toContain('bg-white');
    expect(card.className).toContain('border-brief-rule');
  });

  it('되감기 슬라이더는 brief-accent 를 쓴다', () => {
    render(<RelationshipTab graph={graph} failed={false} />);
    expect(screen.getByLabelText('시점 되감기').className).toContain('accent-brief-accent');
  });
});
