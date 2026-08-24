import { act, renderHook } from '@testing-library/react';
import { usePanelResize } from './usePanelResize';

function fireMouseEvent(target: EventTarget, type: string, clientX: number) {
  const event = new MouseEvent(type, { clientX, bubbles: true });
  target.dispatchEvent(event);
}

describe('usePanelResize', () => {
  it('초기 폭은 minWidth다', () => {
    const { result } = renderHook(() => usePanelResize({ minWidth: 380, getMaxWidth: () => 800 }));
    expect(result.current.width).toBe(380);
  });

  it('핸들을 왼쪽으로 드래그하면(더 왼쪽 = 더 넓게) 폭이 늘어난다', () => {
    const { result } = renderHook(() => usePanelResize({ minWidth: 380, getMaxWidth: () => 800 }));

    act(() => {
      result.current.handleProps.onMouseDown({
        clientX: 500,
        preventDefault: () => {},
      } as unknown as React.MouseEvent);
    });
    expect(result.current.isDragging).toBe(true);

    act(() => {
      fireMouseEvent(window, 'mousemove', 460); // 40px 왼쪽으로 — 패널이 40px 넓어진다
    });
    expect(result.current.width).toBe(420);

    act(() => {
      fireMouseEvent(window, 'mouseup', 460);
    });
    expect(result.current.isDragging).toBe(false);
  });

  it('minWidth보다 좁아지지 않는다', () => {
    const { result } = renderHook(() => usePanelResize({ minWidth: 380, getMaxWidth: () => 800 }));
    act(() => {
      result.current.handleProps.onMouseDown({
        clientX: 500,
        preventDefault: () => {},
      } as unknown as React.MouseEvent);
    });
    act(() => {
      fireMouseEvent(window, 'mousemove', 700); // 오른쪽으로 200px — 패널이 좁아지려 한다
    });
    expect(result.current.width).toBe(380);
  });

  it('getMaxWidth()보다 넓어지지 않는다', () => {
    const { result } = renderHook(() => usePanelResize({ minWidth: 380, getMaxWidth: () => 500 }));
    act(() => {
      result.current.handleProps.onMouseDown({
        clientX: 500,
        preventDefault: () => {},
      } as unknown as React.MouseEvent);
    });
    act(() => {
      fireMouseEvent(window, 'mousemove', 0); // 왼쪽으로 500px — max(500)를 넘으려 한다
    });
    expect(result.current.width).toBe(500);
  });
});
