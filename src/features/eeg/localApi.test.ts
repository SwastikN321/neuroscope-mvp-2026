import { afterEach, expect, it, vi } from 'vitest';
import {
  ApiError,
  createEDFSource,
  uploadEDF,
  type ApiMetadata,
} from './localApi';
import { channelClock, sampleAt, sampleValue } from './recording';
const channels = [
  {
    id: 'ch000',
    name: 'EEG Fp1',
    unit: 'µV',
    sampling_frequency_hz: 128,
    sample_count: 7680,
    classification: 'explicit_eeg',
  },
  {
    id: 'ch001',
    name: 'C4',
    unit: 'µV',
    sampling_frequency_hz: 64,
    sample_count: 3840,
    classification: 'assumed_eeg',
  },
];
const meta: ApiMetadata = {
  id: 'test',
  duration_seconds: 60,
  channels,
  expires_in_seconds: 3600,
  channel_type_note: 'Native channels',
};
const limits = {
  upload_bytes: 1024,
  window_seconds: 30,
  window_values: 250000,
  selected_channels: 32,
};
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status });
afterEach(() => vi.unstubAllGlobals());
it('maps native clocks and original µV without additional scaling; caches windows but revalidates existence', async () => {
  let sampleCalls = 0;
  const mock = vi.fn(async (input: string) => {
    const url = new URL(input, 'http://localhost');
    if (url.pathname.endsWith('/channels')) return response({ channels });
    if (url.pathname.endsWith('/samples')) {
      sampleCalls++;
      const id = url.searchParams.get('channel_ids')!;
      const rate = id === 'ch000' ? 128 : 64;
      const start = Math.ceil(
        Number(url.searchParams.get('start_seconds')) * rate,
      );
      return response({
        channels: [{ id, start_sample: start, values: [12.123456789, -91.5] }],
      });
    }
    return response(meta);
  });
  vi.stubGlobal('fetch', mock);
  const source = await createEDFSource(meta, limits, vi.fn());
  const data = await source.readWindow(128, 256, ['ch000', 'ch001']);
  expect(channelClock(source.recording, 'ch001')).toEqual({
    sampleRateHz: 64,
    sampleCount: 3840,
  });
  expect(sampleAt(data, 'ch001', 0)).toBe(64);
  expect(sampleValue(data, 'ch001', 64)).toBe(12.123456789);
  expect(sampleValue(data, 'ch000', 129)).toBe(-91.5);
  await source.readWindow(128, 256, ['ch000', 'ch001']);
  expect(sampleCalls).toBe(2);
  expect(mock.mock.calls.filter(([url]) => url.endsWith('/test'))).toHaveLength(
    2,
  );
});
it('uses original extrema indices for wide views and exact sample retrieval for inspection', async () => {
  const mock = vi.fn(async (input: string) => {
    const url = new URL(input, 'http://localhost');
    if (url.pathname.endsWith('/channels')) return response({ channels });
    if (url.pathname.endsWith('/display'))
      return response({
        bins: [
          {
            start_sample: 0,
            end_sample: 7680,
            min: -200,
            max: 111,
            min_sample: 7,
            max_sample: 5,
          },
        ],
      });
    return response(meta);
  });
  vi.stubGlobal('fetch', mock);
  const source = await createEDFSource(meta, limits, vi.fn());
  const data = await source.readWindow(0, 7680, ['ch000']);
  expect(data.reduced).toBe(true);
  expect(data.timing!.ch000!.indices).toEqual([5, 7]);
  expect([...data.channels.ch000!]).toEqual([111, -200]);
  expect(sampleValue(data, 'ch000', 6)).toBeUndefined();
  await source.readSample!('ch000', 6);
  expect(mock.mock.calls.at(-1)![0]).toContain(
    'start_sample=6&end_sample=7&bins=1',
  );
  expect(mock.mock.calls.some(([url]) => url.includes('/samples'))).toBe(false);
});
it('clears cached recording state on expiry and never substitutes demo samples', async () => {
  const missing = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) =>
      input.endsWith('/channels') ? response({ channels }) : response({}, 404),
    ),
  );
  const source = await createEDFSource(meta, limits, missing);
  await expect(source.readWindow(0, 128, ['ch000'])).rejects.toThrow('expired');
  expect(missing).toHaveBeenCalledOnce();
});
it('rejects wrong file types, empty and oversized files before transmitting bytes', async () => {
  const mock = vi.fn(async () => response({ limits }));
  vi.stubGlobal('fetch', mock);
  const controller = new AbortController();
  for (const file of [
    new File(['bad'], 'file.csv'),
    new File(['bad'], 'file.edf'),
    new File([new Uint8Array(2048)], 'file.edf'),
  ]) {
    await expect(
      uploadEDF(file, vi.fn(), controller.signal),
    ).rejects.toBeInstanceOf(ApiError);
  }
  expect(mock).toHaveBeenCalledTimes(1);
});
it('does not issue requests for already canceled windows', async () => {
  const mock = vi.fn(async () => response({ channels }));
  vi.stubGlobal('fetch', mock);
  const source = await createEDFSource(meta, limits, vi.fn());
  const controller = new AbortController();
  controller.abort();
  await expect(
    source.readWindow(0, 128, ['ch000'], controller.signal),
  ).rejects.toThrow();
  expect(mock).toHaveBeenCalledTimes(1);
});

