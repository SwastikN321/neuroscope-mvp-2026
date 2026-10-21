import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { EEGWorkspace } from './EEGWorkspace';
import { createSyntheticSource } from './synthetic';
const source = createSyntheticSource();
afterEach(() => vi.restoreAllMocks());
function mount() {
  const router = createMemoryRouter(
    [
      { path: '/app', element: <EEGWorkspace source={source} /> },
      { path: '/', element: <h1>Home</h1> },
    ],
    { initialEntries: ['/', '/app'], initialIndex: 1 },
  );
  render(<RouterProvider router={router} />);
  return router;
}
async function add(
  type: 'point' | 'interval',
  label: string,
  start: number,
  end?: number,
) {
  await userEvent.click(screen.getByRole('button', { name: `Add ${type}` }));
  fireEvent.change(screen.getByLabelText('Annotation start seconds'), {
    target: { value: String(start) },
  });
  if (end !== undefined)
    fireEvent.change(screen.getByLabelText('Annotation end seconds'), {
      target: { value: String(end) },
    });
  await userEvent.type(screen.getByLabelText('Annotation label'), label);
  await userEvent.click(
    screen.getByRole('button', { name: 'Save in session' }),
  );
}
it('creates, sorts, selects, edits, jumps, hides and restores overlays without time drift', async () => {
  mount();
  vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
  const plot = await screen.findByRole('group', {
    name: 'Interactive EEG waveform viewer',
  });
  await add('interval', 'Later interval', 5, 7);
  await add('point', 'Earlier point', 1.25);
  const list = screen.getByRole('list', { name: 'Annotations sorted by time' });
  expect(within(list).getAllByRole('listitem')[0]).toHaveAttribute(
    'data-start-time',
    '1.25',
  );
  const marker = screen.getByRole('button', {
    name: 'Inspect annotation: Earlier point',
  });
  await userEvent.click(marker);
  expect(screen.getByLabelText('Annotation start seconds')).toHaveValue(1.25);
  await userEvent.clear(screen.getByLabelText('Annotation label'));
  await userEvent.type(
    screen.getByLabelText('Annotation label'),
    'Edited point',
  );
  await userEvent.type(
    screen.getByLabelText('Annotation notes'),
    'Research observation only.',
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Update annotation' }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
  await userEvent.click(screen.getByRole('button', { name: 'Pan later' }));
  expect(
    screen.queryByRole('button', { name: 'Inspect annotation: Edited point' }),
  ).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('button', { name: 'Jump to Edited point' }),
  );
  expect(
    screen.getByRole('button', { name: 'Inspect annotation: Edited point' })
      .parentElement,
  ).toHaveAttribute('data-time', '1.25');
  await userEvent.click(
    screen.getByRole('checkbox', { name: 'Fp1 Frontopolar' }),
  );
  expect(
    screen.queryByRole('button', { name: 'Inspect annotation: Edited point' }),
  ).not.toBeInTheDocument();
  expect(within(list).getAllByRole('listitem')).toHaveLength(2);
  await userEvent.click(
    screen.getByRole('button', { name: 'Jump to Edited point' }),
  );
  expect(plot.getAttribute('data-channels')).toContain('Fp1');
  expect(
    screen.getByRole('button', { name: 'Inspect annotation: Edited point' })
      .parentElement,
  ).toHaveAttribute('data-time', '1.25');
  await userEvent.click(
    screen.getByRole('button', { name: 'Delete Edited point' }),
  );
  expect(within(list).getAllByRole('listitem')).toHaveLength(1);
});
it('offers keyboard entry, native time validation, and does not change inspected amplitude', async () => {
  mount();
  await screen.findByRole('group', { name: 'Interactive EEG waveform viewer' });
  fireEvent.change(screen.getByLabelText('Inspect time in seconds'), {
    target: { value: '1.25' },
  });
  await waitFor(() =>
    expect(screen.getByTestId('amplitude-readout')).not.toHaveTextContent('—'),
  );
  const amplitude = screen.getByTestId('amplitude-readout').textContent;
  screen.getByRole('button', { name: 'Add point' }).focus();
  await userEvent.keyboard('{Enter}');
  expect(screen.getByLabelText('Annotation label')).toHaveFocus();
  await userEvent.type(
    screen.getByLabelText('Annotation label'),
    'Keyboard observation',
  );
  await userEvent.keyboard('{Enter}');
  expect(screen.getByRole('listitem')).toHaveAttribute(
    'data-start-time',
    '1.25',
  );
  expect(screen.getByTestId('amplitude-readout').textContent).toBe(amplitude);
  await add('interval', 'Invalid', 2, 1);
  expect(screen.getByRole('alert')).toHaveTextContent(
    'End time must be after start',
  );
});
it('blocks link and history navigation, warns before refresh, and clears the warning after deletion', async () => {
  const router = mount();
  const confirm = vi.spyOn(globalThis, 'confirm').mockReturnValue(false);
  await add('point', 'Keep me', 1);
  const refresh = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(refresh);
  expect(refresh.defaultPrevented).toBe(true);
  await userEvent.click(
    screen.getByRole('link', { name: '← Back to homepage' }),
  );
  expect(confirm).toHaveBeenCalled();
  expect(router.state.location.pathname).toBe('/app');
  await router.navigate(-1);
  await waitFor(() => expect(confirm).toHaveBeenCalledTimes(2));
  expect(router.state.location.pathname).toBe('/app');
  confirm.mockReturnValue(true);
  await userEvent.click(screen.getByRole('button', { name: 'Delete Keep me' }));
  const clean = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(clean);
  expect(clean.defaultPrevented).toBe(false);
  await userEvent.click(
    screen.getByRole('link', { name: '← Back to homepage' }),
  );
  expect(
    await screen.findByRole('heading', { name: 'Home' }),
  ).toBeInTheDocument();
});
