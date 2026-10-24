import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';

export function RouteEffects() {
  const { pathname, hash, key } = useLocation();
  const previousPath = useRef(pathname);
  useEffect(() => {
    const pathChanged = pathname !== previousPath.current;
    previousPath.current = pathname;
    const titles: Record<string, string> = {
      '/app': 'Workspace',
      '/login': 'Log in',
      '/signup': 'Sign up',
      '/forgot-password': 'Account recovery',
      '/reset-password': 'New password',
      '/auth/callback': 'Verifying account',
      '/dashboard': 'Your account',
    };
    document.title =
      pathname === '/'
        ? 'NeuroScope — See beyond the signal'
        : `${pathname.startsWith('/dashboard/projects/') ? 'Research project' : pathname.startsWith('/app/recordings/') ? 'Private EEG workspace' : titles[pathname] || 'Page not found'} — NeuroScope`;
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
