import { describe, expect, it, vi } from 'vitest';
import { createSyntheticSource } from './synthetic';
import { makeAnnotation } from './annotations';
import {
  annotationJSON,
  parseAnnotationJSON,
  mergeAnnotations,
  importCounts,
} from './annotationPortability';
import { csvBounds, csvText, nativeCSV } from './dataExport';
const source = createSyntheticSource();
const recording = source.recording;
const point = makeAnnotation(recording, {
  type: 'point',
  startTime: 1.013,
  channelId: 'Fp1',
  label: 'Point',
  notes: 'Observation only',
});
const interval = makeAnnotation(recording, {
  type: 'interval',
  startTime: 119.11,
  endTime: 120,
  channelId: 'Fp2',
  label: 'Late interval',
  notes: '',
});
const global = makeAnnotation(recording, {
  type: 'point',
  startTime: 0.0007,
  channelId: null,
  label: 'Global',
  notes: '',
});
const items = [point, interval, global];
const document = () => JSON.parse(annotationJSON(recording, items));
const parse = (value: unknown) =>
  parseAnnotationJSON(JSON.stringify(value), recording);
// FileReader also covers browsers whose Blob implementation has no text() in jsdom.
function text(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsText(blob);
  });
}
describe('portable annotations', () => {
  it('round trips all annotations, noninteger times, last boundary and native anchors exactly', () => {
    const result = parse(document());
    expect(result.verified).toBe(true);
    expect(result.items).toEqual(items);
    expect(result.items[1]!.sampleAnchor?.endSample).toBe(30720);
    expect(result.items[2]!.startTime).toBe(0.0007);
  });
  it('rebinds a re-uploaded EDF only when content fingerprint and every native clock match', () => {
    const r = {
      ...recording,
      source: 'edf' as const,
      identity: { kind: 'sha256' as const, value: 'a'.repeat(64) },
    };
    const json = annotationJSON(r, items);
    const current = { ...r, id: 'new-upload' };
    const result = parseAnnotationJSON(json, current);
    expect(result.verified).toBe(true);
    expect(result.items.map((a) => a.recordingId)).toEqual(
      items.map(() => current.id),
    );
    expect(result.items.map((a) => a.id)).toEqual(items.map((a) => a.id));
    expect(() =>
      parseAnnotationJSON(json, {
        ...current,
        identity: { ...r.identity, value: 'b'.repeat(64) },
      }),
    ).toThrow(/fingerprint/);
    expect(() =>
      parseAnnotationJSON(json, {
        ...current,
        channels: current.channels.map((c, i) =>
          i ? c : { ...c, sampleRateHz: 128 },
        ),
      }),
    ).toThrow(/mismatch/);
  });
  it('requires explicit UI confirmation when fingerprint is absent, even if session ID matches', () => {
    const doc = document();
    delete doc.recording.identity;
    expect(parse(doc).verified).toBe(false);
  });
  it.each([
    (d: ReturnType<typeof document>) => {
      d.schemaVersion = '2.0';
    },
    (d: ReturnType<typeof document>) => {
      d.annotations[0].startTime = -1;
    },
    (d: ReturnType<typeof document>) => {
      d.annotations[0].startTime = 120;
    },
    (d: ReturnType<typeof document>) => {
      d.annotations[0].startTime += 0.01;
    },
    (d: ReturnType<typeof document>) => {
      d.annotations[0].channelId = 'unknown';
    },
    (d: ReturnType<typeof document>) => {
      d.annotations[0].recordingId = 'other';
    },
    (d: ReturnType<typeof document>) => {
      d.annotations[0].sampleAnchor.startSample++;
    },
    (d: ReturnType<typeof document>) => {
      d.annotations[1].endTime = 121;
    },
    (d: ReturnType<typeof document>) => {
      d.annotations[0].createdAt = '2026-02-31T00:00:00.000Z';
    },
    (d: ReturnType<typeof document>) => {
      d.annotations.push(d.annotations[0]);
    },
    (d: ReturnType<typeof document>) => {
      d.annotations[0].id = 'not-uuid';
    },
    (d: ReturnType<typeof document>) => {
      d.recording.channels[0].label = 'changed';
    },
    (d: ReturnType<typeof document>) => {
      d.annotations[2].sampleAnchor = { startSample: 0 };
    },
  ])('rejects invalid structure or scientific association %s', (change) => {
    const doc = document();
    change(doc);
    expect(() => parse(doc)).toThrow();
  });
  it('rejects malformed and oversized files; ignores additive fields within version 1.0', () => {
    expect(() => parseAnnotationJSON('{', recording)).toThrow(/valid JSON/);
    expect(() =>
      parseAnnotationJSON(' '.repeat(2 * 1024 * 1024 + 1), recording),
    ).toThrow(/2 MiB/);
    const doc = document();
    doc.futureOptionalField = 'ignored';
    expect(parse(doc).items).toEqual(items);
  });
  it('does not overwrite conflicts unless replacement is chosen; repeated imports are idempotent', () => {
    const changed = { ...point, label: 'Edited' };
    expect(importCounts([point], [changed, interval])).toEqual({
      added: 1,
      identical: 0,
      conflicts: 1,
    });
    expect(mergeAnnotations([point], [changed], false)).toEqual([point]);
    expect(mergeAnnotations([point], [changed], true)).toEqual([changed]);
    expect(mergeAnnotations(items, items, false)).toHaveLength(3);
  });
});
describe('native CSV exports', () => {
  it('exports exact synthetic Float32 measurements, original indexes, times and selected channel order', async () => {
    const range = { start: 0.113, end: 1.015625 };
    const first = Math.ceil(range.start * 256),
      stop = Math.ceil(range.end * 256);
    const ids = ['Fp2', 'Fp1'];
    const csv = await text(
      await nativeCSV(
        source,
        ids,
        range,
        new AbortController().signal,
        vi.fn(),
      ),
    );
    const rows = csv.trim().split('\r\n');
    expect(rows.shift()).toBe(
      'channel_id,channel_name,sample_index,time_seconds,amplitude_uv',
    );
    expect(rows).toHaveLength((stop - first) * 2);
    const data = await source.readWindow(first, stop, ids);
    rows.forEach((row, i) => {
      const [id, , index, time, value] = row.split(',');
      const channel = ids[Math.floor(i / (stop - first))]!;
      const sample = first + (i % (stop - first));
      expect(id).toBe('"' + channel + '"');
      expect(Number(index)).toBe(sample);
      expect(Number(time)).toBe(sample / 256);
      expect(Number(value)).toBe(data.channels[channel]![sample - first]);
    });
  });
  it('rejects invalid boundaries, duplicate channels and resource overruns', () => {
    for (const range of [
      { start: -1, end: 1 },
      { start: 1, end: 1 },
      { start: 0, end: 61 },
      { start: 119, end: 121 },
      { start: NaN, end: 1 },
    ])
      expect(() => csvBounds(recording, ['Fp1'], range)).toThrow();
    expect(() =>
      csvBounds(recording, ['Fp1', 'Fp1'], { start: 0, end: 1 }),
    ).toThrow();
    expect(() =>
      csvBounds({ ...recording, sampleRateHz: 1000000 }, ['Fp1'], {
        start: 0,
        end: 1,
      }),
    ).toThrow(/250,000/);
  });
  it('never falls back to display data for EDF or exports reduced synthetic envelopes', async () => {
    const range = { start: 0, end: 1 },
      signal = new AbortController().signal;
    await expect(
      nativeCSV(
        { ...source, recording: { ...recording, source: 'edf' } },
        ['Fp1'],
        range,
        signal,
        vi.fn(),
      ),
    ).rejects.toThrow(/provider/);
    await expect(
      nativeCSV(
        {
          ...source,
          readWindow: async () => ({
            startSample: 0,
            endSample: 256,
            reduced: true,
            channels: { Fp1: new Float32Array(256) },
          }),
        },
        ['Fp1'],
        range,
        signal,
        vi.fn(),
      ),
    ).rejects.toThrow(/display envelopes/);
  });
  it('honors cancellation and delegates genuine EDF export only to the native endpoint', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      nativeCSV(
        source,
        ['Fp1'],
        { start: 0, end: 1 },
        controller.signal,
        vi.fn(),
      ),
    ).rejects.toThrow();
    const exportCSV = vi.fn(async () => new Blob(['native']));
    await nativeCSV(
      { ...source, exportCSV },
      ['Fp2'],
      { start: 0.1, end: 0.2 },
      new AbortController().signal,
      vi.fn(),
    );
    expect(exportCSV).toHaveBeenCalledOnce();
  });
  it('reversibly escapes formula-like channel labels and CSV quotes', () => {
    expect(csvText('=x')).toBe('"\'=x"');
    expect(csvText("'x")).toBe('"\'\'x"');
    expect(csvText('EEG "Fp1",left')).toBe('"EEG ""Fp1"",left"');
  });
});
