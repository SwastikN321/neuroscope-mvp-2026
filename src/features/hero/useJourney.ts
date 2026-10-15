/* eslint react-hooks/immutability: off -- Shared imperative input connects native scroll to the renderer without frame-by-frame React state. */
import { useEffect, type RefObject } from 'react';
import { journeyState, clamp01 } from './journey';
import type { SceneInput } from './sceneState';

/** Passive native scrolling; one eased progress value drives DOM and WebGL. */
export function useJourney(
  root: RefObject<HTMLDivElement | null>,
  input: RefObject<SceneInput>,
  still: boolean,
) {
  useEffect(() => {
    const element = root.current;
    if (!element || still) {
      input.current.scroll = 0;
      if (element) {
        [
          '--journey-progress',
          '--hero-opacity',
          '--hero-shift',
          '--network-opacity',
          '--signal-opacity',
          '--signal-shift',
        ].forEach((key) => element.style.removeProperty(key));
        element
          .querySelectorAll<HTMLElement>('[data-hero-copy]')
          .forEach((node) => {
            node.inert = false;
          });
      }
      return;
    }
    let raf = 0,
      previous = 0,
      progress = 0,
      target = 0;
    const heroCopy = element.querySelectorAll<HTMLElement>('[data-hero-copy]');
    const signalCopy = element.querySelector<HTMLElement>('.signal-content');
    function frame(now: number) {
      const dt = previous ? Math.min((now - previous) / 1000, 0.05) : 0.016;
      previous = now;
      progress += (target - progress) * (1 - Math.exp(-12 * dt));
      if (Math.abs(target - progress) < 0.0001) progress = target;
      input.current.scroll = progress;
      const s = journeyState(progress);
      const style = element!.style;
      style.setProperty('--journey-progress', String(progress));
      style.setProperty('--hero-opacity', String(s.heroText));
      style.setProperty('--hero-shift', `${-s.center * 65}px`);
      style.setProperty('--network-opacity', String(s.networkText));
      style.setProperty('--signal-opacity', String(s.signalText));
      style.setProperty('--signal-shift', `${(1 - s.signalText) * 26}px`);
      element!.dataset.chapter =
        progress < 0.25 ? 'sculpture' : progress < 0.7 ? 'network' : 'signal';
      heroCopy.forEach((node) => {
        node.inert = progress > 0.24;
      });
      if (signalCopy) signalCopy.inert = progress < 0.7;
      input.current.invalidate?.();
      raf = progress !== target ? requestAnimationFrame(frame) : 0;
      if (!raf) previous = 0;
    }
    function measure() {
      const rect = element!.getBoundingClientRect();
      const sticky = element!.querySelector<HTMLElement>('.cinematic-hero')!;
      target = clamp01(
        -rect.top / Math.max(1, rect.height - sticky.offsetHeight),
      );
      if (!raf) raf = requestAnimationFrame(frame);
    }
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(measure);
    observer?.observe(element);
    measure();
    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
      window.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [root, input, still]);
}
