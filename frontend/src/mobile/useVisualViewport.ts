import { useEffect, useState } from 'react';

const KEYBOARD_MIN_HEIGHT = 120;

interface ViewportState {
  height: number;
  offsetTop: number;
  keyboardOpen: boolean;
}

function read(): ViewportState {
  const viewport = window.visualViewport;
  const height = viewport?.height ?? window.innerHeight;
  const scale = viewport?.scale ?? 1;
  return {
    height,
    offsetTop: viewport?.offsetTop ?? 0,
    keyboardOpen: window.innerHeight - height * scale > KEYBOARD_MIN_HEIGHT,
  };
}

// NFR-USE
export function useVisualViewport(): ViewportState {
  const [state, setState] = useState(read);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => setState(read());
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, []);

  return state;
}
