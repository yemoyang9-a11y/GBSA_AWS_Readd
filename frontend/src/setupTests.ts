import '@testing-library/jest-dom/vitest';

// jsdom엔 ResizeObserver가 없다 — RelationshipGraph.tsx가 이를 쓰기 시작한 뒤
// (b6cf5a5, 인접 인물 방향 카메라 치우침) 이 전역 스텁 없이는 그래프를 마운트하는
// 테스트가 전부 "ResizeObserver is not defined"로 깨진다.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
