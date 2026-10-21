import { useEffect, useRef, useState } from 'react';
import {
  ANNOTATION_BYTES,
  importCounts,
  parseAnnotationJSON,
  type AnnotationImport as ImportReview,
} from './annotationPortability';
import type { EEGRecording } from './recording';
import type { AnnotationController } from './useAnnotations';
export function AnnotationImport({
  recording,
  annotations,
}: {
  recording: EEGRecording;
  annotations: AnnotationController;
}) {
  const file = useRef<HTMLInputElement>(null),
    generation = useRef(0);
  const [review, setReview] = useState<ImportReview | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [replace, setReplace] = useState(false),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  async function load(input: File) {
    const run = ++generation.current;
    setBusy(true);
    setReview(null);
    setMessage('Reading annotation file…');
    setConfirmed(false);
    setReplace(false);
    try {
      if (input.size > ANNOTATION_BYTES)
        throw new Error('Annotation import is limited to 2 MiB.');
      const result = parseAnnotationJSON(await input.text(), recording);
      if (run === generation.current) {
        setReview(result);
        setMessage(
          'Review compatibility before importing. No annotations have changed.',
        );
      }
    } catch (failure) {
      if (run === generation.current) setMessage((failure as Error).message);
    } finally {
      if (run === generation.current) setBusy(false);
    }
  }
  const counts = review ? importCounts(annotations.items, review.items) : null;
  return (
    <div className="eeg-annotation-import">
      <button disabled={busy} onClick={() => file.current?.click()}>
        Import Annotations
      </button>
      <input
        ref={file}
        type="file"
        accept=".json,application/json"
        aria-label="Choose annotation JSON"
        hidden
        onChange={(e) => {
          const selected = e.target.files?.[0];
          e.target.value = '';
          if (selected) void load(selected);
        }}
      />
      {review && (
        <section aria-label="Annotation import review">
          <p>{review.message}</p>
          <p>
            {counts!.added} new · {counts!.identical} identical IDs skipped ·{' '}
            {counts!.conflicts} conflicting IDs
          </p>
          {!review.verified && (
            <label>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              I confirm this is the correct original recording despite
              unverified identity
            </label>
          )}
          {counts!.conflicts > 0 && (
            <label>
              <input
                type="checkbox"
                checked={replace}
                onChange={(e) => setReplace(e.target.checked)}
              />
              Replace conflicting annotation IDs (otherwise keep current
              annotations)
            </label>
          )}
          <button
            disabled={!review.verified && !confirmed}
            onClick={() => {
              if (
                replace &&
                counts!.conflicts &&
                !globalThis.confirm(
                  `Replace ${counts!.conflicts} existing annotations with the imported versions?`,
                )
              )
                return;
              try {
                if (annotations.importItems(review.items, replace)) {
                  setMessage(
                    `Import complete: ${counts!.added} added, ${replace ? counts!.conflicts : 0} replaced. Still session-only; keep your JSON file.`,
                  );
                  setReview(null);
                }
              } catch (error) {
                setMessage((error as Error).message);
              }
            }}
          >
            Confirm import
          </button>
        </section>
      )}
      {(review || busy) && (
        <button
          onClick={() => {
            generation.current++;
            setBusy(false);
            setReview(null);
            setMessage('Import canceled. Current annotations are unchanged.');
          }}
        >
          Cancel import
        </button>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
