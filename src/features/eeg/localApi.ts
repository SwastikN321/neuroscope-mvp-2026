import type { EEGDataSource, EEGWindow, OverviewBin } from './recording';

export type ApiChannel = {
  id: string;
  name: string;
  unit: string;
  sampling_frequency_hz: number;
  sample_count: number;
  classification: string;
};
export type ApiMetadata = {
  id: string;
  content_sha256?: string;
  duration_seconds: number;
  channels: ApiChannel[];
  expires_in_seconds: number;
  channel_type_note: string;
};
export type Limits = {
  upload_bytes: number;
  window_seconds: number;
  window_values: number;
  selected_channels: number;
  window_batch?: boolean;
};
type Display = {
  bins: {
    start_sample: number;
    end_sample: number;
    min: number;
    max: number;
    min_sample: number;
    max_sample: number;
  }[];
};
type Samples = {
  channels: { id: string; start_sample: number; values: number[] }[];
};
export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.status = status;
  }
}
const offline = () =>
  new ApiError(
    'Local EEG backend unavailable. Start FastAPI on this computer, then retry. The synthetic demo remains available.',
  );
const base = '/local-eeg';
export function localUploadsEnabled() {
  return (
    import.meta.env.DEV &&
    ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
  );
}
function endpoint(path: string) {
  if (!localUploadsEnabled())
    throw new ApiError(
      'EDF uploads are available only in the local development workspace.',
    );
  return `${base}${path}`;
}
function errorResponse(status: number, body: { error?: { message?: string } }) {
  if (status === 404)
    return new ApiError(
      'This temporary recording has expired or was deleted. Upload it again or return to the synthetic demo.',
      404,
    );
  if (status === 507)
    return new ApiError(
      'Local temporary storage is unavailable. Check free disk space and permissions, then retry.',
      507,
    );
  if (status >= 500) return offline();
  return new ApiError(
    body.error?.message || 'The local backend could not process this request.',
    status,
  );
}
// The backend permits one scientific operation at a time. Canceled queue entries
// never start; bounded busy retries cover a scan finishing after a client abort.
let tail: Promise<unknown> = Promise.resolve();
function serial<T>(
  operation: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const result = tail
    .catch(() => {})
    .then(() => {
      signal?.throwIfAborted();
      return operation();
    });
  tail = result.catch(() => {});
  return result;
}
export function request<T>(
  path: string,
  signal?: AbortSignal,
  method = 'GET',
  format: 'json' | 'blob' = 'json',
): Promise<T> {
  return serial(async () => {
    const timeout = AbortSignal.timeout(20000);
    const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await fetch(endpoint(path), {
          signal: requestSignal,
          method,
          cache: 'no-store',
        });
      } catch (error) {
        if (signal?.aborted) throw error;
        if (timeout.aborted)
          throw new ApiError(
            'Local request timed out. Retry the current view or zoom into a shorter interval.',
          );
        throw offline();
      }
      if (response.status === 429 && attempt < 8) {
        await new Promise((resolve) =>
          setTimeout(resolve, 200 * (attempt + 1)),
        );
        signal?.throwIfAborted();
        continue;
      }
      if (response.ok && format === 'blob') {
        const length = Number(response.headers.get('Content-Length'));
        if (!length || length > 16 * 1024 * 1024)
          throw new ApiError(
            'CSV response exceeds its size limit or lacks a bounded length.',
          );
        const blob = await response.blob();
        if (blob.size !== length || blob.size > 16 * 1024 * 1024)
          throw new ApiError('Incomplete or oversized CSV response.');
        return blob as T;
      }
      if (response.status === 204) return undefined as T;
      let body;
      try {
        body = await response.json();
      } catch {
        throw offline();
      }
      if (!response.ok) throw errorResponse(response.status, body);
      return body as T;
    }
  }, signal);
}
export async function uploadEDF(
  file: File,
  onProgress: (loaded: number, total: number) => void,
  signal: AbortSignal,
) {
  if (!/\.edf$/i.test(file.name))
    throw new ApiError(
      'Choose an EDF file (.edf). Other formats are not supported.',
    );
  if (file.size < 256)
    throw new ApiError('This file is too small to contain a valid EDF header.');
  const health = await request<{ limits: Limits }>('/health', signal);
  if (file.size > health.limits.upload_bytes)
    throw new ApiError(
      `File is too large. The local limit is ${Math.floor(health.limits.upload_bytes / 1048576)} MiB.`,
    );
  const metadata = await serial(
    () =>
      new Promise<ApiMetadata>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const abort = () => xhr.abort();
        signal.addEventListener('abort', abort, { once: true });
        xhr.open('POST', endpoint('/api/recordings'));
        xhr.setRequestHeader('Content-Type', 'application/octet-stream');
        xhr.timeout = 120000;
        xhr.upload.onprogress = (event) =>
          onProgress(
            event.loaded,
            event.lengthComputable ? event.total : file.size,
          );
        xhr.onloadend = () => signal.removeEventListener('abort', abort);
        xhr.onerror = () => reject(offline());
        xhr.ontimeout = () =>
          reject(
            new ApiError(
              'Upload or processing timed out. Temporary data will be cleaned up automatically.',
            ),
          );
        xhr.onabort = () =>
          reject(new DOMException('Upload canceled', 'AbortError'));
        xhr.onload = () => {
          try {
            const body = JSON.parse(xhr.responseText);
            if (xhr.status !== 201) reject(errorResponse(xhr.status, body));
            else resolve(body);
          } catch {
            reject(offline());
          }
        };
        xhr.send(file); // Raw EDF bytes, deliberately not multipart FormData.
      }),
    signal,
  );
  return { metadata, limits: health.limits };
}
export async function deleteRecording(id: string) {
  try {
    await request(`/api/recordings/${id}`, undefined, 'DELETE');
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 404)) throw error;
  }
}
const colors = [
  '#8cd9dc',
  '#82b6e9',
  '#a3a5ec',
  '#d0a1dd',
  '#91cfbc',
  '#d9c58e',
];
export async function createEDFSource(
  meta: ApiMetadata,
  limits: Limits,
  onMissing: () => void,
  signal?: AbortSignal,
  transport?: { request: typeof request; path: string; name: string },
): Promise<EEGDataSource> {
  const path = transport?.path ?? `/api/recordings/${meta.id}`;
  const send = transport?.request ?? request;
  const available = await send<{ channels: ApiChannel[] }>(
    `${path}/channels`,
    signal,
  );
  const rate = Math.max(
    ...available.channels.map((c) => c.sampling_frequency_hz),
  );
  const recording = {
    id: meta.id,
    identity: meta.content_sha256
      ? { kind: 'sha256' as const, value: meta.content_sha256 }
      : undefined,
    name: transport?.name ?? 'Local EDF recording',
    source: 'edf' as const,
    sampleRateHz: rate,
    sampleCount: Math.round(meta.duration_seconds * rate),
    durationSeconds: meta.duration_seconds,
    channels: available.channels.map((c, i) => ({
      id: c.id,
      label: c.name,
      region: `${c.sampling_frequency_hz} Hz`,
      color: colors[i % colors.length]!,
      unit: 'µV' as const,
      sampleRateHz: c.sampling_frequency_hz,
      sampleCount: c.sample_count,
    })),
    reference: 'Original acquisition reference; no re-referencing applied.',
    description: `${meta.channel_type_note} No filtering or resampling. Positive voltage plots upward.`,
  };
  // Cache <= 128 channel windows, each <= 8192 float64 values and indices.
  // At most ~16 MiB of signal arrays, regardless of recording duration.
  const cache = new Map<
    string,
    { values: Float64Array; startSample: number; indices?: number[] }
  >();
  let overview: OverviewBin[] | undefined;
  async function read<T>(url: string, signal?: AbortSignal) {
    try {
      return await send<T>(url, signal);
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 404 &&
        !signal?.aborted
      ) {
        cache.clear();
        overview = undefined;
        onMissing();
      }
      throw error;
    }
  }
  const display = (
    id: string,
    start: number,
    end: number,
    bins: number,
    signal?: AbortSignal,
  ) =>
    read<Display>(
      `${path}/display?channel_id=${encodeURIComponent(id)}&start_sample=${start}&end_sample=${end}&bins=${bins}`,
      signal,
    );
  return {
    recording,
    async exportCSV(ids, range, signal) {
      const params = new URLSearchParams({
        start_seconds: String(range.start),
        end_seconds: String(range.end),
      });
      ids.forEach((id) => params.append('channel_ids', id));
      return send<Blob>(`${path}/export.csv?${params}`, signal, 'GET', 'blob');
    },
    async readWindow(start, end, ids, signal) {
      // Revalidate even on cache hits, so deleted/expired resources cannot linger.
      await read<ApiMetadata>(path, signal);
      const result: EEGWindow = {
        startSample: start,
        endSample: end,
        channels: {},
        timing: {},
      };
      if (limits.window_batch) {
        const clock = recording.channels.find((c) => c.sampleRateHz === rate)!;
        for (const id of ids) {
          const data = cache.get(`${id}:ticks:${start}:${end}`);
          if (data) {
            result.channels[id] = data.values;
            result.timing![id] = data;
            result.reduced ||= !!data.indices;
          }
        }
        const pending = ids.filter((id) => !result.channels[id]);
        for (
          let offset = 0;
          offset < pending.length;
          offset += Math.min(8, limits.selected_channels)
        ) {
          signal?.throwIfAborted();
          const group = pending.slice(
            offset,
            offset + Math.min(8, limits.selected_channels),
          );
          const params = new URLSearchParams({
            clock_channel_id: clock.id,
            start_tick: String(start),
            end_tick: String(end),
            bins: '1024',
          });
          group.forEach((id) => params.append('channel_ids', id));
          const batch = await read<{
            channels: {
              id: string;
              start_sample: number;
              values: number[];
              indices?: number[];
            }[];
          }>(`${path}/windows?${params}`, signal);
          signal?.throwIfAborted();
          for (const channel of batch.channels) {
            cache.set(`${channel.id}:ticks:${start}:${end}`, {
              values: new Float64Array(channel.values),
              startSample: channel.start_sample,
              indices: channel.indices,
            });
            const data = cache.get(`${channel.id}:ticks:${start}:${end}`)!;
            result.channels[channel.id] = data.values;
            result.timing![channel.id] = data;
            result.reduced ||= !!data.indices;
            if (cache.size > 128) cache.delete(cache.keys().next().value!);
          }
        }
        return result;
      }
      for (const id of ids) {
        signal?.throwIfAborted();
        const channel = recording.channels.find((c) => c.id === id)!;
        const fs = channel.sampleRateHz;
        const from = Math.max(0, Math.ceil((start / rate) * fs));
        const to = Math.min(channel.sampleCount, Math.ceil((end / rate) * fs));
        const key = `${id}:${from}:${to}`;
        let data = cache.get(key);
        if (!data) {
          if (to <= from)
            data = { values: new Float64Array(), startSample: from };
          else if (
            (end - start) / rate <= limits.window_seconds &&
            to - from <= Math.min(8192, limits.window_values)
          ) {
            const params = new URLSearchParams({
              channel_ids: id,
              start_seconds: (start / rate).toFixed(12),
              end_seconds: Math.min(meta.duration_seconds, end / rate).toFixed(
                12,
              ),
            });
            const raw = (
              await read<Samples>(`${path}/samples?${params}`, signal)
            ).channels[0]!;
            data = {
              values: new Float64Array(raw.values),
              startSample: raw.start_sample,
            };
          } else {
            const reduced = await display(id, from, to, 1024, signal);
            const points = reduced.bins.flatMap((b) =>
              b.min_sample === b.max_sample
                ? [[b.min_sample, b.min]!]
                : [
                    [b.min_sample, b.min],
                    [b.max_sample, b.max],
                  ].sort((a, b) => a[0]! - b[0]!),
            );
            data = {
              values: new Float64Array(points.map((p) => p[1]!)),
              startSample: from,
              indices: points.map((p) => p[0]!),
            };
          }
          signal?.throwIfAborted();
          cache.set(key, data);
          if (cache.size > 128) cache.delete(cache.keys().next().value!);
        }
        result.channels[id] = data.values;
        result.timing![id] = data;
        result.reduced ||= !!data.indices;
      }
      return result;
    },
    async readSample(id, sample, signal) {
      const data = await display(id, sample, sample + 1, 1, signal);
      return data.bins[0]!.min;
    },
    async readOverview(id, bins, signal) {
      if (overview) {
        if (transport) await read<ApiMetadata>(path, signal);
        return overview;
      }
      const channel = recording.channels.find((c) => c.id === id)!;
      const data = await display(id, 0, channel.sampleCount, bins, signal);
      overview = data.bins.map((b) => ({
        startSample: (b.start_sample / channel.sampleRateHz) * rate,
        endSample: (b.end_sample / channel.sampleRateHz) * rate,
        min: b.min,
        max: b.max,
      }));
      return overview;
    },
  };
}
