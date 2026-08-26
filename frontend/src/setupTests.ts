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

// jsdom엔 Element.scrollIntoView도 없다 — RelationshipTab.tsx가 선택된 인물 카드로
// 스크롤하기 시작한 뒤(6b919ba, 검색/선택 시 하단 카드 목록 스크롤) 같은 이유로 깨진다.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
