import { channelClock, type EEGRecording } from './recording';

/** Recording-relative seconds; intervals are [start, end). No wall-clock EDF dates. */
export type EEGAnnotation = {
  id: string;
  recordingId: string;
  type: 'point' | 'interval';
  startTime: number;
  endTime?: number;
  channelId: string | null;
  label: string;
  notes: string;
  createdAt: string;
  modifiedAt: string;
  /** Provenance for native-sample snapping; endSample is an exclusive boundary. */
  sampleAnchor?: {
    sampleRateHz: number;
    startSample: number;
    endSample?: number;
  };
};
export type AnnotationSelection = Pick<
  EEGAnnotation,
  'type' | 'startTime' | 'endTime' | 'channelId'
>;
export type AnnotationDraft = AnnotationSelection & {
  id?: string;
  label: string;
  notes: string;
};

export function snapSelection(
  recording: EEGRecording,
  selection: AnnotationSelection,
): AnnotationSelection {
  if (!selection.channelId) return selection;
  const clock = channelClock(recording, selection.channelId);
  const snap = (time: number, boundary: boolean) =>
    Math.max(
      0,
      Math.min(
        clock.sampleCount - (boundary ? 0 : 1),
        Math.round(time * clock.sampleRateHz),
      ),
    ) / clock.sampleRateHz;
  return {
    ...selection,
    startTime: snap(selection.startTime, false),
    endTime:
      selection.type === 'interval'
        ? snap(selection.endTime!, true)
        : undefined,
  };
}

export function makeAnnotation(
  recording: EEGRecording,
  draft: AnnotationDraft,
  previous?: EEGAnnotation,
): EEGAnnotation {
  if (
    draft.channelId &&
    !recording.channels.some((c) => c.id === draft.channelId)
  )
    throw new Error('Choose an available source channel.');
  if (!draft.label.trim())
    throw new Error('Add a descriptive observation label.');
  if (draft.label.length > 120 || draft.notes.length > 4000)
    throw new Error(
      'Use at most 120 label characters and 4,000 note characters.',
    );
  if (
    !Number.isFinite(draft.startTime) ||
    draft.startTime < 0 ||
    draft.startTime >= recording.durationSeconds
  )
    throw new Error('Start time must be within the recording.');
  if (
    draft.type === 'interval' &&
    (!Number.isFinite(draft.endTime) ||
      draft.endTime! <= draft.startTime ||
      draft.endTime! > recording.durationSeconds)
  )
    throw new Error(
      'End time must be after start and no later than the recording duration.',
    );
  const selection = snapSelection(recording, draft);
  if (
    selection.type === 'interval' &&
    selection.endTime! <= selection.startTime
  )
    throw new Error('The interval must span at least one native sample.');
  const clock = draft.channelId
    ? channelClock(recording, draft.channelId)
    : null;
  const now = new Date().toISOString();
  return {
    id: previous?.id ?? crypto.randomUUID(),
    recordingId: recording.id,
    type: selection.type,
    startTime: selection.startTime,
    endTime: selection.type === 'interval' ? selection.endTime : undefined,
    channelId: selection.channelId,
    label: draft.label.trim(),
    notes: draft.notes,
    createdAt: previous?.createdAt ?? now,
    modifiedAt: now,
    sampleAnchor: clock
      ? {
          sampleRateHz: clock.sampleRateHz,
          startSample: Math.round(selection.startTime * clock.sampleRateHz),
          ...(selection.type === 'interval'
            ? { endSample: Math.round(selection.endTime! * clock.sampleRateHz) }
            : {}),
        }
      : undefined,
  };
}

export function confirmAnnotationDiscard() {
  return globalThis.confirm(
    'Discard session-only annotations and any unfinished annotation edits? They are not permanently saved and cannot be recovered.',
  );
}
