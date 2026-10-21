import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../../components/ui/Button';
import { authError } from './client';
import { useAuth } from './context';
export function LogoutButton() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const navigate = useNavigate();
  const { logout: endSession } = useAuth();
  async function logout() {
    setBusy(true);
    setError('');
    try {
      await endSession();
      navigate('/login?status=signed-out', { replace: true });
    } catch (failure) {
      setError(authError(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <Button variant="secondary" disabled={busy} onClick={() => void logout()}>
        {busy ? 'Logging out…' : 'Log out'}
      </Button>
      {error && (
        <p role="alert" className="account-error">
          {error}
        </p>
      )}
    </div>
  );
}
