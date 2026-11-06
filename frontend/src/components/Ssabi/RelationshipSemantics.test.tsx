import { fireEvent, render, screen, within } from '@testing-library/react';
import RelationshipTab from './RelationshipTab';
import { relationshipFixture } from './relationshipFixture';
import type { GraphResponse } from '../../types';

const base: GraphResponse = {
  nodes: [
    { id: 'a', name: '가', first_appearance_page: 1, aliases: [] },
    { id: 'b', name: '나', first_appearance_page: 1, aliases: [] },
  ],
  edges: [],
};

it('FR-CHR-001: UUID 슬롯 대신 명시된 방향을 그리고 평행 관계를 모두 보여준다', () => {
  const reverse = relationshipFixture('jealousy');
  const event = {
    ...relationshipFixture('match', 6, {
      direction: 'a_to_b',
      kind: 'action',
      temporal_scope: 'event',
      summary: '가는 나에게 중매를 제안했다.',
    }),
    label: '중매',
  };
  const { container } = render(
    <RelationshipTab graph={{ ...base, edges: [reverse, event] }} failed={false} />
  );
  const paths = [...container.querySelectorAll('path[data-edge-id]')];
  expect(paths).toHaveLength(2);
  expect(new Set(paths.map((p) => p.getAttribute('d'))).size).toBe(2);
  const reversePath = container.querySelector('[data-edge-id="jealousy"]')!;
  expect(reversePath).toHaveAttribute('marker-start');
  expect(reversePath).not.toHaveAttribute('marker-end');
  const forwardPath = container.querySelector('[data-edge-id="match"]')!;
  expect(forwardPath).toHaveAttribute('marker-end');
  expect(forwardPath).not.toHaveAttribute('marker-start');
});

it('FR-CHR-001: 소문·종료 관계는 그래프에서 점선으로 구분한다', () => {
  const rumor = relationshipFixture('rumor', 8, { assertion_status: 'rumor', state: 'ended' });
  const { container } = render(
    <RelationshipTab graph={{ ...base, edges: [rumor] }} failed={false} />
  );
  expect(container.querySelector('[data-edge-id="rumor"]')).toHaveAttribute('stroke-dasharray');
});

it('FR-CHR-001: 과거 데이터는 임의 화살표 없이 그리고 방향 미검증 표시를 하지 않는다', () => {
  const { container } = render(
    <RelationshipTab
      graph={{ ...base, edges: [{ source: 'a', target: 'b', label: '질투', established_page: 5 }] }}
      failed={false}
    />
  );
  const path = container.querySelector('path[data-edge-id]')!;
  expect(path).not.toHaveAttribute('marker-start');
  expect(path).not.toHaveAttribute('marker-end');
  const people = screen.getByRole('region', { name: '인물' });
  fireEvent.click(within(people).getByText('가'));
  expect(screen.queryByText(/방향 미검증/)).not.toBeInTheDocument();
  expect(screen.getByText(/이전 관계 이력이 없는 응답/)).toBeInTheDocument();
});
