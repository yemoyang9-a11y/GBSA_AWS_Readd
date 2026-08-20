import { Component, type ReactNode } from 'react';

/** 실패는 미노출이 원칙이다 — 부분 렌더로 넘어가지 않는다 (FR-SPL-005 🚦) */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return <div role="alert">문제가 발생했습니다</div>;
    }
    return this.props.children;
  }
}
