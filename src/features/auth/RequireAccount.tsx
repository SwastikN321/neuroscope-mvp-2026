import type { ReactNode } from 'react';
import { Link, Navigate } from 'react-router';
import { useAuth } from './context';
import { AuthLayout } from './AuthLayout';
import { LogoutButton } from './LogoutButton';
import { Button } from '../../components/ui/Button';
export function RequireAccount({ children }: { children: ReactNode }) {
  const { status, user, notice, retry, signedOut } = useAuth();
  if (status === 'guest' || status === 'unconfigured')
    return (
      <Navigate
        replace
        to={
          signedOut
            ? '/login?status=signed-out'
            : notice
              ? '/login?reason=expired'
              : '/login?next=/dashboard'
        }
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
              <Button variant="secondary" onClick={retry}>
                Retry session
              </Button>
              <LogoutButton />
            </>
          )}
          <Link to="/app">Continue with the guest demo</Link>
        </section>
      </AuthLayout>
    );
  return children;
}
