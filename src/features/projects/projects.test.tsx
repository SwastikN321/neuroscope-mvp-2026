import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { User } from '@supabase/supabase-js';
import { AuthContext, type AuthState } from '../auth/context';
import { ProjectList } from './ProjectList';
import ProjectDetails from './ProjectDetails';
import * as api from './api';
vi.mock('./api', async (original) => ({
  ...(await original<typeof import('./api')>()),
  listProjects: vi.fn(),
  getProject: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
}));
const project: api.ResearchProject = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  owner_id: '11111111-1111-4111-8111-111111111111',
  name: 'Original study',
  description: 'A real question',
  status: 'active',
  metadata: {},
  created_at: '2026-10-21T12:00:00Z',
  updated_at: '2026-10-21T12:00:00Z',
};
const account = { id: project.owner_id } as User;
function mount(
  path = '/dashboard',
  status: AuthState['status'] = 'authenticated',
) {
  const router = createMemoryRouter(
    [
      { path: '/dashboard', element: <ProjectList /> },
      { path: '/dashboard/projects/:projectId', element: <ProjectDetails /> },
      { path: '/login', element: <h1>Log in required</h1> },
    ],
    { initialEntries: [path] },
  );
  const auth = {
    status,
    user: status === 'authenticated' ? account : null,
    notice: '',
    retry: vi.fn(),
    logout: vi.fn(),
  };
  const view = render(
    <AuthContext.Provider value={auth}>
      <RouterProvider router={router} />
    </AuthContext.Provider>,
  );
  return { ...view, router, auth };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listProjects).mockResolvedValue({
    projects: [],
    hasMore: false,
  });
  vi.mocked(api.getProject).mockResolvedValue(project);
  vi.mocked(api.createProject).mockResolvedValue(project);
  vi.mocked(api.updateProject).mockResolvedValue({
    ...project,
    name: 'Updated study',
  });
  vi.mocked(api.deleteProject).mockResolvedValue();
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false;
  });
});
describe('Project UI with mocked requests; security tested separately in PostgreSQL', () => {
  it('shows a meaningful empty state and creates only after server success', async () => {
    let resolve!: (p: api.ResearchProject) => void;
    vi.mocked(api.createProject).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const { router } = mount();
    await screen.findByText('Start with a question.');
    await userEvent.click(
      screen.getByRole('button', { name: 'Create your first project' }),
    );
    await userEvent.type(
      screen.getByLabelText('Project name'),
      'Original study',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Create project' }),
    );
    expect(router.state.location.pathname).toBe('/dashboard');
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    await act(async () => resolve(project));
    expect(
      await screen.findByRole('heading', { name: project.name }),
    ).toBeInTheDocument();
  });
  it('shows request failure, retains form inputs and does not navigate', async () => {
    vi.mocked(api.createProject).mockRejectedValue(new Error('Request failed'));
    const { router } = mount();
    await userEvent.click(screen.getByRole('button', { name: /New project/ }));
    await userEvent.type(screen.getByLabelText('Project name'), 'Unsaved work');
    await userEvent.click(
      screen.getByRole('button', { name: 'Create project' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Request failed',
    );
    expect(screen.getByLabelText('Project name')).toHaveValue('Unsaved work');
    expect(router.state.location.pathname).toBe('/dashboard');
  });
  it('loads bounded pages and opens a selected project', async () => {
    vi.mocked(api.listProjects).mockResolvedValue({
      projects: [project],
      hasMore: true,
    });
    mount();
    await userEvent.click(await screen.findByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(api.listProjects).toHaveBeenLastCalledWith(
        1,
        expect.any(AbortSignal),
      ),
    );
    await userEvent.click(
      await screen.findByRole('link', { name: /Original study/ }),
    );
    expect(
      await screen.findByRole('heading', { name: project.name }),
    ).toBeInTheDocument();
  });
  it('loads persisted details on direct navigation and edits with server confirmation', async () => {
    mount(`/dashboard/projects/${project.id}`);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Edit project' }),
    );
    await userEvent.clear(screen.getByLabelText('Project name'));
    await userEvent.type(
      screen.getByLabelText('Project name'),
      'Updated study',
    );
    vi.mocked(api.getProject).mockResolvedValue({
      ...project,
      name: 'Updated study',
      updated_at: '2026-10-21T13:00:00Z',
    });
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(
      await screen.findByRole('heading', { name: 'Updated study' }),
    ).toBeInTheDocument();
    expect(api.updateProject).toHaveBeenCalledWith(
      project,
      { name: 'Updated study', description: project.description },
      expect.any(AbortSignal),
    );
  });
  it('requires explicit deletion confirmation and keeps the project after failure', async () => {
    vi.mocked(api.deleteProject).mockRejectedValueOnce(
      new Error('Delete failed'),
    );
    const { router } = mount(`/dashboard/projects/${project.id}`);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete project' }),
    );
    expect(
      screen.getByRole('button', { name: 'Permanently delete' }),
    ).toBeDisabled();
    await userEvent.type(
      screen.getByLabelText('Type DELETE to confirm'),
      'DELETE',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Permanently delete' }),
    );
    expect(await screen.findByText('Delete failed')).toHaveAttribute(
      'role',
      'alert',
    );
    expect(router.state.location.pathname).toContain(project.id);
    await userEvent.click(
      screen.getByRole('button', { name: 'Permanently delete' }),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/dashboard'),
    );
  });
  it('cancel deletion leaves the database unchanged', async () => {
    mount(`/dashboard/projects/${project.id}`);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete project' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Keep project' }));
    expect(api.deleteProject).not.toHaveBeenCalled();
  });
  it('renders unavailable records without revealing whether another user owns them', async () => {
    vi.mocked(api.getProject).mockResolvedValue(null);
    mount(`/dashboard/projects/${project.id}`);
    expect(
      await screen.findByRole('heading', { name: 'Project unavailable' }),
    ).toBeInTheDocument();
  });
  it('retries database failures', async () => {
    vi.mocked(api.listProjects).mockRejectedValueOnce(new Error('Offline'));
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent('Offline');
    await userEvent.click(
      screen.getByRole('button', { name: 'Retry projects' }),
    );
    expect(
      await screen.findByText('Start with a question.'),
    ).toBeInTheDocument();
  });
  it('removes private details when the session expires, even with a pending request', async () => {
    let resolve!: (p: api.ResearchProject) => void;
    vi.mocked(api.getProject).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const view = mount(`/dashboard/projects/${project.id}`);
    await waitFor(() => expect(api.getProject).toHaveBeenCalled());
    view.rerender(
      <AuthContext.Provider
        value={{
          ...view.auth,
          status: 'guest',
          user: null,
          notice: 'Session expired',
        }}
      >
        <RouterProvider router={view.router} />
      </AuthContext.Provider>,
    );
    await act(async () => resolve(project));
    expect(
      await screen.findByRole('heading', { name: 'Log in required' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(project.name)).not.toBeInTheDocument();
  });
  it('protects direct project routes before loading database data', async () => {
    mount(`/dashboard/projects/${project.id}`, 'guest');
    expect(
      await screen.findByRole('heading', { name: 'Log in required' }),
    ).toBeInTheDocument();
    expect(api.getProject).not.toHaveBeenCalled();
  });
  it('renders user text without HTML interpretation', async () => {
    vi.mocked(api.getProject).mockResolvedValue({
      ...project,
      name: '<script>unsafe()</script>',
    });
    mount(`/dashboard/projects/${project.id}`);
    expect(
      await screen.findByRole('heading', { name: '<script>unsafe()</script>' }),
    ).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
  });
});
