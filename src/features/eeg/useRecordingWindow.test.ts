import { act, renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';
import { useRecordingWindow } from './useRecordingWindow';
import { createSyntheticSource } from './synthetic';
import type { EEGWindow } from './recording';
it('ignores an out-of-order response after a new time window is requested', async () => {
  const pending: {
    resolve: (data: EEGWindow) => void;
    signal?: AbortSignal;
  }[] = [];
  const source = {
    ...createSyntheticSource(),
    readWindow: (
      _start: number,
      _end: number,
      _ids: string[],
      signal?: AbortSignal,
    ) => new Promise<EEGWindow>((resolve) => pending.push({ resolve, signal })),
  };
  const ids = ['C3'];
  const { result, rerender } = renderHook(
    ({ range }) => useRecordingWindow(source, range, ids, 0),
    { initialProps: { range: { start: 0, end: 10 } } },
  );
  rerender({ range: { start: 20, end: 30 } });
  expect(pending[0]!.signal!.aborted).toBe(true);
  const current = {
    startSample: 5120,
    endSample: 7681,
    channels: { C3: new Float32Array([17]) },
  };
  await act(async () => pending[1]!.resolve(current));
  await act(async () =>
    pending[0]!.resolve({
      startSample: 0,
      endSample: 2561,
      channels: { C3: new Float32Array([99]) },
    }),
  );
  expect(result.current.data).toBe(current);
  expect(result.current.pending).toBe(false);
});
