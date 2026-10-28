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

  const people = screen.getByRole('region', { name: '인물' });
  fireEvent.click(within(people).getByText('가'));
  expect(within(people).getByText('나 → 가')).toBeInTheDocument();
  expect(within(people).getByText('가 → 나')).toBeInTheDocument();
  expect(within(people).getByText('나는 가를 질투한다.', { selector: 'p' })).toBeVisible();
  expect(within(people).getByText('가는 나에게 중매를 제안했다.')).toBeInTheDocument();
  expect(within(people).getByText('사건')).toBeInTheDocument();
});

it('FR-CHR-001: 소문·전달자·종료 상태와 실제 받은 근거를 분리해서 읽을 수 있다', () => {
  const edge = relationshipFixture('rumor', 8, {
    assertion_status: 'rumor',
    attribution: '마을 사람들',
    state: 'ended',
    summary: '마을 사람들은 나가 가를 시기했다고 말했다.',
    evidence: { source_page: 5, quote: '그들이 그렇게 말했다.', start_char: 3, end_char: 16 },
    change_evidence: {
      source_page: 8,
      quote: '이제 그 마음은 사라졌다.',
      start_char: 0,
      end_char: 16,
    },
  });
  render(<RelationshipTab graph={{ ...base, edges: [edge] }} failed={false} />);
  const people = screen.getByRole('region', { name: '인물' });
  fireEvent.click(within(people).getByText('가'));
  expect(within(people).getByText('소문')).toBeInTheDocument();
  expect(within(people).getByText('종료')).toBeInTheDocument();
  expect(within(people).getByText('전달·판단 주체: 마을 사람들')).toBeInTheDocument();
  const disclosure = within(people).getByText('근거 보기 · 5p').closest('details')!;
  expect(disclosure).not.toHaveAttribute('open');
  fireEvent.click(within(disclosure).getByText('근거 보기 · 5p'));
  expect(disclosure).toHaveAttribute('open');
  expect(within(disclosure).getByText('그들이 그렇게 말했다.')).toBeInTheDocument();
  expect(within(people).getByText('변경 근거 · 8p')).toBeInTheDocument();
});

it('FR-CHR-001: 과거 데이터는 임의 화살표나 검증 표시 없이 방향 미검증으로 표시한다', () => {
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
  expect(within(people).getByText('방향 미검증')).toBeInTheDocument();
  expect(within(people).queryByText(/근거 보기/)).not.toBeInTheDocument();
  expect(screen.getByText(/이전 관계 이력이 없는 응답/)).toBeInTheDocument();
});
