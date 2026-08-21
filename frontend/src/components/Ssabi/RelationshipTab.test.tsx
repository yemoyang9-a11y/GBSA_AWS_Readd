import { render, screen, within } from '@testing-library/react';
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
 * ⚠️ 인물 이름은 그래프 노드와 인물 카드 **양쪽**에 나온다. 전역 쿼리는 다중 매치로
 *    실패하므로 aria-label 로 구획한 영역 안에서 찾는다.
 */
describe('RelationshipTab', () => {
  it('NFR-USE-006: 관계 라벨을 글자로 병기한다 — 색상만으로 구분하지 않는다', () => {
    render(<RelationshipTab graph={graph} failed={false} />);

    // 그래프가 뜨지 않는 환경에서도 라벨이 글자로 남아야 한다 — 관계 목록에서 확인한다
    const relations = screen.getByRole('region', { name: '관계' });
    expect(within(relations).getByText('부녀')).toBeInTheDocument();
  });

  it('인물 이름과 별칭을 카드로 렌더한다', () => {
    render(<RelationshipTab graph={graph} failed={false} />);

    const people = screen.getByRole('region', { name: '인물' });
    expect(within(people).getByText('정주사')).toBeInTheDocument();
    expect(within(people).getByText('초봉')).toBeInTheDocument();
    expect(within(people).getByText('정 주사')).toBeInTheDocument();
  });

  it('FR-SPL-005 🚦: 조회 실패는 부분 표시로 넘어가지 않는다', () => {
    render(<RelationshipTab graph={null} failed={true} />);

    expect(screen.getByRole('alert')).toHaveTextContent('관계도를 불러오지 못했습니다');
    expect(screen.queryByText('정주사')).not.toBeInTheDocument();
    expect(screen.queryByText('부녀')).not.toBeInTheDocument();
  });
});
