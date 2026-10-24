import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import { ProjectRecordings } from './ProjectRecordings';
const mocks = vi.hoisted(() => ({ request: vi.fn(), upload: vi.fn() }));
vi.mock('../auth/context', () => ({
  useAuth: () => ({ user: { id: 'owner' } }),
}));
vi.mock('./api', () => ({
  cloudRequest: mocks.request,
  uploadCloudEDF: mocks.upload,
}));
const row = {
  id: 'r',
  project_id: 'p',
  display_name: 'Verified EEG',
  file_size_bytes: 1024,
  status: 'ready',
  duration_seconds: '4',
  channel_count: 4,
  cleanup_after: null,
};
const listing = {
  recordings: [row],
  quota: { used_slots: 1, max_slots: 4, max_file_bytes: 50000000 },
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.request.mockResolvedValue(listing);
  mocks.upload.mockResolvedValue({ id: 'r', status: 'ready' });
});
function open() {
  return render(
    <MemoryRouter>
      <ProjectRecordings projectId="p" />
    </MemoryRouter>,
  );
}
it('lists owner-scoped recordings and opens the existing workspace route', async () => {
  open();
  expect(
    await screen.findByRole('link', { name: 'Open recording ↗' }),
  ).toHaveAttribute('href', '/app/recordings/r');
  expect(screen.getByText(/1 \/ 4 account slots/)).toBeVisible();
  expect(mocks.request).toHaveBeenCalledWith(
    '/api/cloud/projects/p/recordings',
    expect.any(AbortSignal),
    'GET',
    'json',
    'owner',
  );
});
it('requires confirmation and refreshes after successful deletion', async () => {
  const user = userEvent.setup();
  mocks.request.mockImplementation(
    (_: string, __?: AbortSignal, method?: string) =>
      Promise.resolve(
        method === 'DELETE'
          ? { message: 'Recording deleted; capacity released.' }
          : listing,
      ),
  );
  open();
  await screen.findByText('Verified EEG');
  await user.click(screen.getByRole('button', { name: 'Delete recording' }));
  expect(mocks.request.mock.calls.some((c) => c[2] === 'DELETE')).toBe(false);
  await user.click(
    screen.getByRole('button', { name: 'Confirm recording deletion' }),
  );
  await screen.findByText('Recording deleted; capacity released.');
  expect(mocks.request).toHaveBeenCalledWith(
    '/api/cloud/recordings/r',
    undefined,
    'DELETE',
    'json',
    'owner',
  );
});
it('disables upload when account capacity is occupied', async () => {
  mocks.request.mockResolvedValue({
    ...listing,
    quota: { ...listing.quota, used_slots: 4 },
  });
  open();
  await screen.findByText(/4 \/ 4 account slots/);
  expect(screen.getByLabelText('EDF file')).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Upload EDF privately' }),
  ).toBeDisabled();
});
it('uploads a selected EDF and exposes successful validation feedback', async () => {
  open();
  await screen.findByText('Verified EEG');
  fireEvent.change(screen.getByLabelText('EDF file'), {
    target: { files: [new File([new Uint8Array(1024)], 'synthetic.edf')] },
  });
  await act(async () => {
    fireEvent.submit(
      screen
        .getByRole('button', { name: 'Upload EDF privately' })
        .closest('form')!,
    );
  });
  await screen.findByText('EDF validated and saved privately. Open it below.');
  expect(mocks.upload).toHaveBeenCalledTimes(1);
  await waitFor(() =>
    expect(mocks.request.mock.calls.length).toBeGreaterThan(1),
  );
});
it('shows recovery timing instead of pretending a tombstone is ready', async () => {
  mocks.request.mockResolvedValue({
    ...listing,
    recordings: [
      { ...row, status: 'deleted', cleanup_after: '2026-10-24T12:00:00Z' },
    ],
  });
  open();
  await screen.findByRole('button', { name: 'Retry cleanup' });
  expect(
    screen.queryByRole('link', { name: 'Open recording ↗' }),
  ).not.toBeInTheDocument();
  expect(screen.getByText(/Retry cleanup after/)).toBeVisible();
});

it('focuses the safe action and returns focus when deletion is canceled', async () => {
  const user = userEvent.setup();
  open();
  const trigger = await screen.findByRole('button', {
    name: 'Delete recording',
  });
  await user.click(trigger);
  expect(screen.getByRole('button', { name: 'Keep recording' })).toHaveFocus();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  expect(mocks.request.mock.calls.some((c) => c[2] === 'DELETE')).toBe(false);
});
