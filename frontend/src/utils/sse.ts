import type { SseFrame } from '../types';

/**
 * SSE 프레임 파서 — backend/SSE_SPEC.md (R2 리캡 · R3 챗봇 공통 형식, 8/20 확정)
 *
 * EventSource 를 쓰지 않는다: 두 스트림 모두 POST + 본문 + X-Device-Id 헤더가 필요한데
 * EventSource 는 GET 전용이고 헤더를 실을 수 없다. fetch 로 읽은 청크를 여기에 밀어 넣는다.
 *
 * 청크 경계는 프레임 경계와 무관하므로 미완결 조각을 버퍼에 남겨 다음 청크와 잇는다.
 */
export function createSseParser() {
  let buffer = '';

  return {
    /** 받은 청크를 넣고, 이번에 완성된 프레임들을 순서대로 돌려받는다 */
    push(chunk: string): SseFrame[] {
      buffer += chunk;

      const frames: SseFrame[] = [];
      let boundary = buffer.indexOf('\n\n');

      while (boundary !== -1) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);

        const frame = parseBlock(block);
        if (frame) frames.push(frame);

        boundary = buffer.indexOf('\n\n');
      }

      return frames;
    },
  };
}

function parseBlock(block: string): SseFrame | null {
  const line = block.split('\n').find((it) => it.startsWith('data:'));
  if (!line) return null; // 주석(: keepalive)·빈 줄

  try {
    // 깨진 프레임 하나 때문에 스트림 전체를 멈추지 않는다 — 그 줄만 버리고 이어간다.
    return JSON.parse(line.slice('data:'.length).trim()) as SseFrame;
  } catch {
    return null;
  }
}
