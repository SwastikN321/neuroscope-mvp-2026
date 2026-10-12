import { useSyncExternalStore } from 'react';
import type { Rotation } from './rotation';

export type SceneInput = {
  pointerX: number;
  pointerY: number;
  rotation: Rotation;
  dragging: boolean;
  paused: boolean;
};
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (notify) => {
      if (!window.matchMedia) return () => {};
      const media = window.matchMedia(query);
      media.addEventListener('change', notify);
      return () => media.removeEventListener('change', notify);
    },
    () => window.matchMedia?.(query).matches ?? false,
    () => false,
  );
}

export function webGLAvailable() {
  if (typeof WebGL2RenderingContext === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2');
    if (!context) return false;
    context.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}
