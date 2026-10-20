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
import { RecordingSession } from './RecordingSession';
import { createSyntheticSource } from './synthetic';
import {
  ApiError,
  createEDFSource,
  deleteRecording,
  request,
  uploadEDF,
} from './localApi';
vi.mock('./localApi', async (original) => ({
  ...(await original<typeof import('./localApi')>()),
  createEDFSource: vi.fn(),
  deleteRecording: vi.fn(),
  request: vi.fn(),
  uploadEDF: vi.fn(),
  localUploadsEnabled: () => true,
}));
const demo = createSyntheticSource();
const file = new File([new Uint8Array(512)], 'fixture.edf');
const callbacks: (() => void)[] = [];
beforeEach(() => {
  vi.resetAllMocks();
  callbacks.length = 0;
  vi.mocked(deleteRecording).mockResolvedValue();
  vi.mocked(createEDFSource).mockImplementation(
    async (meta, _limits, missing) => {
      callbacks.push(missing);
      return {
        ...demo,
        recording: { ...demo.recording, id: meta.id, source: 'edf' },
      };
    },
  );
  vi.mocked(uploadEDF).mockImplementation(async () => ({
    metadata: {
      id: `record-${vi.mocked(uploadEDF).mock.calls.length}`,
      duration_seconds: 120,
      channels: [],
      expires_in_seconds: 3600,
      channel_type_note: '',
    },
    limits: {
      upload_bytes: 1024,
      window_seconds: 30,
      window_values: 250000,
      selected_channels: 32,
    },
  }));
});
function mount() {
  render(
    <MemoryRouter>
      <RecordingSession demo={demo} />
    </MemoryRouter>,
  );
}
async function upload() {
  await userEvent.upload(screen.getByLabelText('Choose EDF recording'), file);
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Upload Recording' }),
    ).toBeEnabled(),
  );
}
it('ignores a stale focus 404 and old-source expiry after successful replacement', async () => {
  mount();
  await upload();
  let reject!: (reason: unknown) => void;
  vi.mocked(request).mockImplementation(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
  );
  fireEvent(window, new Event('focus'));
  await upload();
  expect(deleteRecording).toHaveBeenCalledWith('record-1');
  await act(async () => {
    reject(new ApiError('expired', 404));
    callbacks[0]!();
  });
  expect(screen.getByText('RECORDING / record-2')).toBeInTheDocument();
  expect(
    screen.queryByText(/Showing the synthetic demo/),
  ).not.toBeInTheDocument();
});
it('cancels an upload and allows another file without stale completion taking over', async () => {
  mount();
  let reject!: (reason: unknown) => void;
  vi.mocked(uploadEDF).mockImplementationOnce(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
  );
  await userEvent.upload(screen.getByLabelText('Choose EDF recording'), file);
  expect(
    screen.getByRole('button', { name: 'Upload Recording' }),
  ).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Cancel upload' }));
  await upload();
  await act(async () => reject(new DOMException('Canceled', 'AbortError')));
  expect(screen.getByText('RECORDING / record-2')).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Upload Recording' }),
  ).toBeEnabled();
});
it('does not pretend deletion succeeded when the backend is unavailable', async () => {
  mount();
  await upload();
  vi.mocked(deleteRecording).mockRejectedValue(
    new Error('Backend unavailable; retry deletion.'),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Delete EDF' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('retry deletion');
  expect(screen.getByText('RECORDING / record-1')).toBeInTheDocument();
});
