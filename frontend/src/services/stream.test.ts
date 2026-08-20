import { readSseStream } from './stream';
import type { SseFrame } from '../types';

/** 청크를 순서대로 흘려보내는 스트림을 만든다 */
function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<SseFrame[]> {
  const frames: SseFrame[] = [];
  for await (const frame of readSseStream(stream)) frames.push(frame);
  return frames;
}

/**
 * SSE 스트림 수신 — backend/SSE_SPEC.md
 *
 * EventSource 를 쓸 수 없다(POST 본문 + X-Device-Id 헤더). fetch 응답 본문을 직접 읽는다.
 */
describe('SSE 스트림 수신', () => {
  it('프레임을 받은 순서대로 흘려준다', async () => {
    const frames = await collect(
      streamOf(
        'data: {"type":"delta","text":"정"}\n\n',
        'data: {"type":"delta","text":"주사"}\n\n',
        'data: {"type":"done","applied_cutoff":20}\n\n'
      )
    );

    expect(frames).toEqual([
      { type: 'delta', text: '정' },
      { type: 'delta', text: '주사' },
      { type: 'done', applied_cutoff: 20 },
    ]);
  });

  it('네트워크 청크가 프레임 중간에서 잘려도 이어 붙여 읽는다', async () => {
    const frames = await collect(streamOf('data: {"type":"del', 'ta","text":"고무신"}\n\n'));
    expect(frames).toEqual([{ type: 'delta', text: '고무신' }]);
  });

  it('한 청크에 여러 프레임이 몰려 와도 모두 읽는다', async () => {
    const frames = await collect(
      streamOf('data: {"type":"delta","text":"가"}\n\ndata: {"type":"done"}\n\n')
    );
    expect(frames).toHaveLength(2);
  });

  it('done 을 받으면 거기서 끝낸다 — 뒤에 뭐가 더 와도 읽지 않는다', async () => {
    const frames = await collect(
      streamOf('data: {"type":"done"}\n\ndata: {"type":"delta","text":"유령"}\n\n')
    );

    expect(frames).toEqual([{ type: 'done' }]);
  });

  it('error 프레임도 그대로 넘겨준다 — 처리 방식은 호출부가 정한다', async () => {
    const frames = await collect(
      streamOf('data: {"type":"delta","text":"정"}\n\ndata: {"type":"error","message":"failed"}\n\n')
    );

    expect(frames).toEqual([
      { type: 'delta', text: '정' },
      { type: 'error', message: 'failed' },
    ]);
  });
});
