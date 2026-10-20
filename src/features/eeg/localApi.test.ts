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
