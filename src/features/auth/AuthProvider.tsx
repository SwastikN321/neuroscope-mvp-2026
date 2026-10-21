import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { authClient } from './client';
import { AuthContext, type AuthState } from './context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: authClient ? 'loading' : 'unconfigured',
    user: null,
    notice: '',
  });
  const [attempt, setAttempt] = useState(0);
  const logoutIntent = useRef(false);
  useEffect(() => {
    if (!authClient) return;
    const client = authClient;
    let alive = true,
      revision = 0,
      hadSession = false;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    function startDeadline(run: number) {
      clearTimeout(deadline);
      deadline = setTimeout(() => {
        if (!alive || run !== revision) return;
        revision++;
        setState({
          status: 'error',
          user: null,
          notice:
            'Session verification timed out. Check your connection and retry, or continue as a guest.',
        });
      }, 15000);
    }
    const tasks = new Set<ReturnType<typeof setTimeout>>();
    function schedule(session: Session | null) {
      const run = ++revision;
      clearTimeout(expiry);
      clearTimeout(deadline);
      if (!session) {
        setState({
          status: 'guest',
          user: null,
          signedOut: logoutIntent.current,
          notice: logoutIntent.current
            ? 'You have logged out of this browser.'
            : hadSession
              ? 'Your session ended. Log in again to access your account.'
              : '',
        });
        return;
      }
      hadSession = true;
      setState({ status: 'loading', user: null, notice: '' });
      startDeadline(run);
      // Never await another Auth operation inside the SDK's locked event callback.
      const task = setTimeout(() => {
        tasks.delete(task);
        void client.auth
          .getUser()
          .then(({ data, error }) => {
            if (!alive || run !== revision) return;
            clearTimeout(deadline);
            if (error || !data.user) {
              setState({
                status: 'error',
                user: null,
                notice:
                  'We could not verify your session. Reconnect and retry, or log out. The guest demo is still available.',
              });
              return;
            }
            const remaining = (session.expires_at ?? 0) * 1000 - Date.now();
            if (remaining <= 0) {
              setState({
                status: 'guest',
                user: null,
                notice: 'Your session expired. Please log in again.',
              });
              return;
            }
            hadSession = true;
            setState({ status: 'authenticated', user: data.user, notice: '' });
            // Fail closed if background refresh fails; check again when a suspended tab resumes.
            expiry = setTimeout(
              () => {
                if (alive && run === revision) void restore();
              },
              Math.min(remaining + 50, 2147483647),
            );
          })
          .catch(() => {
            if (alive && run === revision)
              setState({
                status: 'error',
                user: null,
                notice:
                  'Unable to verify your session. Check your connection and retry.',
              });
          });
      }, 0);
      tasks.add(task);
    }
    async function restore() {
      const run = revision;
      setState({ status: 'loading', user: null, notice: '' });
      startDeadline(run);
      try {
        const { data, error } = await client.auth.getSession();
        if (!alive || run !== revision) return;
        if (error) throw error;
        schedule(data.session);
      } catch {
        if (alive && run === revision)
          setState({
            status: 'error',
            user: null,
            notice:
              'Unable to restore your session. Retry or log out, or continue as a guest.',
          });
      }
    }
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      if (alive) schedule(session);
    });
    const startup = setTimeout(() => {
      void restore();
    }, 0);
    const focus = () => {
      void restore();
    };
    window.addEventListener('focus', focus);
    return () => {
      alive = false;
      revision++;
      subscription.unsubscribe();
      clearTimeout(expiry);
      clearTimeout(deadline);
      clearTimeout(startup);
      tasks.forEach(clearTimeout);
      window.removeEventListener('focus', focus);
    };
  }, [attempt]);
  async function logout() {
    if (!authClient) throw new Error('Authentication is not configured.');
    logoutIntent.current = true;
    try {
      const { error } = await authClient.auth.signOut({ scope: 'local' });
      if (error) throw error;
      setState({
        status: 'guest',
        user: null,
        notice: 'You have logged out of this browser.',
        signedOut: true,
      });
    } finally {
      logoutIntent.current = false;
    }
  }
  return (
    <AuthContext.Provider
      value={{ ...state, retry: () => setAttempt((n) => n + 1), logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}
