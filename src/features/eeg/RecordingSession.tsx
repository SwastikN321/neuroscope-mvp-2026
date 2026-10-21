import { confirmAnnotationDiscard } from './annotations';
import { useEffect, useRef, useState } from 'react';
import { EEGWorkspace } from './EEGWorkspace';
import {
  createEDFSource,
  deleteRecording,
  localUploadsEnabled,
  request,
  uploadEDF,
  type ApiMetadata,
} from './localApi';
import type { EEGDataSource } from './recording';

export function RecordingSession({ demo }: { demo: EEGDataSource }) {
  const [annotationDirty, setAnnotationDirty] = useState(false);
  const dirtyRef = useRef(false);
  useEffect(() => {
    dirtyRef.current = annotationDirty;
  }, [annotationDirty]);
  const [uploaded, setUploaded] = useState<EEGDataSource | null>(null);
  const [useDemo, setUseDemo] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState(
    'EDF files stay on this computer. Temporary recordings expire automatically.',
  );
  const [error, setError] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const activeId = useRef<string | null>(null);
  const generation = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const expiry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const enabled = localUploadsEnabled();
  useEffect(
    () => () => {
      generation.current++;
      activeId.current = null;
      controller.current?.abort();
      clearTimeout(expiry.current);
    },
    [],
  );
  function missing(id: string) {
    if (activeId.current !== id) return;
    activeId.current = null;
    clearTimeout(expiry.current);
    setUploaded(null);
    setUseDemo(true);
    setError(true);
    setMessage(
      'The temporary EDF recording expired or was deleted. Showing the synthetic demo; upload again to continue.',
    );
  }
  useEffect(() => {
    if (!uploaded) return;
    const abort = new AbortController();
    const validate = () => {
      void request<ApiMetadata>(
        `/api/recordings/${uploaded.recording.id}`,
        abort.signal,
      ).catch((failure: unknown) => {
        if (
          failure instanceof Error &&
          'status' in failure &&
          failure.status === 404 &&
          !abort.signal.aborted &&
          activeId.current === uploaded.recording.id
        ) {
          missing(uploaded.recording.id);
        }
      });
    };
    window.addEventListener('focus', validate);
    return () => {
      abort.abort();
      window.removeEventListener('focus', validate);
    };
  }, [uploaded]);
  async function open(file: File) {
    const run = ++generation.current;
    controller.current?.abort();
    setBusy(true);
    setError(false);
    setProgress(null);
    setMessage('Checking EDF file and local backend…');
    setUploading(true);
    const abort = new AbortController();
    controller.current = abort;
    let newId: string | undefined;
    try {
      const { metadata, limits } = await uploadEDF(
        file,
        (loaded, total) => {
          if (abort.signal.aborted || generation.current !== run) return;
          const percent = Math.floor((loaded / total) * 100);
          setProgress(percent);
          setMessage(
            percent >= 100
              ? 'Upload complete. Parsing and validating EDF…'
              : `Uploading to local backend · ${percent}%`,
          );
        },
        abort.signal,
      );
      newId = metadata.id;
      const next = await createEDFSource(
        metadata,
        limits,
        () => missing(metadata.id),
        abort.signal,
      );
      abort.signal.throwIfAborted();
      setUploading(false);
      if (dirtyRef.current && !confirmAnnotationDiscard()) {
        await deleteRecording(newId);
        newId = undefined;
        setMessage(
          'Replacement canceled. Current recording and annotations retained.',
        );
        return;
      }
      if (uploaded) await deleteRecording(uploaded.recording.id);
      abort.signal.throwIfAborted();
      setAnnotationDirty(false);
      activeId.current = metadata.id;
      setUploaded(next);
      setUseDemo(false);
      clearTimeout(expiry.current);
      expiry.current = setTimeout(
        () => missing(metadata.id),
        metadata.expires_in_seconds * 1000,
      );
      setMessage(
        'EDF ready · original measurements in µV · stored temporarily on this computer.',
      );
    } catch (failure) {
      if (newId) void deleteRecording(newId).catch(() => {});
      if (!abort.signal.aborted && generation.current === run) {
        setError(true);
        setMessage(
          failure instanceof Error
            ? failure.message
            : 'Unable to open EDF recording.',
        );
      }
    } finally {
      if (!abort.signal.aborted && generation.current === run) {
        controller.current = null;
        setBusy(false);
        setUploading(false);
        setProgress(null);
      }
    }
  }
  async function remove() {
    if (!uploaded) return;
    if (annotationDirty && !confirmAnnotationDiscard()) return;
    setBusy(true);
    setError(false);
    setMessage('Deleting temporary EDF recording…');
    try {
      await deleteRecording(uploaded.recording.id);
      clearTimeout(expiry.current);
      activeId.current = null;
      setAnnotationDirty(false);
      setUploaded(null);
      setUseDemo(true);
      setMessage(
        'EDF recording deleted from the local backend. Synthetic demo restored.',
      );
    } catch (failure) {
      setError(true);
      setMessage(
        failure instanceof Error ? failure.message : 'Deletion failed.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <EEGWorkspace
      key={useDemo ? demo.recording.id : uploaded?.recording.id}
      source={useDemo || !uploaded ? demo : uploaded}
      onAnnotationDirtyChange={setAnnotationDirty}
      recordingControls={
        <section
          className="eeg-source-bar"
          aria-label="Recording management"
          aria-busy={busy}
        >
          <div className="eeg-source-actions">
            <button
              className="eeg-upload-button"
              disabled={busy || !enabled}
              onClick={() => input.current?.click()}
            >
              Upload Recording
            </button>
            <input
              ref={input}
              aria-label="Choose EDF recording"
              type="file"
              accept=".edf"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void open(file);
              }}
            />
            {busy && uploading && (
              <button
                onClick={() => {
                  generation.current++;
                  controller.current?.abort();
                  controller.current = null;
                  setBusy(false);
                  setUploading(false);
                  setProgress(null);
                  setMessage(
                    'Upload canceled. Choose another EDF file. Incomplete temporary data is cleaned up by the backend.',
                  );
                }}
              >
                Cancel upload
              </button>
            )}
            {uploaded && (
              <>
                <button
                  disabled={busy}
                  onClick={() => {
                    if (annotationDirty && !confirmAnnotationDiscard()) return;
                    setAnnotationDirty(false);
                    setUseDemo(!useDemo);
                    setError(false);
                    setMessage(
                      useDemo
                        ? 'Local EDF recording selected.'
                        : 'Synthetic demo selected. Your EDF remains available until expiry.',
                    );
                  }}
                >
                  {useDemo ? 'Return to EDF' : 'Use synthetic demo'}
                </button>
                <button disabled={busy} onClick={() => void remove()}>
                  Delete EDF
                </button>
              </>
            )}
            <span className="eeg-kicker">
              {enabled
                ? 'LOCAL EDF / NO CLOUD TRANSFER'
                : 'EDF UPLOADS REQUIRE LOCAL DEVELOPMENT'}
            </span>
          </div>
          <p role={error ? 'alert' : 'status'}>{message}</p>
          {progress !== null && progress < 100 && (
            <progress
              aria-label="EDF upload progress"
              max={100}
              value={progress}
            />
          )}
        </section>
      }
    />
  );
}
