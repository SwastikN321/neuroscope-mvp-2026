import {
  channelClock,
  type EEGDataSource,
  type EEGRecording,
  type TimeRange,
} from './recording';
export const CSV_ROWS = 250000;
export const CSV_BYTES = 16 * 1024 * 1024;
export function csvBounds(r: EEGRecording, ids: string[], range: TimeRange) {
  if (
    !Number.isFinite(range.start) ||
    !Number.isFinite(range.end) ||
    range.start < 0 ||
    range.end <= range.start ||
    range.end > r.durationSeconds
  )
    throw new Error(
      'Choose a finite [start, end) interval within the recording.',
    );
  if (range.end - range.start > 60)
    throw new Error('CSV exports are limited to 60 seconds.');
  if (
    !ids.length ||
    ids.length > 32 ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !r.channels.some((c) => c.id === id))
  )
    throw new Error('Choose 1–32 unique available channels.');
  const rows = ids.reduce((total, id) => {
    const { sampleRateHz: rate } = channelClock(r, id);
    return total + Math.ceil(range.end * rate) - Math.ceil(range.start * rate);
  }, 0);
  if (rows > CSV_ROWS)
    throw new Error(
      'CSV is limited to 250,000 original samples. Reduce the interval or channels.',
    );
  return rows;
}
export function csvText(value: string) {
  const safe = /^[=+\-@\t\r\n']/.test(value) ? "'" + value : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}
export async function nativeCSV(
  source: EEGDataSource,
  ids: string[],
  range: TimeRange,
  signal: AbortSignal,
  progress: (value: string) => void,
) {
  const total = csvBounds(source.recording, ids, range);
  progress(`Reading original samples · up to ${total.toLocaleString()} rows…`);
  if (source.exportCSV) return source.exportCSV(ids, range, signal);
  if (source.recording.source !== 'synthetic')
    throw new Error(
      'This recording provider does not support original-sample export.',
    );
  const parts = [
    'channel_id,channel_name,sample_index,time_seconds,amplitude_uv\r\n',
  ];
  let bytes = parts[0]!.length,
    done = 0;
  for (const id of ids) {
    const c = source.recording.channels.find((c) => c.id === id)!;
    const clock = channelClock(source.recording, id);
    const first = Math.ceil(range.start * clock.sampleRateHz),
      end = Math.ceil(range.end * clock.sampleRateHz);
    for (let start = first; start < end; start += 4096) {
      signal.throwIfAborted();
      const stop = Math.min(end, start + 4096);
      const chunk = await source.readWindow(start, stop, [id], signal);
      signal.throwIfAborted();
      if (
        chunk.reduced ||
        chunk.timing?.[id]?.indices ||
        chunk.channels[id]?.length !== stop - start
      )
        throw new Error(
          'Original samples are required; display envelopes cannot be exported as raw EEG.',
        );
      const rows =
        Array.from(chunk.channels[id]!, (value, i) => {
          if (!Number.isFinite(value))
            throw new Error(
              'Nonfinite measurement encountered; no CSV was downloaded.',
            );
          return [
            csvText(id),
            csvText(c.label),
            start + i,
            (start + i) / clock.sampleRateHz,
            value,
          ].join(',');
        }).join('\r\n') + '\r\n';
      bytes += new Blob([rows]).size;
      if (bytes > CSV_BYTES)
        throw new Error('CSV exceeds 16 MiB. Choose a shorter interval.');
      parts.push(rows);
      done += stop - start;
      progress(
        `Preparing CSV · ${done.toLocaleString()} / ${total.toLocaleString()} rows`,
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  signal.throwIfAborted();
  return new Blob(parts, { type: 'text/csv;charset=utf-8' });
}
export function exportFilename(kind: string, extension: string) {
  return `neuroscope-${kind}-${new Date()
    .toISOString()
    .replaceAll(':', '-')
    .replace(/\.\d{3}Z$/, 'Z')}.${extension}`;
}
export function downloadFile(blob: Blob, filename: string) {
  if (!blob.size)
    throw new Error('Export is empty; no download was requested.');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  try {
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
  } catch {
    URL.revokeObjectURL(url);
    throw new Error(
      'Browser download could not be started. Check download permissions.',
    );
  } finally {
    link.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
