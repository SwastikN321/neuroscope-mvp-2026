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
  const [uploaded, setUploaded] = useState<EEGDataSource | null>(null);
  const [useDemo, setUseDemo] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    'EDF files stay on this computer. Temporary recordings expire automatically.',
  );
  const [error, setError] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const expiry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const enabled = localUploadsEnabled();
  useEffect(
    () => () => {
      controller.current?.abort();
      clearTimeout(expiry.current);
    },
    [],
  );
  function missing() {
    setUploaded(null);
    setUseDemo(true);
    setError(true);
    setMessage(
      'The temporary EDF recording expired or was deleted. Showing the synthetic demo; upload again to continue.',
    );
  }
  useEffect(() => {
    if (!uploaded) return;
    const validate = () => {
      void request<ApiMetadata>(
        `/api/recordings/${uploaded.recording.id}`,
      ).catch((failure: unknown) => {
        if (
          failure instanceof Error &&
          'status' in failure &&
          failure.status === 404
        ) {
          setUploaded(null);
          setUseDemo(true);
          setError(true);
          setMessage(
            'The temporary EDF recording expired or was deleted. Showing the synthetic demo; upload again to continue.',
          );
        }
      });
    };
    window.addEventListener('focus', validate);
    return () => window.removeEventListener('focus', validate);
  }, [uploaded]);
  async function open(file: File) {
    setBusy(true);
    setError(false);
    setProgress(null);
    setMessage('Checking EDF file and local backend…');
    const abort = new AbortController();
    controller.current = abort;
    let newId: string | undefined;
    try {
      const { metadata, limits } = await uploadEDF(
        file,
        (loaded, total) => {
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
      const next = await createEDFSource(metadata, limits, missing);
      if (uploaded) await deleteRecording(uploaded.recording.id);
      abort.signal.throwIfAborted();
      setUploaded(next);
      setUseDemo(false);
      clearTimeout(expiry.current);
      expiry.current = setTimeout(missing, metadata.expires_in_seconds * 1000);
      setMessage(
        'EDF ready · original measurements in µV · stored temporarily on this computer.',
      );
    } catch (failure) {
      if (newId) void deleteRecording(newId).catch(() => {});
      if (!abort.signal.aborted) {
        setError(true);
        setMessage(
          failure instanceof Error
            ? failure.message
            : 'Unable to open EDF recording.',
        );
      }
    } finally {
      if (!abort.signal.aborted) {
        setBusy(false);
        setProgress(null);
      }
    }
  }
  async function remove() {
    if (!uploaded) return;
    setBusy(true);
    setError(false);
    setMessage('Deleting temporary EDF recording…');
    try {
      await deleteRecording(uploaded.recording.id);
      clearTimeout(expiry.current);
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
            {uploaded && (
              <>
                <button
                  disabled={busy}
                  onClick={() => {
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
