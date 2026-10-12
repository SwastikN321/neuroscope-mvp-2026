import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';

export function RouteEffects() {
  const { pathname, hash, key } = useLocation();
  const previousPath = useRef(pathname);
  useEffect(() => {
    const pathChanged = pathname !== previousPath.current;
    previousPath.current = pathname;
    document.title =
      pathname === '/'
        ? 'NeuroScope — See beyond the signal'
        : pathname === '/app'
          ? 'Workspace — NeuroScope'
          : 'Page not found — NeuroScope';
    if (hash) {
      // Wait one frame for the destination page to mount before finding its anchor.
      const frame = requestAnimationFrame(() => {
        const target = document.getElementById(hash.slice(1));
        target?.scrollIntoView();
        target?.focus({ preventScroll: true });
      });
      return () => cancelAnimationFrame(frame);
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (pathChanged) {
      document.getElementById('main-content')?.focus({ preventScroll: true });
    }
  }, [pathname, hash, key]);
  return null;
}
