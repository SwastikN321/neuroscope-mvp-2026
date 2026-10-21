import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
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
    <RouterProvider
      router={createMemoryRouter([
        { path: '*', element: <RecordingSession demo={demo} /> },
      ])}
    />,
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

it('warns before replacement, deletion and demo switching, retaining annotations on cancel', async () => {
  mount();
  await upload();
  const confirm = vi.spyOn(globalThis, 'confirm').mockReturnValue(false);
  try {
    await userEvent.click(screen.getByRole('button', { name: 'Add point' }));
    await userEvent.type(
      screen.getByLabelText('Annotation label'),
      'Retain observation',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Save in session' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Use synthetic demo' }),
    );
    expect(screen.getByText('RECORDING / record-1')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete EDF' }));
    expect(deleteRecording).not.toHaveBeenCalled();
    await upload();
    expect(deleteRecording).toHaveBeenCalledWith('record-2');
    expect(deleteRecording).not.toHaveBeenCalledWith('record-1');
    expect(
      screen.getByRole('button', { name: 'Edit Retain observation' }),
    ).toBeInTheDocument();
    confirm.mockReturnValue(true);
    await userEvent.click(
      screen.getByRole('button', { name: 'Use synthetic demo' }),
    );
    expect(
      screen.queryByRole('button', { name: 'Edit Retain observation' }),
    ).not.toBeInTheDocument();
  } finally {
    confirm.mockRestore();
  }
});

it('preserves annotations for JSON rescue when the recording expires, hiding stale measurements', async () => {
  mount();
  await upload();
  await userEvent.click(screen.getByRole('button', { name: 'Add point' }));
  await userEvent.type(
    screen.getByLabelText('Annotation label'),
    'Keep after expiry',
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Save in session' }),
  );
  await act(async () => callbacks[0]!());
  expect(
    screen.getByRole('button', { name: 'Edit Keep after expiry' }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('group', { name: 'Interactive EEG waveform viewer' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Recording position')).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByText('Export', { exact: false, selector: 'summary' }),
  );
  expect(
    screen.getByRole('button', { name: 'Export Annotations (JSON)' }),
  ).toBeEnabled();
  expect(
    screen.getByRole('button', { name: 'Export Visualization (PNG)' }),
  ).toBeDisabled();
});

it('deleting a retained EDF leaves unrelated synthetic annotations and their discard protection intact', async () => {
  mount();
  await upload();
  await userEvent.click(
    screen.getByRole('button', { name: 'Use synthetic demo' }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Add point' }));
  await userEvent.type(
    screen.getByLabelText('Annotation label'),
    'Unrelated demo note',
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Save in session' }),
  );
  const confirm = vi.spyOn(globalThis, 'confirm').mockReturnValue(false);
  try {
    await userEvent.click(screen.getByRole('button', { name: 'Delete EDF' }));
    expect(deleteRecording).toHaveBeenCalledWith('record-1');
    expect(confirm).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Edit Unrelated demo note' }),
    ).toBeInTheDocument();
    await upload();
    expect(confirm).toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Edit Unrelated demo note' }),
    ).toBeInTheDocument();
  } finally {
    confirm.mockRestore();
  }
});
