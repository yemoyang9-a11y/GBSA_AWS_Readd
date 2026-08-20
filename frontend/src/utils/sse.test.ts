import { createSseParser } from './sse';

/**
 * SSE 프레임 파서 — backend/SSE_SPEC.md (8/20 R2·R3 확정 형식)
 *   data: {"type":"delta","text":"..."}\n\n
 *   data: {"type":"done","applied_cutoff":79}\n\n
 *   data: {"type":"error","message":"..."}\n\n
 *
 * EventSource 를 쓰지 않는 이유: 두 스트림 모두 POST + 본문 + X-Device-Id 헤더가 필요한데
 * EventSource 는 GET 전용이고 헤더를 실을 수 없다. fetch 로 받은 청크를 이 파서가 처리한다.
 */
describe('SSE 프레임 파서', () => {
  it('delta 프레임 하나를 읽는다', () => {
    const parser = createSseParser();
    expect(parser.push('data: {"type":"delta","text":"정주사"}\n\n')).toEqual([
      { type: 'delta', text: '정주사' },
    ]);
  });

  it('한 청크에 여러 프레임이 들어와도 순서대로 모두 읽는다', () => {
    const parser = createSseParser();
    const frames = parser.push(
      'data: {"type":"delta","text":"정"}\n\ndata: {"type":"delta","text":"주사"}\n\n'
    );
    expect(frames).toEqual([
      { type: 'delta', text: '정' },
      { type: 'delta', text: '주사' },
    ]);
  });

  it('프레임이 청크 경계에서 잘려도 다음 청크와 이어 붙여 읽는다', () => {
    const parser = createSseParser();

    expect(parser.push('data: {"type":"delta","te')).toEqual([]);
    expect(parser.push('xt":"고무신"}\n\n')).toEqual([{ type: 'delta', text: '고무신' }]);
  });

  it('done 프레임의 applied_cutoff 를 함께 읽는다 (NFR-OBS-003)', () => {
    const parser = createSseParser();
    expect(parser.push('data: {"type":"done","applied_cutoff":79}\n\n')).toEqual([
      { type: 'done', applied_cutoff: 79 },
    ]);
  });

  it('error 프레임의 message 를 읽는다', () => {
    const parser = createSseParser();
    expect(parser.push('data: {"type":"error","message":"Stream processing failed"}\n\n')).toEqual([
      { type: 'error', message: 'Stream processing failed' },
    ]);
  });

  it('주석 줄(keepalive)과 빈 줄은 프레임으로 세지 않는다', () => {
    const parser = createSseParser();
    expect(parser.push(': keepalive\n\n')).toEqual([]);
  });

  it('깨진 JSON 한 줄 때문에 스트림 전체가 멈추지 않는다 — 그 줄만 버리고 이어간다', () => {
    const parser = createSseParser();
    const frames = parser.push('data: {깨진\n\ndata: {"type":"delta","text":"계속"}\n\n');
    expect(frames).toEqual([{ type: 'delta', text: '계속' }]);
  });
});
