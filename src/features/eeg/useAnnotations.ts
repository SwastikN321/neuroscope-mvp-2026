import { mergeAnnotations } from './annotationPortability';
import { useEffect, useState } from 'react';
import { useBlocker } from 'react-router';
import {
  confirmAnnotationDiscard,
  makeAnnotation,
  type AnnotationDraft,
  type AnnotationSelection,
  type EEGAnnotation,
} from './annotations';
import type { EEGRecording } from './recording';

export function useAnnotations(
  recording: EEGRecording,
  onDirtyChange?: (dirty: boolean) => void,
) {
  const [items, setItems] = useState<EEGAnnotation[]>([]);
  const [draft, setDraft] = useState<AnnotationDraft | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<'navigate' | 'annotate'>('navigate');
  const [error, setError] = useState('');
  const [editFocus, setEditFocus] = useState(true);
  const dirty = items.length > 0 || draft !== null;
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (blocker.state === 'blocked') {
      if (confirmAnnotationDiscard()) blocker.proceed();
      else blocker.reset();
    }
  }, [blocker]);
  useEffect(() => {
    onDirtyChange?.(dirty);
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    if (dirty) globalThis.addEventListener('beforeunload', warn);
    return () => globalThis.removeEventListener('beforeunload', warn);
  }, [dirty, onDirtyChange]);
  function canReplaceDraft() {
    const saved = items.find((item) => item.id === draft?.id);
    const unchanged =
      saved &&
      draft &&
      ['type', 'startTime', 'endTime', 'channelId', 'label', 'notes'].every(
        (key) =>
          saved[key as keyof EEGAnnotation] ===
          draft[key as keyof AnnotationDraft],
      );
    return (
      !draft ||
      unchanged ||
      globalThis.confirm('Discard the unfinished annotation edit?')
    );
  }
  function begin(selection: AnnotationSelection, focusEditor = true) {
    if (!canReplaceDraft()) return;
    setEditFocus(focusEditor);
    setSelected(null);
    setError('');
    setDraft({ ...selection, label: '', notes: '' });
  }
  function select(item: EEGAnnotation) {
    if (!canReplaceDraft()) return;
    setEditFocus(true);
    setSelected(item.id);
    setDraft({ ...item });
    setError('');
  }
  function save(value: AnnotationDraft) {
    try {
      const item = makeAnnotation(
        recording,
        value,
        items.find((a) => a.id === value.id),
      );
      setItems((old) =>
        [...old.filter((a) => a.id !== item.id), item].sort(
          (a, b) => a.startTime - b.startTime || a.id.localeCompare(b.id),
        ),
      );
      setSelected(item.id);
      setDraft(null);
      setError('');
    } catch (failure) {
      setError((failure as Error).message);
    }
  }
  function remove(id: string) {
    if (
      !globalThis.confirm(
        'Delete this session annotation? This cannot be undone.',
      )
    )
      return;
    setItems((old) => old.filter((a) => a.id !== id));
    if (draft?.id === id) setDraft(null);
    if (selected === id) setSelected(null);
  }
  return {
    items,
    draft,
    selected,
    mode,
    setMode,
    error,
    editFocus,
    focusEditor: () => setEditFocus(true),
    begin,
    select,
    save,
    remove,
    importItems: (incoming: EEGAnnotation[], replace: boolean) => {
      if (!canReplaceDraft()) return false;
      const merged = mergeAnnotations(items, incoming, replace);
      setItems(merged);
      setDraft(null);
      setSelected(null);
      setError('');
      return true;
    },
    cancel: () => {
      if (canReplaceDraft()) {
        setDraft(null);
        setError('');
      }
    },
    change: (value: AnnotationDraft) => {
      setDraft(value);
      setError('');
    },
  };
}
export type AnnotationController = ReturnType<typeof useAnnotations>;
