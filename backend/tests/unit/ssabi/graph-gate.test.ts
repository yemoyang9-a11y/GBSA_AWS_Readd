/**
 * 관계도 게이트 테스트
 *
 * FR-SPL-002 🚦: 조회 결과에 기준점 초과 레코드 0건
 * A6: 관계는 최신 라벨만 표시
 *
 * ⚠️ 테스트를 먼저 쓴다 (구현 후에 쓰면 잘못된 상한을 그대로 굳힌다)
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  FakeSsabiRepository,
  createTestFixture,
} from '../../../src/modules/ssabi/__mocks__/fake-repository';
import { createGraphService } from '../../../src/modules/ssabi/graph.service';

describe('FR-SPL-002 🚦: 관계도 스포일러 상한', () => {
  let repository: FakeSsabiRepository;

  beforeEach(() => {
    const fixture = createTestFixture();
    repository = new FakeSsabiRepository(fixture);
  });

  describe('인물 필터링', () => {
    it('K=20: 초반 인물 2명만 보임 (정주사, 초봉)', async () => {
      const characters = await repository.findCharacters('takryu', 20);

      expect(characters).toHaveLength(2);
      expect(characters.map((c) => c.name)).toEqual(['정주사', '초봉']);

      // FR-SPL-002 🚦: 모든 인물의 first_appearance_page <= 20
      for (const char of characters) {
        expect(char.first_appearance_page).toBeLessThanOrEqual(20);
      }
    });

    it('K=130: 중반 인물 4명 보임 (장형보는 안 보임)', async () => {
      const characters = await repository.findCharacters('takryu', 130);

      expect(characters).toHaveLength(4);
      expect(characters.map((c) => c.name)).toEqual(['정주사', '초봉', '계봉', '고태수']);

      // FR-SPL-002 🚦: 모든 인물의 first_appearance_page <= 130
      for (const char of characters) {
        expect(char.first_appearance_page).toBeLessThanOrEqual(130);
      }

      // Positive: 장형보는 150페이지 등장이므로 제외
      expect(characters.find((c) => c.name === '장형보')).toBeUndefined();
    });

    it('Positive + Negative: K=20에서 안 보이던 계봉이 K=130에서는 보임', async () => {
      const atK20 = await repository.findCharacters('takryu', 20);
      const atK130 = await repository.findCharacters('takryu', 130);

      // Negative: K=20에서 계봉 없음
      expect(atK20.find((c) => c.name === '계봉')).toBeUndefined();

      // Positive: K=130에서 계봉 있음
      expect(atK130.find((c) => c.name === '계봉')).toBeDefined();
    });
  });

  describe('관계 필터링 + A6 최신 라벨', () => {
    it('K=20: 부녀 관계 1개만 보임', async () => {
      const relationships = await repository.findLatestRelationships('takryu', 20);

      expect(relationships).toHaveLength(1);
      expect(relationships[0].label).toBe('부녀');

      // FR-SPL-002 🚦: 모든 관계의 established_page <= 20
      for (const rel of relationships) {
        expect(rel.established_page).toBeLessThanOrEqual(20);
      }
    });

    it('K=130: 3개 관계 보임 (초봉-고태수는 최신 라벨 "연인"만)', async () => {
      const relationships = await repository.findLatestRelationships('takryu', 130);

      expect(relationships).toHaveLength(3);

      // FR-SPL-002 🚦: 모든 관계의 established_page <= 130
      for (const rel of relationships) {
        expect(rel.established_page).toBeLessThanOrEqual(130);
      }

      // A6: 초봉-고태수 관계는 "연인"만 (120페이지, "낯선 사이" 100페이지는 덮임)
      const choBongTaesu = relationships.find(
        (r) => r.character_a_id === 'char-2' && r.character_b_id === 'char-4'
      );
      expect(choBongTaesu?.label).toBe('연인');
      expect(choBongTaesu?.established_page).toBe(120);

      // Negative: "낯선 사이" 라벨은 없어야 함
      const oldLabel = relationships.find(
        (r) =>
          r.character_a_id === 'char-2' &&
          r.character_b_id === 'char-4' &&
          r.label === '낯선 사이'
      );
      expect(oldLabel).toBeUndefined();
    });

    it('K=130: 장형보 관계는 안 보임 (150페이지 초과)', async () => {
      const relationships = await repository.findLatestRelationships('takryu', 130);

      // Negative: 초봉-장형보 관계 없음 (160페이지)
      const withJangHyungbo = relationships.find(
        (r) => r.character_a_id === 'char-2' && r.character_b_id === 'char-5'
      );
      expect(withJangHyungbo).toBeUndefined();
    });

    it('Positive + Negative: K=20에서 안 보이던 관계가 K=130에서는 보임', async () => {
      const atK20 = await repository.findLatestRelationships('takryu', 20);
      const atK130 = await repository.findLatestRelationships('takryu', 130);

      // Negative: K=20에서 계봉-고태수 관계 없음
      expect(
        atK20.find((r) => r.character_a_id === 'char-3' && r.character_b_id === 'char-4')
      ).toBeUndefined();

      // Positive: K=130에서 계봉-고태수 관계 있음
      expect(
        atK130.find((r) => r.character_a_id === 'char-3' && r.character_b_id === 'char-4')
      ).toBeDefined();
    });
  });

  describe('별칭 필터링', () => {
    it('K=20: 별칭 2개 보임 (주사, 봉이)', async () => {
      const aliases = await repository.findAliases('takryu', 20);

      expect(aliases).toHaveLength(2);
      expect(aliases.map((a) => a.alias)).toEqual(['주사', '봉이']);

      // FR-SPL-002 🚦: 모든 별칭의 first_appearance_page <= 20
      for (const alias of aliases) {
        expect(alias.first_appearance_page).toBeLessThanOrEqual(20);
      }
    });

    it('K=130: 별칭 2개 보임 (형보 별칭은 150페이지라 안 보임)', async () => {
      const aliases = await repository.findAliases('takryu', 130);

      expect(aliases).toHaveLength(2);

      // Negative: 형보 별칭 없음
      expect(aliases.find((a) => a.alias === '형보')).toBeUndefined();
    });
  });

  describe('인물 노트 필터링', () => {
    it('K=20: 노트 2개 보임 (초봉 미인 노트는 25페이지라 안 보임)', async () => {
      const notes = await repository.findCharacterNotes('takryu', 20);

      expect(notes).toHaveLength(2);
      expect(notes.map((n) => n.note)).toEqual([
        '고무신 장사로 돈을 모았다.',
        '정주사의 딸이다.',
      ]);

      // FR-SPL-002 🚦: 모든 노트의 source_page <= 20
      for (const note of notes) {
        expect(note.source_page).toBeLessThanOrEqual(20);
      }
    });

    it('K=130: 노트 3개 보임', async () => {
      const notes = await repository.findCharacterNotes('takryu', 130);

      expect(notes).toHaveLength(3);

      // Positive: 초봉 미인 노트 포함
      expect(notes.find((n) => n.note === '미인으로 소문났다.')).toBeDefined();
    });
  });

  describe('R5: 배경지식 상한 없음 (FR-BGK-002 🚦)', () => {
    it('K=1, K=130 모두 같은 배경지식 반환', async () => {
      const atK1 = await repository.getBackgroundKnowledge('takryu', 1);
      const atK130 = await repository.getBackgroundKnowledge('takryu', 130);

      expect(atK1).toBe(atK130);
      expect(atK1).toContain('일제강점기');
      expect(atK1).toContain('채만식');
    });
  });

  describe('관계도 그래프 조립 (getGraph)', () => {
    it('K=20: 인물 2명, 관계 1개, 별칭 2개', async () => {
      const graph = await repository.getGraph('takryu', 20);

      // 노드 검증
      expect(graph.nodes).toHaveLength(2);
      expect(graph.nodes.map((n) => n.name)).toEqual(['정주사', '초봉']);

      // FR-SPL-002 🚦: 모든 노드의 first_appearance_page <= 20
      for (const node of graph.nodes) {
        expect(node.first_appearance_page).toBeLessThanOrEqual(20);
      }

      // 간선 검증
      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0].label).toBe('부녀');

      // FR-SPL-002 🚦: 모든 간선의 established_page <= 20
      for (const edge of graph.edges) {
        expect(edge.established_page).toBeLessThanOrEqual(20);
      }

      // 별칭 검증
      const jungJusa = graph.nodes.find((n) => n.name === '정주사');
      expect(jungJusa?.aliases).toEqual(['주사']);

      const choBong = graph.nodes.find((n) => n.name === '초봉');
      expect(choBong?.aliases).toEqual(['봉이']);
    });

    it('K=130: 인물 4명, 관계 3개 (최신 라벨)', async () => {
      const graph = await repository.getGraph('takryu', 130);

      // 노드 검증
      expect(graph.nodes).toHaveLength(4);

      // FR-SPL-002 🚦: 모든 노드의 first_appearance_page <= 130
      for (const node of graph.nodes) {
        expect(node.first_appearance_page).toBeLessThanOrEqual(130);
      }

      // Negative: 장형보 노드 없음 (150페이지)
      expect(graph.nodes.find((n) => n.name === '장형보')).toBeUndefined();

      // 간선 검증
      expect(graph.edges).toHaveLength(3);

      // FR-SPL-002 🚦: 모든 간선의 established_page <= 130
      for (const edge of graph.edges) {
        expect(edge.established_page).toBeLessThanOrEqual(130);
      }

      // A6: 초봉-고태수는 "연인" (최신)
      const choBongTaesu = graph.edges.find(
        (e) => e.source === 'char-2' && e.target === 'char-4'
      );
      expect(choBongTaesu?.label).toBe('연인');
    });

    it('Positive + Negative: K=20과 K=130 비교', async () => {
      const atK20 = await repository.getGraph('takryu', 20);
      const atK130 = await repository.getGraph('takryu', 130);

      // Negative: K=20에서 계봉 없음
      expect(atK20.nodes.find((n) => n.name === '계봉')).toBeUndefined();

      // Positive: K=130에서 계봉 있음
      expect(atK130.nodes.find((n) => n.name === '계봉')).toBeDefined();

      // 노드 수 증가 확인
      expect(atK130.nodes.length).toBeGreaterThan(atK20.nodes.length);
      expect(atK130.edges.length).toBeGreaterThan(atK20.edges.length);
    });
  });

  describe('graph.service 통합', () => {
    it('서비스 레이어도 cutoff 기준 필터링 유지', async () => {
      const service = createGraphService({ repository });

      const graph = await service.getGraph('takryu', 20);

      // FR-SPL-002 🚦: 서비스를 거쳐도 상한 적용
      expect(graph.nodes).toHaveLength(2);
      expect(graph.edges).toHaveLength(1);

      for (const node of graph.nodes) {
        expect(node.first_appearance_page).toBeLessThanOrEqual(20);
      }

      for (const edge of graph.edges) {
        expect(edge.established_page).toBeLessThanOrEqual(20);
      }
    });
  });
});
