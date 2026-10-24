import { cloudEnabled } from '../cloud/api';
import { Link } from 'react-router';
import type { User } from '@supabase/supabase-js';
import { RequireAccount } from './RequireAccount';
import { ProjectList } from '../projects/ProjectList';
import { useAuth } from './context';
import { AuthLayout } from './AuthLayout';
import { LogoutButton } from './LogoutButton';
import { ButtonLink } from '../../components/ui/Button';
export default function Dashboard() {
  const { user } = useAuth();
  return (
    <RequireAccount>
      {user && <AccountDashboard key={user.id} user={user} />}
    </RequireAccount>
  );
}
function AccountDashboard({ user }: { user: User }) {
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
        <ProjectList />
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
        <div>
          <h2>The EEG workspace is always open.</h2>
          <p>
            {cloudEnabled
              ? 'Open a project to upload or reopen a private EDF. Session annotations can be exported as JSON; they are not saved to cloud projects.'
              : 'Explore synthetic EEG or your local EDF recordings. Project details persist; recordings and annotations are not saved to projects yet.'}
          </p>
        </div>
        <ButtonLink to="/app" variant="secondary">
          Open EEG workspace ↗
        </ButtonLink>
      </section>
    </AuthLayout>
  );
}
