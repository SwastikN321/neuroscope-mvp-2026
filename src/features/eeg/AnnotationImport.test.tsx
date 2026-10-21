import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { AnnotationImport } from './AnnotationImport';
import { useAnnotations } from './useAnnotations';
import { createSyntheticSource } from './synthetic';
import { makeAnnotation } from './annotations';
import { annotationJSON } from './annotationPortability';
const recording = createSyntheticSource().recording;
const item = makeAnnotation(recording, {
  type: 'point',
  startTime: 1.125,
  channelId: 'Fp1',
  label: 'Original',
  notes: '',
});
function Harness() {
  const annotations = useAnnotations(recording);
  return (
    <>
      <AnnotationImport recording={recording} annotations={annotations} />
      <output data-testid="items">{JSON.stringify(annotations.items)}</output>
    </>
  );
}
function mount() {
  render(
    <RouterProvider
      router={createMemoryRouter([{ path: '/', element: <Harness /> }])}
    />,
  );
}
function load(text: string) {
  const file = new File([text], 'annotations.json', {
    type: 'application/json',
  });
  Object.defineProperty(file, 'text', { value: async () => text });
  fireEvent.change(screen.getByLabelText('Choose annotation JSON'), {
    target: { files: [file] },
  });
}
afterEach(() => vi.restoreAllMocks());
it('keeps import uncommitted until review, supports cancel, and gates uncertain compatibility', async () => {
  mount();
  const doc = JSON.parse(annotationJSON(recording, [item]));
  delete doc.recording.identity;
  load(JSON.stringify(doc));
  const confirm = await screen.findByRole('button', { name: 'Confirm import' });
  expect(confirm).toBeDisabled();
  expect(screen.getByTestId('items')).toHaveTextContent('[]');
  await userEvent.click(screen.getByRole('button', { name: 'Cancel import' }));
  expect(screen.getByTestId('items')).toHaveTextContent('[]');
  load(JSON.stringify(doc));
  await screen.findByRole('button', { name: 'Confirm import' });
  await userEvent.click(
    screen.getByRole('checkbox', { name: /I confirm this is the correct/ }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Confirm import' }));
  expect(JSON.parse(screen.getByTestId('items').textContent!)).toEqual([item]);
});
it('skips conflicting IDs by default and requires confirmation before replacement', async () => {
  mount();
  const confirm = vi.spyOn(globalThis, 'confirm').mockReturnValue(false);
  load(annotationJSON(recording, [item]));
  await userEvent.click(
    await screen.findByRole('button', { name: 'Confirm import' }),
  );
  const changed = { ...item, label: 'Replacement' };
  load(annotationJSON(recording, [changed]));
  await userEvent.click(
    await screen.findByRole('button', { name: 'Confirm import' }),
  );
  expect(JSON.parse(screen.getByTestId('items').textContent!)).toEqual([item]);
  load(annotationJSON(recording, [changed]));
  await userEvent.click(
    await screen.findByRole('checkbox', { name: /Replace conflicting/ }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Confirm import' }));
  expect(confirm).toHaveBeenCalledWith(
    'Replace 1 existing annotations with the imported versions?',
  );
  expect(JSON.parse(screen.getByTestId('items').textContent!)).toEqual([item]);
  confirm.mockReturnValue(true);
  await userEvent.click(screen.getByRole('button', { name: 'Confirm import' }));
  await waitFor(() =>
    expect(JSON.parse(screen.getByTestId('items').textContent!)).toEqual([
      changed,
    ]),
  );
});
