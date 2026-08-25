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
    expect(screen.getByLabelText('시점 되감기').className).toContain('bg-brief-accent');
  });

  describe('되감기 트랙 — 전체 분량 표시', () => {
    it('트랙 오른쪽 끝에 전체 페이지 수를 표시한다 — 조작 가능한 손잡이는 여전히 읽은 범위 안이다', () => {
      render(<RelationshipTab graph={graph} failed={false} totalPages={10} />);

      expect(screen.getByText('1p')).toBeInTheDocument();
      expect(screen.getByText('10p')).toBeInTheDocument();
      // 조작 범위(max)는 여전히 눈금(milestones) 개수 기준이다 — 전체 페이지 수로 안 늘어난다
      expect(screen.getByLabelText('시점 되감기')).toHaveAttribute('max', '2');
      expect(screen.getByTestId('graph-scrub-unread')).toBeInTheDocument();
    });

    it('아직 못 읽은 구간이 없으면(totalPages 미제공) 비활성 막대를 그리지 않는다', () => {
      render(<RelationshipTab graph={graph} failed={false} />);

      // 눈금 중 가장 늦은 페이지(5) 그대로 오른쪽 끝 라벨로 쓴다
      expect(screen.getByText('5p')).toBeInTheDocument();
      expect(screen.queryByTestId('graph-scrub-unread')).not.toBeInTheDocument();
    });

    it('totalPages가 읽은 범위보다 작게 와도(있을 수 없는 값) 찌그러지지 않는다', () => {
      render(<RelationshipTab graph={graph} failed={false} totalPages={2} />);

      expect(screen.getByText('5p')).toBeInTheDocument();
      expect(screen.queryByTestId('graph-scrub-unread')).not.toBeInTheDocument();
    });
  });

  describe('인물 검색', () => {
    it('이름으로 검색하면 일치하는 인물이 검색 결과에 나온다', () => {
      render(<RelationshipTab graph={graph} failed={false} />);
      fireEvent.change(screen.getByLabelText('인물 검색'), { target: { value: '초봉' } });

      const results = screen.getByRole('listbox', { name: '인물 검색 결과' });
      expect(within(results).getByText('초봉')).toBeInTheDocument();
      expect(within(results).queryByText('정주사')).not.toBeInTheDocument();
    });

    it('별칭으로도 검색된다', () => {
      render(<RelationshipTab graph={graph} failed={false} />);
      fireEvent.change(screen.getByLabelText('인물 검색'), { target: { value: '정 주사' } });

      const results = screen.getByRole('listbox', { name: '인물 검색 결과' });
      expect(within(results).getByText('정주사')).toBeInTheDocument();
    });

    it('검색 결과를 선택하면 그 인물이 포커스(선택)된다 — 관계 라벨이 카드에 나온다', () => {
      render(<RelationshipTab graph={graph} failed={false} />);
      fireEvent.change(screen.getByLabelText('인물 검색'), { target: { value: '정주사' } });

      const results = screen.getByRole('listbox', { name: '인물 검색 결과' });
      fireEvent.click(within(results).getByText('정주사'));

      const people = screen.getByRole('region', { name: '인물' });
      expect(within(people).getByText('부녀', { exact: false })).toBeInTheDocument();
    });

    it('선택 후에는 검색창이 비워지고 결과 목록이 닫힌다', () => {
      render(<RelationshipTab graph={graph} failed={false} />);
      const input = screen.getByLabelText('인물 검색');
      fireEvent.change(input, { target: { value: '정주사' } });
      fireEvent.click(within(screen.getByRole('listbox', { name: '인물 검색 결과' })).getByText('정주사'));

      expect(input).toHaveValue('');
      expect(screen.queryByRole('listbox', { name: '인물 검색 결과' })).not.toBeInTheDocument();
    });

    it('일치하는 인물이 없으면 안내 문구가 나온다', () => {
      render(<RelationshipTab graph={graph} failed={false} />);
      fireEvent.change(screen.getByLabelText('인물 검색'), { target: { value: '없는이름' } });

      expect(screen.getByText('일치하는 인물 없음')).toBeInTheDocument();
    });

    it('되감아 아직 등장하지 않은 인물은 검색되지 않는다', () => {
      render(<RelationshipTab graph={graph} failed={false} />);
      // 1페이지 시점으로 되감기 — 정주사만 있고 초봉은 아직 없다
      fireEvent.change(screen.getByLabelText('시점 되감기'), { target: { value: '0' } });

      fireEvent.change(screen.getByLabelText('인물 검색'), { target: { value: '초봉' } });
      expect(screen.getByText('일치하는 인물 없음')).toBeInTheDocument();
    });
  });

  describe('주요인물/전체 토글', () => {
    /**
     * 인물 10명 — 기본 상한(MAJOR_CHARACTER_TOP_N=8)보다 많아야 "주요인물"이 실제로
     * 뭔가를 걸러내는지 확인할 수 있다(6명짜리였던 예전 픽스처는 8 이하라 전부 통과해
     * 걸러지는 게 없었다). 연결 수: hub=9, 유씨·형주=3(동점), 병주·박주사=2(동점),
     * 고참봉·윤서기·한영감·최차부·제중당 주인=1(다섯 명 동점) — 상위 8명은
     * hub·유씨·형주·병주·박주사·고참봉·윤서기·한영감이고, 동점 tie-break(먼저 등장한
     * 인물 우선, graphFilter.test.ts 참고)으로 최차부·제중당 주인이 밀려난다.
     */
    const tenCharacterGraph: GraphResponse = {
      nodes: [
        { id: 'hub', name: '정주사', first_appearance_page: 1, aliases: [] },
        { id: 'byeongju', name: '병주', first_appearance_page: 2, aliases: [] },
        { id: 'yuci', name: '유씨', first_appearance_page: 3, aliases: [] },
        { id: 'hyeongju', name: '형주', first_appearance_page: 4, aliases: [] },
        { id: 'parkjusa', name: '박주사', first_appearance_page: 5, aliases: [] },
        { id: 'gochambong', name: '고참봉', first_appearance_page: 6, aliases: [] },
        { id: 'yunseogi', name: '윤서기', first_appearance_page: 7, aliases: [] },
        { id: 'hanyeonggam', name: '한영감', first_appearance_page: 8, aliases: [] },
        { id: 'choichabu', name: '최차부', first_appearance_page: 9, aliases: [] },
        { id: 'yakgukjuin', name: '제중당 주인', first_appearance_page: 10, aliases: [] },
      ],
      edges: [
        { source: 'hub', target: 'byeongju', label: '지인', established_page: 2 },
        { source: 'hub', target: 'yuci', label: '지인', established_page: 3 },
        { source: 'hub', target: 'hyeongju', label: '지인', established_page: 4 },
        { source: 'hub', target: 'parkjusa', label: '지인', established_page: 5 },
        { source: 'hub', target: 'gochambong', label: '지인', established_page: 6 },
        { source: 'hub', target: 'yunseogi', label: '지인', established_page: 7 },
        { source: 'hub', target: 'hanyeonggam', label: '지인', established_page: 8 },
        { source: 'hub', target: 'choichabu', label: '지인', established_page: 9 },
        { source: 'hub', target: 'yakgukjuin', label: '거래', established_page: 10 },
        { source: 'byeongju', target: 'yuci', label: '지인', established_page: 3 },
        { source: 'yuci', target: 'hyeongju', label: '지인', established_page: 4 },
        { source: 'hyeongju', target: 'parkjusa', label: '지인', established_page: 5 },
      ],
    };

    it('기본값은 "주요인물"이다 — 상한(8명)을 넘는 인물 수는 연결 수 하위부터 걸러진다', () => {
      render(<RelationshipTab graph={tenCharacterGraph} failed={false} />);

      const people = screen.getByRole('region', { name: '인물' });
      expect(within(people).getByRole('button', { name: '주요인물' })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      expect(within(people).getByText('인물 8')).toBeInTheDocument();
      expect(within(people).getByText('정주사')).toBeInTheDocument();
      expect(within(people).queryByText('최차부')).not.toBeInTheDocument();
      expect(within(people).queryByText('제중당 주인')).not.toBeInTheDocument();
    });

    it('"전체"를 누르면 걸러졌던 인물이 다 보인다', () => {
      render(<RelationshipTab graph={tenCharacterGraph} failed={false} />);
      const people = screen.getByRole('region', { name: '인물' });

      fireEvent.click(within(people).getByRole('button', { name: '전체' }));

      expect(within(people).getByText('인물 10')).toBeInTheDocument();
      expect(within(people).getByText('최차부')).toBeInTheDocument();
    });

    it('다시 "주요인물"을 누르면 도로 걸러진다', () => {
      render(<RelationshipTab graph={tenCharacterGraph} failed={false} />);
      const people = screen.getByRole('region', { name: '인물' });

      fireEvent.click(within(people).getByRole('button', { name: '전체' }));
      fireEvent.click(within(people).getByRole('button', { name: '주요인물' }));

      expect(within(people).getByText('인물 8')).toBeInTheDocument();
      expect(within(people).queryByText('최차부')).not.toBeInTheDocument();
    });

    it('걸러진 인물도 검색으로 찾아 선택하면 "전체"로 전환되며 보인다 — 완전히 숨기지 않는다', () => {
      render(<RelationshipTab graph={tenCharacterGraph} failed={false} />);
      const people = screen.getByRole('region', { name: '인물' });

      expect(within(people).queryByText('최차부')).not.toBeInTheDocument(); // 기본값이 이미 주요인물

      fireEvent.change(screen.getByLabelText('인물 검색'), { target: { value: '최차부' } });
      fireEvent.click(within(screen.getByRole('listbox', { name: '인물 검색 결과' })).getByText('최차부'));

      expect(within(people).getByRole('button', { name: '전체' })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      expect(within(people).getByText('최차부')).toBeInTheDocument();
      expect(within(people).getByText('지인', { exact: false })).toBeInTheDocument();
    });

    it('전체 인물 수가 상한 이하면 "주요인물"이어도 아무도 안 걸러진다', () => {
      // graph 픽스처(정주사·초봉, 2명)는 상한(8)보다 적다 — 절대 임계값 방식(이전
      // 구현)이었다면 아무도 기준을 못 넘어 화면이 텅 빌 수 있었는데, 상위 N 방식에선
      // 그런 "전원 탈락" 상태 자체가 없다(2026-08-25, "많다가 어느 순간 확 줄어드는
      // 현상" 재발 방지).
      render(<RelationshipTab graph={graph} failed={false} />);
      const people = screen.getByRole('region', { name: '인물' });

      expect(within(people).getByRole('button', { name: '주요인물' })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      expect(within(people).getByText('인물 2')).toBeInTheDocument();
      expect(within(people).getByText('정주사')).toBeInTheDocument();
      expect(within(people).getByText('초봉')).toBeInTheDocument();
    });

    it('등장한 인물 자체가 없으면(진도 최초) 그 사실을 알린다', () => {
      const empty: GraphResponse = { nodes: [], edges: [] };
      render(<RelationshipTab graph={empty} failed={false} />);

      expect(screen.getByText('아직 등장한 인물이 없습니다.')).toBeInTheDocument();
    });
  });

  describe('전체화면', () => {
    it('전체화면 버튼을 누르면 그래프가 화면을 덮는 오버레이로 열린다', () => {
      render(<RelationshipTab graph={graph} failed={false} />);

      fireEvent.click(screen.getByRole('button', { name: '전체화면' }));

      expect(screen.getByTestId('relationship-graph-fullscreen-overlay')).toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: '인물 관계도 전체화면' })).toBeInTheDocument();
    });

    it('전체화면에서 같은 버튼을 다시 누르면 닫힌다', () => {
      render(<RelationshipTab graph={graph} failed={false} />);

      fireEvent.click(screen.getByRole('button', { name: '전체화면' }));
      fireEvent.click(screen.getByRole('button', { name: '전체화면 종료' }));

      expect(screen.queryByTestId('relationship-graph-fullscreen-overlay')).not.toBeInTheDocument();
    });

    it('그래프 밖(오버레이 배경)을 누르면 닫힌다', () => {
      render(<RelationshipTab graph={graph} failed={false} />);

      fireEvent.click(screen.getByRole('button', { name: '전체화면' }));
      fireEvent.click(screen.getByTestId('relationship-graph-fullscreen-overlay'));

      expect(screen.queryByTestId('relationship-graph-fullscreen-overlay')).not.toBeInTheDocument();
    });

    it('그래프 안쪽을 눌러도 전체화면이 닫히지 않는다', () => {
      render(<RelationshipTab graph={graph} failed={false} />);

      fireEvent.click(screen.getByRole('button', { name: '전체화면' }));
      fireEvent.click(screen.getByRole('dialog', { name: '인물 관계도 전체화면' }));

      expect(screen.getByTestId('relationship-graph-fullscreen-overlay')).toBeInTheDocument();
    });

    it('Esc 를 누르면 닫힌다', () => {
      render(<RelationshipTab graph={graph} failed={false} />);

      fireEvent.click(screen.getByRole('button', { name: '전체화면' }));
      fireEvent.keyDown(window, { key: 'Escape' });

      expect(screen.queryByTestId('relationship-graph-fullscreen-overlay')).not.toBeInTheDocument();
    });
  });
});
