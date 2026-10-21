import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { Button } from '../../components/ui/Button';
import { authClient, authConfig, authError } from './client';
import { callbackUrl, safeNext } from './config';
import { useAuth } from './context';
import { AuthLayout } from './AuthLayout';
import { LogoutButton } from './LogoutButton';

type Mode = 'login' | 'signup' | 'forgot' | 'reset';
const titles = {
  login: 'Welcome back.',
  signup: 'A clearer perspective starts here.',
  forgot: 'Find your way back.',
  reset: 'A fresh start.',
};
export default function AuthPage({ mode }: { mode: Mode }) {
  const auth = useAuth(),
    navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false),
    [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const configured = !!authClient && !!authConfig;
  const resetAllowed = auth.status === 'authenticated';
  if (
    auth.status === 'authenticated' &&
    (mode === 'login' || mode === 'signup')
  )
    return <Navigate to={next} replace />;
  function ready() {
    if (!configured) {
      setError(
        'Account sign-in is not configured in this build. The guest demo is available.',
      );
      return false;
    }
    if (authConfig!.siteUrl !== window.location.origin) {
      setError(
        'Account redirects are configured for a different site address. Please contact the site owner.',
      );
      return false;
    }
    return true;
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (mode !== 'reset' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    if (
      (mode === 'login' && !password) ||
      ((mode === 'signup' || mode === 'reset') &&
        (password.length < 12 || password.length > 128))
    ) {
      setError(
        mode === 'login'
          ? 'Enter your password.'
          : 'Use a password between 12 and 128 characters.',
      );
      return;
    }
    if ((mode === 'signup' || mode === 'reset') && password !== confirm) {
      setError('The passwords do not match.');
      return;
    }
    if (!ready() || !authClient || !authConfig) return;
    if (mode === 'reset' && !resetAllowed) {
      setError('Open a fresh password recovery link or log in first.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'login') {
        const result = await authClient.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (result.error) throw result.error;
        if (!result.data.session) throw new Error('No confirmed session');
        setPassword('');
        navigate(next, { replace: true });
      } else if (mode === 'signup') {
        const result = await authClient.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: callbackUrl(authConfig) },
        });
        if (result.error) throw result.error;
        setPassword('');
        setConfirm('');
        if (result.data.session) navigate('/dashboard', { replace: true });
        else
          setMessage(
            'Check your inbox. If registration can proceed, you will receive a verification link. Open it in this browser to finish. Already registered? Log in instead.',
          );
      } else if (mode === 'forgot') {
        const { error } = await authClient.auth.resetPasswordForEmail(
          email.trim(),
          { redirectTo: callbackUrl(authConfig, '/reset-password') },
        );
        if (error) throw error;
        setMessage(
          'If an account is eligible, a recovery link will arrive shortly. Check your inbox and spam folder, and open the link in this browser.',
        );
      } else {
        const { error } = await authClient.auth.updateUser({ password });
        if (error) throw error;
        setPassword('');
        setConfirm('');
        setMessage(
          'Your password has been updated. You can return to your account.',
        );
      }
    } catch (failure) {
      setError(authError(failure));
    } finally {
      setBusy(false);
    }
  }
  async function oauth(provider: 'google' | 'github') {
    setError('');
    setMessage('');
    if (!ready() || !authClient || !authConfig) return;
    setBusy(true);
    try {
      const { error } = await authClient.auth.signInWithOAuth({
        provider,
        options: { redirectTo: callbackUrl(authConfig, next) },
      });
      if (error) throw error;
      setMessage('Opening your sign-in provider…');
    } catch (failure) {
      setError(authError(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthLayout>
      {(mode === 'login' || mode === 'signup') && (
        <nav className="account-tabs" aria-label="Account access">
          <Link
            to="/login"
            aria-current={mode === 'login' ? 'page' : undefined}
          >
            Log in
          </Link>
          <Link
            to="/signup"
            aria-current={mode === 'signup' ? 'page' : undefined}
          >
            Sign up
          </Link>
        </nav>
      )}
      <span className="account-eyebrow">
        {mode === 'forgot' || mode === 'reset'
          ? 'ACCOUNT RECOVERY'
          : 'YOUR NEUROSCOPE ACCOUNT'}
      </span>
      <h1>{titles[mode]}</h1>
      <p className="account-description">
        {mode === 'login'
          ? 'Log in to your account. Your next question awaits.'
          : mode === 'signup'
            ? 'Create your research account. Keep your project plans together.'
            : mode === 'forgot'
              ? 'Enter your account email to request a password reset.'
              : 'Choose a strong, unique password for your account.'}
      </p>
      {!configured && (
        <p className="account-notice" role="status">
          Account sign-in is not configured in this build. You can still{' '}
          <Link to="/app">explore the guest demo</Link>.
        </p>
      )}
      {auth.notice &&
        !(auth.signedOut && params.get('status') === 'signed-out') && (
          <p className="account-notice" role="status">
            {auth.notice}
          </p>
        )}
      {mode === 'login' && params.get('status') === 'signed-out' && (
        <p className="account-notice" role="status">
          You have logged out of this browser.
        </p>
      )}
      {mode === 'login' && params.get('reason') === 'expired' && (
        <p className="account-notice" role="status">
          Your session ended. Log in again to access your account.
        </p>
      )}
      {auth.status === 'error' && (
        <div className="account-retry">
          <Button variant="secondary" onClick={auth.retry}>
            Retry session
          </Button>
          <LogoutButton />
        </div>
      )}
      {mode === 'reset' && !resetAllowed ? (
        <div className="account-notice" role="status">
          {auth.status === 'loading' ? (
            'Checking your session…'
          ) : (
            <>
              Open a fresh recovery link in the browser where you requested it,
              or <Link to="/login?next=/reset-password">log in</Link>.{' '}
              <Link to="/forgot-password">Request a new link</Link>.
            </>
          )}
        </div>
      ) : (
        <>
          {(mode === 'login' || mode === 'signup') && (
            <>
              <div className="account-providers">
                <Button
                  variant="secondary"
                  disabled={busy || !configured}
                  onClick={() => void oauth('google')}
                >
                  <span aria-hidden="true" className="provider-mark">
                    G
                  </span>
                  Continue with Google
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy || !configured}
                  onClick={() => void oauth('github')}
                >
                  <span aria-hidden="true" className="provider-mark">
                    GH
                  </span>
                  Continue with GitHub
                </Button>
              </div>
              <div className="account-divider">or continue with email</div>
            </>
          )}
          <form
            onSubmit={(e) => void submit(e)}
            noValidate
            aria-label={`${mode} form`}
          >
            <fieldset disabled={busy}>
              {mode !== 'reset' && (
                <label>
                  Email address
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    maxLength={254}
                  />
                </label>
              )}
              {mode !== 'forgot' && (
                <>
                  <label>
                    {mode === 'reset' ? 'New password' : 'Password'}
                    <span className="account-password">
                      <input
                        name="password"
                        aria-label={
                          mode === 'reset' ? 'New password' : 'Password'
                        }
                        type={showPassword ? 'text' : 'password'}
                        autoComplete={
                          mode === 'login' ? 'current-password' : 'new-password'
                        }
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        maxLength={mode === 'login' ? undefined : 128}
                        aria-describedby={
                          mode === 'login' ? undefined : 'password-policy'
                        }
                      />
                      <button
                        type="button"
                        aria-label={
                          showPassword ? 'Hide password' : 'Show password'
                        }
                        aria-pressed={showPassword}
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? 'Hide' : 'Show'}
                      </button>
                    </span>
                  </label>
                  {mode !== 'login' && (
                    <p className="account-hint" id="password-policy">
                      12–128 characters. Use a unique password.
                    </p>
                  )}
                </>
              )}
              {(mode === 'signup' || mode === 'reset') && (
                <label>
                  Confirm password
                  <input
                    name="confirm-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    maxLength={128}
                  />
                </label>
              )}
              {mode === 'login' && (
                <Link className="account-forgot" to="/forgot-password">
                  Forgot password?
                </Link>
              )}
              {error && (
                <p className="account-error" role="alert">
                  {error}
                </p>
              )}
              {message && (
                <p className="account-notice" role="status">
                  {message}
                </p>
              )}
              <Button
                type="submit"
                className="account-submit"
                disabled={!configured}
              >
                {busy
                  ? 'Please wait…'
                  : mode === 'login'
                    ? 'Log in'
                    : mode === 'signup'
                      ? 'Create account'
                      : mode === 'forgot'
                        ? 'Send recovery link'
                        : 'Update password'}{' '}
                <span aria-hidden="true">↗</span>
              </Button>
            </fieldset>
          </form>
        </>
      )}
      <p className="account-bottom">
        {mode === 'reset' ? (
          <Link to="/dashboard">Return to your account</Link>
        ) : mode === 'forgot' ? (
          <Link to="/login">Back to log in</Link>
        ) : (
          <>
            Not ready for an account?{' '}
            <Link to="/app">Try NeuroScope first.</Link>
          </>
        )}
      </p>
      <p className="account-privacy">
        Projects save their name and description only. EEG recordings and
        annotations are not saved to your account. Export your work before
        leaving the workspace.
      </p>
    </AuthLayout>
  );
}