it('batches native integer-clock windows and retains exact per-channel offsets', async () => {
  const mock = vi.fn(async (input: string) => {
    const url = new URL(input, 'http://localhost');
    if (url.pathname.endsWith('/channels')) return response({ channels });
    if (url.pathname.endsWith('/windows')) {
      expect(url.searchParams.getAll('channel_ids')).toEqual([
        'ch000',
        'ch001',
      ]);
      expect(url.searchParams.get('start_tick')).toBe('1');
      expect(url.searchParams.get('clock_channel_id')).toBe('ch000');
      return response({
        channels: [
          { id: 'ch000', start_sample: 1, values: [13.123456789] },
          { id: 'ch001', start_sample: 1, values: [-7.25] },
        ],
      });
    }
    return response(meta);
  });
  vi.stubGlobal('fetch', mock);
  const source = await createEDFSource(
    meta,
    { ...limits, window_batch: true },
    vi.fn(),
  );
  const data = await source.readWindow(1, 3, ['ch000', 'ch001']);
  expect(sampleValue(data, 'ch000', 1)).toBe(13.123456789);
  expect(sampleValue(data, 'ch001', 1)).toBe(-7.25);
  await source.readWindow(1, 3, ['ch000', 'ch001']);
  expect(
    mock.mock.calls.filter(([url]) => url.includes('/windows?')),
  ).toHaveLength(1);
});
it('uses the native CSV endpoint with bounded blob validation and exposes source identity', async () => {
  const csv =
    'channel_id,channel_name,sample_index,time_seconds,amplitude_uv\r\nch001,C4,1,0.015625,12.123456789\r\n';
  const mock = vi.fn(async (input: string) => {
    if (input.includes('/export.csv?'))
      return new Response(csv, {
        headers: {
          'Content-Length': String(csv.length),
          'Content-Type': 'text/csv',
        },
      });
    return response({ channels });
  });
  vi.stubGlobal('fetch', mock);
  const source = await createEDFSource(
    { ...meta, content_sha256: 'a'.repeat(64) },
    limits,
    vi.fn(),
  );
  expect(source.recording.identity).toEqual({
    kind: 'sha256',
    value: 'a'.repeat(64),
  });
  const blob = await source.exportCSV!(['ch001', 'ch000'], {
    start: 0.113,
    end: 1.237,
  });
  expect(await blob.text()).toBe(csv);
  const url = new URL(
    mock.mock.calls.find(([url]) => url.includes('/export.csv?'))![0],
    'http://localhost',
  );
  expect(url.searchParams.getAll('channel_ids')).toEqual(['ch001', 'ch000']);
  expect(url.searchParams.get('start_seconds')).toBe('0.113');
  expect(mock.mock.calls.some(([url]) => url.includes('/display'))).toBe(false);
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () => new Response(csv, { headers: { 'Content-Length': '1' } }),
    ),
  );
  await expect(
    source.exportCSV!(['ch001'], { start: 0, end: 1 }),
  ).rejects.toThrow();
});

it('routes cloud samples, cached reauthorization and CSV through the authenticated transport', async () => {
  let revoked = false;
  const missing = vi.fn();
  const blob = new Blob(['sample_index,amplitude_uv\n0,-200\n']);
  const send = vi.fn(
    async (
      path: string,
      _signal?: AbortSignal,
      _method?: string,
      format?: string,
    ): Promise<unknown> => {
      if (revoked) throw new ApiError('No longer available', 404);
      if (format === 'blob') return blob;
      if (path.endsWith('/channels')) return { channels };
      if (path.includes('/display'))
        return {
          bins: [
            {
              start_sample: 0,
              end_sample: 7680,
              min: -200,
              max: 111,
              min_sample: 7,
              max_sample: 5,
            },
          ],
        };
      return meta;
    },
  );
  const source = await createEDFSource(meta, limits, missing, undefined, {
    request: send as <T>(
      path: string,
      signal?: AbortSignal,
      method?: string,
      format?: 'json' | 'blob',
    ) => Promise<T>,
    path: '/api/cloud/recordings/test',
    name: 'Private test EDF',
  });
  expect(source.recording.name).toBe('Private test EDF');
  const overview = await source.readOverview('ch000', 100);
  expect(overview[0]!.min).toBe(-200);
  expect(await source.readOverview('ch000', 100)).toBe(overview);
  expect(send.mock.calls.at(-1)![0]).toBe('/api/cloud/recordings/test');
  expect(await source.exportCSV!(['ch000'], { start: 0, end: 1 })).toBe(blob);
  expect(send.mock.calls.at(-1)![0]).toContain(
    '/api/cloud/recordings/test/export.csv',
  );
  expect(
    send.mock.calls.every(([path]) =>
      path.startsWith('/api/cloud/recordings/test'),
    ),
  ).toBe(true);
  revoked = true;
  await expect(source.readOverview('ch000', 100)).rejects.toThrow(
    'No longer available',
  );
  expect(missing).toHaveBeenCalledOnce();
});
