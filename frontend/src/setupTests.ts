import '@testing-library/jest-dom/vitest';

/**
 * jsdom 에 없는 브라우저 API 를 채운다.
 *
 * React Flow(@xyflow/react)가 마운트 즉시 ResizeObserver 를 만든다. jsdom 은 이 API 를
 * 구현하지 않아 관계도 탭을 렌더하는 테스트가 전부 ReferenceError 로 죽는다.
 *
 * 이건 **환경 보정이지 우회가 아니다** — 앱 코드에 테스트용 분기를 넣지 않고, 실제
 * 브라우저에 있는 API 를 테스트 환경에도 있게 만드는 것이다. 크기 계산은 jsdom 에서
 * 어차피 0 이므로 콜백을 호출하지 않는 빈 구현으로 충분하다. 좌표 배치의 정확성은
 * graphLayout.test.ts 가 DOM 없이 따로 검증한다.
 */
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
