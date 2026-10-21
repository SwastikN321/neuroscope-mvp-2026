import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMemoryRouter,
  RouterProvider,
  Routes,
  Route,
} from 'react-router';
import type { Session, User } from '@supabase/supabase-js';
import { AuthProvider } from './AuthProvider';
import AuthPage from './AuthPages';
import Dashboard from './Dashboard';
import AuthCallback from './AuthCallback';
vi.mock('../projects/api', async (original) => ({
  ...(await original<typeof import('../projects/api')>()),
  listProjects: vi.fn(async () => ({ projects: [], hasMore: false })),
}));
const sdk = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  signInWithOAuth: vi.fn(),
  exchange: vi.fn(),
}));
vi.mock('./client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./client')>()),
  authClient: { auth: sdk },
  authConfig: {
    url: 'https://example.supabase.co',
    key: 'sb_publishable_test',
    siteUrl: window.location.origin,
    callbackPath: '/auth/callback',
  },
  exchangeOnce: sdk.exchange,
}));
const user: User = {
  id: 'account-test',
  email: 'researcher@example.test',
  app_metadata: { providers: ['email'] },
  user_metadata: { full_name: 'Ada' },
  aud: 'authenticated',
  created_at: '2026-10-01T12:00:00Z',
  email_confirmed_at: '2026-10-01T12:01:00Z',
};
const session: Session = {
  user,
  access_token: 'test-access-not-real',
  refresh_token: 'test-refresh-not-real',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: 'bearer',
};
let listener: (event: string, s: Session | null) => void,
  unsubscribe: ReturnType<typeof vi.fn>;
