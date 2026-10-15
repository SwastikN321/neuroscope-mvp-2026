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
) {
  const [result, setResult] = useState<{
    key: string;
    data?: EEGWindow;
    error?: string;
  }>({ key: '' });
  const [start, end] = sampleInterval(range, source.recording);
  const key = `${start}:${end}:${ids.join(',')}:${retry}`;
  useEffect(() => {
    const controller = new AbortController();
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
    return () => controller.abort();
  }, [source, start, end, ids, key]);
  return { ...result, pending: result.key !== key };
}
