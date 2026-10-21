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
        if (alive)
          setError(
            'This sign-in link could not be completed. It may be expired, already used, or opened in a different browser. Try logging in again or request a new recovery link.',
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
