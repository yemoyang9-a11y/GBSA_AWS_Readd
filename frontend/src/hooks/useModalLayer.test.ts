import { renderHook } from '@testing-library/react';
import { useModalLayer } from './useModalLayer';

function setup() {
  const dialog = document.createElement('div');
  dialog.tabIndex = -1;
  const button = document.createElement('button');
  document.body.append(button, dialog);
  return {
    dialog,
    button,
    dialogRef: { current: dialog },
    returnFocusRef: { current: button },
    cleanup: () => {
      dialog.remove();
      button.remove();
    },
  };
}

describe('useModalLayer', () => {
  it('active가 되면 대화상자로 포커스를 옮긴다', () => {
    const s = setup();
    const { rerender } = renderHook(
      ({ active }) =>
        useModalLayer({
          active,
          dialogRef: s.dialogRef,
          returnFocusRef: s.returnFocusRef,
          onClose: () => {},
        }),
      { initialProps: { active: false } }
    );
    expect(document.activeElement).not.toBe(s.dialog);
    rerender({ active: true });
    expect(document.activeElement).toBe(s.dialog);
    s.cleanup();
  });

  it('active일 때만 Esc가 onClose를 부른다', () => {
    const s = setup();
    const onClose = vi.fn();
    const { rerender } = renderHook(
      ({ active }) =>
        useModalLayer({
          active,
          dialogRef: s.dialogRef,
          returnFocusRef: s.returnFocusRef,
          onClose,
        }),
      { initialProps: { active: false } }
    );
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onClose).not.toHaveBeenCalled();

    rerender({ active: true });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(onClose).not.toHaveBeenCalled();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender({ active: false });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    s.cleanup();
  });

  it('닫히면 returnFocusRef 요소로 포커스를 돌려준다', () => {
    const s = setup();
    const { rerender } = renderHook(
      ({ active }) =>
        useModalLayer({
          active,
          dialogRef: s.dialogRef,
          returnFocusRef: s.returnFocusRef,
          onClose: () => {},
        }),
      { initialProps: { active: true } }
    );
    expect(document.activeElement).toBe(s.dialog);
    rerender({ active: false });
    expect(document.activeElement).toBe(s.button);
    s.cleanup();
  });

  it('렌더마다 새 onClose를 넘겨도 포커스를 다시 옮기지 않는다', () => {
    const s = setup();
    const { rerender } = renderHook(
      () =>
        useModalLayer({
          active: true,
          dialogRef: s.dialogRef,
          returnFocusRef: s.returnFocusRef,
          onClose: () => {},
        })
    );
    s.button.focus();
    rerender();
    expect(document.activeElement).toBe(s.button);
    s.cleanup();
  });
});
