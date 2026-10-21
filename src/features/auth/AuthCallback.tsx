import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { authClient, exchangeOnce } from './client';
import { safeNext } from './config';
import { AuthLayout } from './AuthLayout';
export default function AuthCallback() {
  const location = useLocation(),
    navigate = useNavigate();
  const initial = useRef({ search: location.search, hash: location.hash });
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams(initial.current.search);
    const hash = new URLSearchParams(initial.current.hash.slice(1));
    // Strip one-time codes and provider errors from the address bar/history immediately.
    window.history.replaceState(
      window.history.state,
      '',
      window.location.pathname,
    );
    async function finish() {
      try {
        if (!authClient) throw new Error('unconfigured');
        if (
          params.has('error') ||
          hash.has('error') ||
          hash.has('access_token')
        )
          throw new Error('invalid callback');
        const code = params.get('code');
        if (!code || code.length > 4096 || params.getAll('code').length !== 1)
          throw new Error('missing code');
        const { data, error } = await exchangeOnce(code);
        if (error || !data.session) throw new Error('exchange failed');
        if (alive) navigate(safeNext(params.get('next')), { replace: true });
      } catch {
        if (!alive) return;
        // Email confirmation and the browser's PKCE session exchange are separate.
        // A failed/reused link must not override a server-verified existing account.
        // Never trust cached user metadata or tokens supplied in the failed URL.
        try {
          const verified = await authClient?.auth.getUser();
          if (
            verified &&
            !verified.error &&
            verified.data.user?.email_confirmed_at
          ) {
            // A failed recovery callback does not establish a recovery flow.
            if (alive) navigate('/dashboard', { replace: true });
            return;
          }
        } catch {
          // Network failures cannot establish a confirmed account.
        }
        if (alive)
          setError(
            'Sign-in from this link could not be completed. Your email may already be confirmed: try logging in with your existing email and password. The link may be expired, already used, or opened in a different browser. If you forgot your password, request a recovery link.',
          );
      }
    }
    void finish();
    return () => {
      alive = false;
    };
  }, [navigate]);
  return (
    <AuthLayout>
      <span className="account-eyebrow">ACCOUNT VERIFICATION</span>
      <h1>{error ? 'Let’s try that again.' : 'Completing your sign-in…'}</h1>
      {error ? (
        <>
          <p className="account-error" role="alert">
            {error}
          </p>
          <div className="account-bottom">
            <Link to="/login">Return to log in</Link>
            <Link to="/forgot-password">Request a recovery link</Link>
          </div>
        </>
      ) : (
        <p role="status" className="account-description">
          Verifying your session with Supabase. This will only take a moment.
        </p>
      )}
    </AuthLayout>
  );
}
