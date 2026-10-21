import type { EEGAnnotation } from './annotations';
import { channelClock, type EEGRecording } from './recording';
export const ANNOTATION_BYTES = 2 * 1024 * 1024;
export const ANNOTATION_COUNT = 1000;
export function recordingContext(r: EEGRecording) {
  return {
    id: r.id,
    source: r.source,
    identity: r.identity,
    durationSeconds: r.durationSeconds,
    timeOrigin: 'first_sample',
    amplitudeUnit: 'µV',
    channels: r.channels.map((c) => ({
      id: c.id,
      label: c.label,
      ...channelClock(r, c.id),
      unit: c.unit,
    })),
  };
}
export function annotationJSON(r: EEGRecording, annotations: EEGAnnotation[]) {
  if (annotations.length > ANNOTATION_COUNT)
    throw new Error('Annotation files support at most 1,000 annotations.');
  if (annotations.some((a) => a.recordingId !== r.id))
    throw new Error('Annotations belong to another recording.');
  const text =
    JSON.stringify(
      {
        schema: 'neuroscope.annotations',
        schemaVersion: '1.0',
        exportedAt: new Date().toISOString(),
        recording: recordingContext(r),
        annotations,
      },
      null,
      2,
    ) + '\n';
  if (new Blob([text]).size > ANNOTATION_BYTES)
    throw new Error('Annotation JSON exceeds the 2 MiB limit.');
  return text;
}
function fail(): never {
  throw new Error(
    'Invalid annotation document: check schema, times, IDs, channel associations and sample anchors.',
  );
}
function obj(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail();
  return v as Record<string, unknown>;
}
function str(v: unknown, max = 128): string {
  if (typeof v !== 'string' || !v.length || v.length > max) fail();
  return v;
}
function num(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail();
  return v;
}
function timestamp(v: unknown): string {
  const s = str(v, 40);
  if (
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s) ||
    !Number.isFinite(Date.parse(s)) ||
    new Date(s).toISOString() !== s
  )
    fail();
  return s;
}
export type AnnotationImport = {
  items: EEGAnnotation[];
  verified: boolean;
  message: string;
};
export function parseAnnotationJSON(
  text: string,
  current: EEGRecording,
): AnnotationImport {
  if (new Blob([text]).size > ANNOTATION_BYTES)
    throw new Error('Annotation import is limited to 2 MiB.');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  const root = obj(raw);
  if (root.schema !== 'neuroscope.annotations' || root.schemaVersion !== '1.0')
    throw new Error(
      'Unsupported annotation schema. NeuroScope accepts neuroscope.annotations version 1.0.',
    );
  timestamp(root.exportedAt);
  const source = obj(root.recording),
    expected = recordingContext(current);
  const sourceId = str(source.id);
  if (
    source.source !== current.source ||
    source.durationSeconds !== current.durationSeconds ||
    source.timeOrigin !== 'first_sample' ||
    source.amplitudeUnit !== 'µV' ||
    !Array.isArray(source.channels) ||
    source.channels.length !== expected.channels.length
  )
    throw new Error(
      'Recording mismatch: source type, duration or channel configuration differs. Load the original recording.',
    );
  source.channels.forEach((entry, index) => {
    const c = obj(entry),
      actual = expected.channels[index]!;
    for (const key of [
      'id',
      'label',
      'sampleRateHz',
      'sampleCount',
      'unit',
    ] as const)
      if (c[key] !== actual[key])
        throw new Error(
          'Recording mismatch: channel IDs, names, native rates or sample counts differ. Load the original recording.',
        );
  });
  let verified = false;
  if (source.identity !== undefined) {
    const identity = obj(source.identity);
    if (
      !['sha256', 'synthetic-generator'].includes(str(identity.kind)) ||
      !str(identity.value, 128)
    )
      fail();
    if (
      identity.kind === 'sha256' &&
      !/^[a-f0-9]{64}$/.test(String(identity.value))
    )
      fail();
    if (current.identity) {
      if (
        identity.kind !== current.identity.kind ||
        identity.value !== current.identity.value
      )
        throw new Error(
          'Recording mismatch: the source fingerprint differs. These annotations cannot be attached to this recording.',
        );
      verified = true;
    }
  }
  if (
    !Array.isArray(root.annotations) ||
    root.annotations.length > ANNOTATION_COUNT
  )
    fail();
  const ids = new Set<string>();
  const items = root.annotations.map((value) => {
    const a = obj(value),
      id = str(a.id);
    if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id) || ids.has(id))
      throw new Error('Invalid or duplicate annotation IDs within the file.');
    ids.add(id);
    if (
      a.recordingId !== sourceId ||
      !['point', 'interval'].includes(String(a.type))
    )
      fail();
    const type = a.type as EEGAnnotation['type'];
    const startTime = num(a.startTime),
      endTime = a.endTime === undefined ? undefined : num(a.endTime);
    if (
      startTime < 0 ||
      startTime >= current.durationSeconds ||
      (type === 'point' && endTime !== undefined) ||
      (type === 'interval' &&
        (endTime === undefined ||
          endTime <= startTime ||
          endTime > current.durationSeconds))
    )
      fail();
    const channelId = a.channelId === null ? null : str(a.channelId);
    if (channelId && !current.channels.some((c) => c.id === channelId)) fail();
    const label = str(a.label, 120);
    if (!label.trim() || typeof a.notes !== 'string' || a.notes.length > 4000)
      fail();
    const createdAt = timestamp(a.createdAt),
      modifiedAt = timestamp(a.modifiedAt);
    if (modifiedAt < createdAt) fail();
    let sampleAnchor: EEGAnnotation['sampleAnchor'];
    if (channelId) {
      const anchor = obj(a.sampleAnchor),
        clock = channelClock(current, channelId);
      const start = num(anchor.startSample),
        end =
          anchor.endSample === undefined ? undefined : num(anchor.endSample);
      if (
        anchor.sampleRateHz !== clock.sampleRateHz ||
        !Number.isSafeInteger(start) ||
        start < 0 ||
        start >= clock.sampleCount ||
        Math.abs(start / clock.sampleRateHz - startTime) > 1e-10
      )
        fail();
      if (
        type === 'point'
          ? end !== undefined
          : end === undefined ||
            !Number.isSafeInteger(end) ||
            end <= start ||
            end > clock.sampleCount ||
            Math.abs(end / clock.sampleRateHz - endTime!) > 1e-10
      )
        fail();
      sampleAnchor = {
        sampleRateHz: clock.sampleRateHz,
        startSample: start,
        ...(end === undefined ? {} : { endSample: end }),
      };
    } else if (a.sampleAnchor !== undefined) fail();
    return {
      id,
      recordingId: current.id,
      type,
      startTime,
      ...(endTime === undefined ? {} : { endTime }),
      channelId,
      label,
      notes: a.notes,
      createdAt,
      modifiedAt,
      ...(sampleAnchor ? { sampleAnchor } : {}),
    };
  });
  return {
    items,
    verified,
    message: verified
      ? 'Source fingerprint and technical channel configuration match.'
      : 'Technical configuration matches, but source identity cannot be verified. Confirm that you loaded the correct original recording; matching channel names alone are not proof.',
  };
}
export function importCounts(
  existing: EEGAnnotation[],
  incoming: EEGAnnotation[],
) {
  let added = 0,
    identical = 0,
    conflicts = 0;
  for (const item of incoming) {
    const old = existing.find((a) => a.id === item.id);
    if (!old) added++;
    else if (
      [
        'type',
        'startTime',
        'endTime',
        'channelId',
        'label',
        'notes',
        'createdAt',
        'modifiedAt',
      ].every(
        (key) =>
          old[key as keyof EEGAnnotation] === item[key as keyof EEGAnnotation],
      ) &&
      JSON.stringify(old.sampleAnchor) === JSON.stringify(item.sampleAnchor)
    )
      identical++;
    else conflicts++;
  }
  return { added, identical, conflicts };
}
export function mergeAnnotations(
  existing: EEGAnnotation[],
  incoming: EEGAnnotation[],
  replace: boolean,
) {
  const merged = new Map(existing.map((a) => [a.id, a]));
  for (const item of incoming)
    if (!merged.has(item.id) || replace) merged.set(item.id, item);
  if (merged.size > ANNOTATION_COUNT)
    throw new Error(
      'An imported session can contain at most 1,000 annotations.',
    );
  return [...merged.values()].sort(
    (a, b) => a.startTime - b.startTime || a.id.localeCompare(b.id),
  );
}
