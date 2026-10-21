import { Link, Navigate } from 'react-router';
import { useAuth } from './context';
import { AuthLayout } from './AuthLayout';
import { LogoutButton } from './LogoutButton';
import { Button, ButtonLink } from '../../components/ui/Button';
export default function Dashboard() {
  const { status, user, notice, retry, signedOut } = useAuth();
  if (status === 'guest' || status === 'unconfigured')
    return (
      <Navigate
        to={
          signedOut
            ? '/login?status=signed-out'
            : notice
              ? '/login?reason=expired'
              : '/login?next=/dashboard'
        }
        replace
      />
    );
  if (status !== 'authenticated' || !user)
    return (
      <AuthLayout wide>
        <section className="account-wait" role="status">
          <h1>
            {status === 'error'
              ? 'Reconnect to your account'
              : 'Opening your account…'}
          </h1>
          <p>{notice}</p>
          {status === 'error' && (
            <>
              <Button onClick={retry}>Retry session</Button>
              <LogoutButton />
            </>
          )}
          <Link to="/app">Continue with the guest demo</Link>
        </section>
      </AuthLayout>
    );
  const displayName =
    typeof user.user_metadata?.full_name === 'string'
      ? user.user_metadata.full_name
      : typeof user.user_metadata?.name === 'string'
        ? user.user_metadata.name
        : 'Researcher';
  const providers = Array.isArray(user.app_metadata?.providers)
    ? user.app_metadata.providers
        .filter((p: unknown) => typeof p === 'string')
        .join(', ')
    : 'Email';
  return (
    <AuthLayout wide>
      <div className="dashboard-top">
        <span className="account-eyebrow">YOUR ACCOUNT / RESEARCH PREVIEW</span>
        <details className="account-menu">
          <summary>Account settings</summary>
          <div>
            <Link to="/reset-password">Change password</Link>
            <a href="#account-profile">View profile</a>
            <LogoutButton />
            <p>
              Logout applies to this browser. Account deletion is not available
              yet.
            </p>
          </div>
        </details>
      </div>
      <div className="dashboard-heading">
        <h1>
          Welcome, <span>{displayName.slice(0, 100)}.</span>
        </h1>
        <p>A place to begin your next investigation.</p>
      </div>
      <div className="dashboard-grid">
        <section className="dashboard-work">
          <span className="account-eyebrow">01 / THE WORKSPACE</span>
          <h2>Follow the signal.</h2>
          <p>
            Explore the synthetic demo, inspect native samples, and keep
            observations connected to the waveform.
          </p>
          <ButtonLink to="/app">
            Open EEG workspace <span aria-hidden="true">↗</span>
          </ButtonLink>
          <span className="account-hint">
            Session-only work · Export to keep a copy
          </span>
        </section>
        <section id="account-profile" className="dashboard-profile">
          <div className="profile-monogram" aria-hidden="true">
            {displayName.slice(0, 1).toUpperCase()}
          </div>
          <h2>Your profile</h2>
          <dl>
            <dt>Email</dt>
            <dd>{user.email || 'No email supplied'}</dd>
            <dt>Email status</dt>
            <dd>{user.email_confirmed_at ? 'Verified' : 'Not verified'}</dd>
            <dt>Sign-in providers</dt>
            <dd>{providers}</dd>
            <dt>Account created</dt>
            <dd>
              {new Date(user.created_at).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </dd>
          </dl>
        </section>
      </div>
      <section className="dashboard-empty">
        <span className="account-eyebrow">02 / WHAT COMES NEXT</span>
        <div>
          <h2>Your research, with continuity.</h2>
          <p>
            Persistent research projects arrive in Phase 4B. No projects,
            recordings, or annotations are stored in your account yet.
          </p>
        </div>
        <span className="account-badge">Not available yet</span>
      </section>
    </AuthLayout>
  );
}
