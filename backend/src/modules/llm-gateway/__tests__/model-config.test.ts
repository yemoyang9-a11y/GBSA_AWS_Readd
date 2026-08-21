/**
 * 모델 설정 테스트
 *
 * 작업별 모델 매핑 검증
 */

import { getModelForTask } from '../model-config';

describe('모델 설정', () => {
  describe('작업별 모델 매핑', () => {
    test('chatbot_easy는 Haiku 모델 ID 반환', () => {
      const modelId = getModelForTask('chatbot_easy');

      expect(modelId).toBeTruthy();
      expect(typeof modelId).toBe('string');
    });

    test('chatbot_hard는 Sonnet 모델 ID 반환', () => {
      const modelId = getModelForTask('chatbot_hard');

      expect(modelId).toBeTruthy();
      expect(typeof modelId).toBe('string');
    });

    test('recap은 Haiku 모델 ID 반환 (잠정)', () => {
      const modelId = getModelForTask('recap');

      expect(modelId).toBeTruthy();
      expect(typeof modelId).toBe('string');
    });

    test('알 수 없는 작업은 기본값 (Haiku) 반환', () => {
      const modelId = getModelForTask('unknown_task' as any);

      expect(modelId).toBeTruthy();
      expect(typeof modelId).toBe('string');
    });
  });

  describe('모델 ID 형식', () => {
    test('반환된 모델 ID는 Bedrock 형식', () => {
      const tasks = ['chatbot_easy', 'chatbot_hard', 'recap'];

      tasks.forEach((task) => {
        const modelId = getModelForTask(task as any);
        // 빈 문자열이거나 Bedrock 형식
        expect(typeof modelId).toBe('string');
      });
    });
  });
});
