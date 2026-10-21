import { useEffect, useState } from 'react';
import {
  sampleInterval,
  type EEGDataSource,
  type EEGWindow,
  type TimeRange,
} from './recording';
export function useRecordingWindow(
  source: EEGDataSource,
  range: TimeRange,
  ids: string[],
  retry: number,
  enabled = true,
) {
  const [result, setResult] = useState<{
    key: string;
    data?: EEGWindow;
    error?: string;
  }>({ key: '' });
  const [start, end] = sampleInterval(range, source.recording);
  const key = `${start}:${end}:${ids.join(',')}:${retry}`;
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const read = () => {
      void source
        .readWindow(start, end, ids, controller.signal)
        .then((data) => {
          if (!controller.signal.aborted) setResult({ key, data });
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted)
            setResult({
              key,
              error:
                error instanceof Error
                  ? error.message
                  : 'Unable to read recording',
            });
        });
    };
    // Coalesce pointer/slider movement for remote windows; synthetic reads stay immediate.
    const timer =
      source.recording.source === 'edf' ? setTimeout(read, 80) : undefined;
    if (timer === undefined) read();
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [source, start, end, ids, key, enabled]);
  return { ...result, pending: result.key !== key };
}
