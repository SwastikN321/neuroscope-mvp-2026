import { describe, expect, it, vi } from 'vitest';
import {
  makeAnnotation,
  snapSelection,
  type AnnotationDraft,
} from './annotations';
import { createSyntheticSource } from './synthetic';
const source = createSyntheticSource();
const recording = {
  ...source.recording,
  id: 'mixed-source',
  durationSeconds: 4,
  sampleRateHz: 128,
  sampleCount: 512,
  channels: source.recording.channels.slice(0, 2).map((c, i) => ({
    ...c,
    sampleRateHz: i ? 64 : 128,
    sampleCount: i ? 256 : 512,
  })),
};
const draft: AnnotationDraft = {
  type: 'point',
  startTime: 1.01,
  channelId: 'Fp2',
  label: 'Observed transient',
  notes: '',
};
describe('Annotation recording coordinates', () => {
  it('snaps by stable channel ID to the native clock, not the navigation clock', () => {
    const item = makeAnnotation(recording, draft);
    expect(item.startTime).toBe(65 / 64);
    expect(item.sampleAnchor).toEqual({ sampleRateHz: 64, startSample: 65 });
    expect(item.recordingId).toBe('mixed-source');
    expect(item.channelId).toBe('Fp2');
    expect(
      makeAnnotation(recording, { ...draft, channelId: 'Fp1' }).startTime,
    ).toBe(129 / 128);
  });
  it('supports zero, final original point, and an exclusive interval ending at duration', () => {
    expect(
      makeAnnotation(recording, { ...draft, startTime: 0 }).startTime,
    ).toBe(0);
    expect(
      makeAnnotation(recording, { ...draft, startTime: 3.999 }).startTime,
    ).toBe(255 / 64);
    const item = makeAnnotation(recording, {
      ...draft,
      type: 'interval',
      startTime: 3.98,
      endTime: 4,
    });
    expect(item.endTime).toBe(4);
    expect(item.sampleAnchor?.endSample).toBe(256);
  });
  it('preserves unquantized recording-wide time, omits point end and anchor', () => {
    const item = makeAnnotation(recording, {
      ...draft,
      channelId: null,
      endTime: 2,
    });
    expect(item.startTime).toBe(1.01);
    expect(item.endTime).toBeUndefined();
    expect(item.sampleAnchor).toBeUndefined();
  });
  it.each([
    { startTime: NaN },
    { startTime: -1 },
    { startTime: 4 },
    { type: 'interval' as const, endTime: 1 },
    { type: 'interval' as const, endTime: 4.1 },
    { type: 'interval' as const, startTime: 1, endTime: 1.001 },
    { channelId: 'renamed-label' },
    { label: '  ' },
  ])('rejects invalid annotation input %j', (change) => {
    expect(() => makeAnnotation(recording, { ...draft, ...change })).toThrow();
  });
  it('retains ID and creation time on edit and records modification time', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-10-20T12:00:00Z'));
      const original = makeAnnotation(recording, draft);
      vi.setSystemTime(new Date('2026-10-20T12:01:00Z'));
      const edited = makeAnnotation(
        recording,
        { ...original, label: 'Updated observation' },
        original,
      );
      expect(edited.id).toBe(original.id);
      expect(edited.createdAt).toBe(original.createdAt);
      expect(edited.modifiedAt).not.toBe(original.modifiedAt);
    } finally {
      vi.useRealTimers();
    }
  });
  it('is stable under repeated edits on a rational native rate without modifying signal values', async () => {
    const r = {
      ...recording,
      channels: [
        { ...recording.channels[0]!, sampleRateHz: 128 / 3, sampleCount: 512 },
      ],
      durationSeconds: 12,
    };
    let selection = snapSelection(r, {
      ...draft,
      channelId: 'Fp1',
      startTime: 2.1,
    });
    const original = selection.startTime;
    for (let i = 0; i < 100; i++) selection = snapSelection(r, selection);
    expect(selection.startTime).toBe(original);
    const before = await source.readWindow(0, 256, ['Fp1']);
    makeAnnotation(recording, draft);
    const after = await source.readWindow(0, 256, ['Fp1']);
    expect(after.channels.Fp1).toEqual(before.channels.Fp1);
  });
});