function mount(path = '/login') {
  const router = createMemoryRouter(
    [
      {
        path: '*',
        element: (
          <AuthProvider>
            <Routes>
              <Route
                path="/login"
                element={<AuthPage key="login" mode="login" />}
              />
              <Route
                path="/signup"
                element={<AuthPage key="signup" mode="signup" />}
              />
              <Route
                path="/forgot-password"
                element={<AuthPage key="forgot" mode="forgot" />}
              />
              <Route
                path="/reset-password"
                element={<AuthPage key="reset" mode="reset" />}
              />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/app" element={<h1>Guest EEG demo</h1>} />
            </Routes>
          </AuthProvider>
        ),
      },
    ],
    { initialEntries: [path] },
  );
  return { ...render(<RouterProvider router={router} />), router };
}
async function credentials(password = 'correct-password') {
  await userEvent.type(
    screen.getByLabelText('Email address'),
    'researcher@example.test',
  );
  await userEvent.type(
    screen.getByLabelText('Password', { exact: true }),
    password,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  unsubscribe = vi.fn();
  sdk.onAuthStateChange.mockImplementation((cb) => {
    listener = cb;
    return { data: { subscription: { unsubscribe } } };
  });
  sdk.getSession.mockResolvedValue({ data: { session: null }, error: null });
  sdk.getUser.mockResolvedValue({ data: { user }, error: null });
  sdk.signUp.mockResolvedValue({ data: { session: null }, error: null });
  sdk.signInWithPassword.mockImplementation(async () => {
    await Promise.resolve();
    sdk.getSession.mockResolvedValue({ data: { session }, error: null });
    listener('SIGNED_IN', session);
    return { data: { session }, error: null };
  });
  sdk.signOut.mockImplementation(async () => {
    sdk.getSession.mockResolvedValue({ data: { session: null }, error: null });
    listener('SIGNED_OUT', null);
    return { error: null };
  });
  sdk.resetPasswordForEmail.mockResolvedValue({ error: null });
  sdk.updateUser.mockResolvedValue({ data: { user }, error: null });
  sdk.signInWithOAuth.mockResolvedValue({
    data: { url: 'https://example.supabase.co/auth/v1/authorize' },
    error: null,
  });
  sdk.exchange.mockImplementation(async () => {
    await Promise.resolve();
    sdk.getSession.mockResolvedValue({ data: { session }, error: null });
    listener('SIGNED_IN', session);
    return { data: { session }, error: null };
  });
});
afterEach(() => vi.useRealTimers());
describe('Account UI with mocked Supabase responses (not live auth)', () => {
  it('validates login email and missing password before contacting Supabase', async () => {
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(screen.getByRole('alert')).toHaveTextContent('valid email');
    await userEvent.type(
      screen.getByLabelText('Email address'),
      'a@example.test',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter your password');
    expect(sdk.signInWithPassword).not.toHaveBeenCalled();
  });
  it('validates signup password length and confirmation', async () => {
    mount('/signup');
    await credentials('short');
    await userEvent.click(
      screen.getByRole('button', { name: 'Create account' }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('12 and 128');
    await userEvent.clear(screen.getByLabelText('Password', { exact: true }));
    await userEvent.type(
      screen.getByLabelText('Password', { exact: true }),
      'long-password-here',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Create account' }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('do not match');
    expect(sdk.signUp).not.toHaveBeenCalled();
  });
  it('waits for email confirmation without pretending a session exists', async () => {
    const { router } = mount('/signup');
    await credentials();
    await userEvent.type(
      screen.getByLabelText('Confirm password'),
      'correct-password',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Create account' }),
    );
    expect(
      await screen.findByText(/If registration can proceed/),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/signup');
    expect(sdk.signUp.mock.calls[0]![0].options.emailRedirectTo).toContain(
      '/auth/callback',
    );
    expect(screen.getByLabelText('Password', { exact: true })).toHaveValue('');
  });
  it('does not expose raw API errors or submitted credentials', async () => {
    sdk.signInWithPassword.mockResolvedValue({
      error: {
        code: 'invalid_credentials',
        message: 'private server internals',
      },
    });
    mount();
    await credentials();
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Email or password is incorrect',
    );
    expect(document.body.textContent).not.toContain('private server internals');
  });
  it('redirects after confirmed login and rejects an external next URL', async () => {
    const { router } = mount('/login?next=https://evil.example');
    await credentials();
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(
      await screen.findByRole('heading', { name: 'Welcome, Ada.' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/dashboard');
    expect(sdk.getUser).toHaveBeenCalled();
  });
  it('restores a stored session only after a server user check', async () => {
    sdk.getSession.mockResolvedValue({ data: { session }, error: null });
    mount('/dashboard');
    expect(
      screen.queryByText('researcher@example.test'),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByText('researcher@example.test'),
    ).toBeInTheDocument();
    expect(sdk.getUser).toHaveBeenCalled();
  });
  it('keeps unverifiable stored sessions off the dashboard', async () => {
    sdk.getSession.mockResolvedValue({ data: { session }, error: null });
    sdk.getUser.mockResolvedValue({
      data: { user: null },
      error: { code: 'bad_jwt' },
    });
    mount('/dashboard');
    expect(await screen.findByText(/We could not verify/)).toBeInTheDocument();
    expect(
      screen.queryByText('researcher@example.test'),
    ).not.toBeInTheDocument();
  });
  it('redirects a guest from protected account to login without a loop', async () => {
    const { router } = mount('/dashboard');
    await screen.findByRole('heading', { name: 'Welcome back.' });
    expect(router.state.location.pathname).toBe('/login');
  });
  it('leaves guest workspace access open', async () => {
    mount('/app');
    expect(
      screen.getByRole('heading', { name: 'Guest EEG demo' }),
    ).toBeInTheDocument();
  });
  it('logs out using SDK local scope and removes the profile', async () => {
    sdk.getSession.mockResolvedValue({ data: { session }, error: null });
    mount('/dashboard');
    await screen.findByText('researcher@example.test');
    await userEvent.click(screen.getByText('Account settings'));
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(
      await screen.findByText('You have logged out of this browser.'),
    ).toBeInTheDocument();
    expect(sdk.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
  it('reports logout failure without pretending it succeeded', async () => {
    sdk.getSession.mockResolvedValue({ data: { session }, error: null });
    sdk.signOut.mockResolvedValue({ error: { code: 'network' } });
    mount('/dashboard');
    await screen.findByText('researcher@example.test');
    await userEvent.click(screen.getByText('Account settings'));
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to complete',
    );
    expect(screen.getByText('researcher@example.test')).toBeInTheDocument();
  });
  it('requests recovery with a fixed same-origin callback', async () => {
    mount('/forgot-password');
    await userEvent.type(
      screen.getByLabelText('Email address'),
      'researcher@example.test',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Send recovery link' }),
    );
    expect(
      await screen.findByText(/If an account is eligible/),
    ).toBeInTheDocument();
    expect(sdk.resetPasswordForEmail).toHaveBeenCalledWith(
      'researcher@example.test',
      {
        redirectTo:
          window.location.origin + '/auth/callback?next=%2Freset-password',
      },
    );
  });
  it('requires a verified session to update a password', async () => {
    mount('/reset-password');
    await screen.findByText(/Open a fresh recovery link/);
    expect(
      screen.queryByRole('button', { name: 'Update password' }),
    ).not.toBeInTheDocument();
    expect(sdk.updateUser).not.toHaveBeenCalled();
  });
  it('updates a recovered account password only after Supabase success', async () => {
    sdk.getSession.mockResolvedValue({ data: { session }, error: null });
    mount('/reset-password');
    await screen.findByLabelText('New password');
    await userEvent.type(
      screen.getByLabelText('New password'),
      'new-correct-password',
    );
    await userEvent.type(
      screen.getByLabelText('Confirm password'),
      'new-correct-password',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Update password' }),
    );
    expect(
      await screen.findByText(/Your password has been updated/),
    ).toBeInTheDocument();
    expect(sdk.updateUser).toHaveBeenCalledWith({
      password: 'new-correct-password',
    });
  });
  it.each(['google', 'github'] as const)(
    'generates the %s OAuth request through Supabase PKCE',
    async (provider) => {
      mount('/login?next=//evil.example');
      await userEvent.click(
        screen.getByRole('button', {
          name:
            provider === 'google'
              ? 'Continue with Google'
              : 'Continue with GitHub',
        }),
      );
      expect(sdk.signInWithOAuth).toHaveBeenCalledWith({
        provider,
        options: {
          redirectTo:
            window.location.origin + '/auth/callback?next=%2Fdashboard',
        },
      });
    },
  );
  it('exchanges a callback code and navigates to recovery', async () => {
    const { router } = mount(
      '/auth/callback?code=single-use-test&next=/reset-password',
    );
    expect(await screen.findByLabelText('New password')).toBeInTheDocument();
    expect(sdk.exchange).toHaveBeenCalledWith('single-use-test');
    expect(router.state.location.pathname).toBe('/reset-password');
  });
  it.each([
    '/auth/callback?error=access_denied&error_description=unsafe',
    '/auth/callback',
    '/auth/callback#access_token=do-not-accept',
  ])('rejects callback failure %s safely', async (path) => {
    sdk.getUser.mockResolvedValue({ data: { user: null }, error: null });
    mount(path);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'could not be completed',
    );
    expect(sdk.exchange).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('unsafe');
  });
  it('reports an expired or already consumed code', async () => {
    sdk.getUser.mockResolvedValue({ data: { user: null }, error: null });
    sdk.exchange.mockResolvedValue({
      data: { session: null },
      error: { code: 'bad_code' },
    });
    mount('/auth/callback?code=old');
    expect(await screen.findByRole('alert')).toHaveTextContent('expired');
  });
  it.each([
    '/auth/callback?error=access_denied',
    '/auth/callback',
    '/auth/callback?code=used&next=/reset-password',
    '/auth/callback#access_token=untrusted',
  ])('recovers %s only through a confirmed server user', async (path) => {
    sdk.getSession.mockResolvedValue({ data: { session }, error: null });
    sdk.exchange.mockResolvedValue({ data: { session: null }, error: {} });
    const { router } = mount(path);
    expect(await screen.findByText('Verified')).toBeInTheDocument();
    expect(sdk.getUser).toHaveBeenCalled();
    expect(router.state.location.pathname).toBe('/dashboard');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it.each(['unverified', 'rejected', 'offline'])(
    'does not recover a failed callback when server verification is %s',
    async (condition) => {
      // Even a cached confirmed user is insufficient.
      sdk.getSession.mockResolvedValue({ data: { session }, error: null });
      if (condition === 'offline') sdk.getUser.mockRejectedValue(new Error());
      else
        sdk.getUser.mockResolvedValue({
          data: {
            user:
              condition === 'unverified'
                ? { ...user, email_confirmed_at: undefined }
                : user,
          },
          error: condition === 'rejected' ? { code: 'bad_jwt' } : null,
        });
      const { router } = mount('/auth/callback?error=expired');
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'try logging in',
      );
      expect(router.state.location.pathname).toBe('/auth/callback');
    },
  );
  it('preserves project drafts during same-account focus verification', async () => {
    sdk.getSession.mockResolvedValue({ data: { session }, error: null });
    mount('/dashboard');
    await screen.findByText('researcher@example.test');
    await userEvent.click(screen.getByRole('button', { name: /New project/ }));
    await userEvent.type(
      screen.getByLabelText('Project name'),
      'Keep my draft',
    );
    let resolve!: (v: unknown) => void;
    sdk.getUser.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    act(() => window.dispatchEvent(new Event('focus')));
    await waitFor(() => expect(resolve).toBeDefined());
    expect(screen.getByLabelText('Project name')).toHaveValue('Keep my draft');
    await act(async () => resolve({ data: { user }, error: null }));
    expect(screen.getByLabelText('Project name')).toHaveValue('Keep my draft');
  });
  it('handles session sign-out events without exposing the old profile', async () => {
    sdk.getSession.mockResolvedValue({ data: { session }, error: null });
    mount('/dashboard');
    await screen.findByText('researcher@example.test');
    act(() => listener('SIGNED_OUT', null));
    expect(
      await screen.findByRole('heading', { name: 'Welcome back.' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('researcher@example.test'),
    ).not.toBeInTheDocument();
  });
  it('ignores a stale server response after sign-out and cleans up subscriptions', async () => {
    let resolve!: (v: unknown) => void;
    sdk.getSession.mockResolvedValue({ data: { session }, error: null });
    sdk.getUser.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const view = mount('/dashboard');
    await waitFor(() => expect(sdk.getUser).toHaveBeenCalled());
    act(() => listener('SIGNED_OUT', null));
    await act(async () => resolve({ data: { user }, error: null }));
    expect(
      screen.queryByText('researcher@example.test'),
    ).not.toBeInTheDocument();
    view.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
  it('supports keyboard form use and password visibility', async () => {
    mount();
    const input = screen.getByLabelText('Password', { exact: true });
    await userEvent.click(
      screen.getByRole('button', { name: 'Show password' }),
    );
    expect(input).toHaveAttribute('type', 'text');
    await userEvent.keyboard('{Enter}');
    expect(input).toHaveAttribute('type', 'password');
  });
  it('rejects an expired cached session even if a user lookup returns', async () => {
    sdk.getSession.mockResolvedValue({
      data: {
        session: { ...session, expires_at: Math.floor(Date.now() / 1000) - 1 },
      },
      error: null,
    });
    mount('/dashboard');
    expect(
      await screen.findByRole('heading', { name: 'Welcome back.' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('researcher@example.test'),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByText(/session (expired|ended)/).length,
    ).toBeGreaterThan(0);
  });
  it('bounds initialization and ignores a result arriving after the deadline', async () => {
    vi.useFakeTimers();
    let resolve!: (value: unknown) => void;
    sdk.getSession.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    mount('/dashboard');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15001);
    });
    expect(screen.getByText(/verification timed out/)).toBeInTheDocument();
    await act(async () => resolve({ data: { session }, error: null }));
    expect(
      screen.queryByText('researcher@example.test'),
    ).not.toBeInTheDocument();
  });
});
