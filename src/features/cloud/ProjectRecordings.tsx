import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/context';
import { Button } from '../../components/ui/Button';
import {
  cloudRequest,
  uploadCloudEDF,
  type CloudListing,
  type CloudRecording,
  MVP_UPLOAD_BYTES,
} from './api';
import './cloud.css';
export function ProjectRecordings({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const [listing, setListing] = useState<CloudListing | null>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [file, setFile] = useState<File | null>(null),
    [name, setName] = useState('EEG recording'),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState<number | null>(null);
  const [removing, setRemoving] = useState<CloudRecording | null>(null);
  const active = useRef<AbortController | null>(null),
    mounted = useRef(true);
  const keepButton = useRef<HTMLButtonElement>(null);
  const deleteTrigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (removing) keepButton.current?.focus();
  }, [removing]);
  function closeConfirmation() {
    setRemoving(null);
    deleteTrigger.current?.focus();
  }
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const data = await cloudRequest<CloudListing>(
        `/api/cloud/projects/${projectId}/recordings`,
        signal,
        'GET',
        'json',
        user?.id,
      );
      if (!signal?.aborted && mounted.current) setListing(data);
    },
    [projectId, user?.id],
  );
  useEffect(() => {
    mounted.current = true;
    const c = new AbortController();
    void load(c.signal).catch((e) => {
      if (!c.signal.aborted) setError(e.message);
    });
    return () => {
      mounted.current = false;
      c.abort();
      active.current?.abort();
    };
  }, [load]);
  async function upload() {
    if (!file || !user || busy) return;
    const c = new AbortController();
    active.current = c;
    setBusy(true);
    setError('');
    setProgress(0);
    try {
      await uploadCloudEDF(
        projectId,
        file,
        name,
        setProgress,
        c.signal,
        user.id,
        listing?.quota.max_file_bytes ?? MVP_UPLOAD_BYTES,
      );
      if (mounted.current) {
        setFile(null);
        setNotice('EDF validated and saved privately. Open it below.');
      }
    } catch (e) {
      if (mounted.current)
        setError(
          c.signal.aborted
            ? 'Upload canceled. Refresh to check for a recoverable transfer entry.'
            : e instanceof Error
              ? e.message
              : 'Upload failed.',
        );
    } finally {
      active.current = null;
      if (mounted.current) {
        setBusy(false);
        setProgress(null);
        void load().catch((e) => setError(e.message));
      }
    }
  }
  async function remove() {
    if (!removing || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await cloudRequest<{ message: string }>(
        `/api/cloud/recordings/${removing.id}`,
        undefined,
        'DELETE',
        'json',
        user?.id,
      );
      if (mounted.current) {
        setNotice(result.message);
        setRemoving(null);
        await load();
      }
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof Error ? e.message : 'Deletion could not be confirmed.',
        );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <section
      className="projects-panel cloud-recordings"
      aria-label="Private cloud recordings"
      aria-busy={busy}
    >
      <div className="projects-title">
        <h2>Private recordings</h2>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            setError('');
            void load().catch((e) => setError(e.message));
          }}
        >
          Refresh recordings
        </Button>
      </div>
      <p>
        Validated EDF recordings, saved to this project. Only your account can
        access them through NeuroScope. Authorized service operators also have
        administrative access. Do not upload identifiable patient data.
      </p>
      {listing && (
        <p className="cloud-quota">
          {listing.quota.used_slots} / {listing.quota.max_slots} account slots
          used ·{' '}
          {Math.min(MVP_UPLOAD_BYTES, listing.quota.max_file_bytes) / 1_000_000}{' '}
          MB per recording
        </p>
      )}
      <form
        className="cloud-upload"
        onSubmit={(e) => {
          e.preventDefault();
          void upload();
        }}
      >
        <label>
          Recording display name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            required
            disabled={busy}
          />
        </label>
        <label>
          EDF file
          <input
            type="file"
            accept=".edf"
            disabled={
              busy ||
              !listing ||
              listing.quota.used_slots >= listing.quota.max_slots
            }
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <p>
          Maximum{' '}
          {Math.min(
            MVP_UPLOAD_BYTES,
            listing?.quota.max_file_bytes ?? MVP_UPLOAD_BYTES,
          ).toLocaleString('en-US')}{' '}
          bytes. Larger cloud uploads are unavailable in this MVP. Transfers are
          not resumable. After an interruption, refresh before retrying.
        </p>
        <Button
          disabled={
            busy ||
            !file ||
            !name.trim() ||
            !listing ||
            listing.quota.used_slots >= listing.quota.max_slots
          }
          type="submit"
        >
          {busy && progress !== null
            ? 'Validating and saving…'
            : 'Upload EDF privately'}
        </Button>
        {progress !== null && (
          <>
            <progress
              aria-label="Cloud upload progress"
              max={100}
              value={progress}
            />
            <span>
              {progress < 100
                ? `${Math.floor(progress)}% sent`
                : 'Transfer received · validating and saving'}
            </span>
            <Button
              variant="text"
              type="button"
              onClick={() => active.current?.abort()}
            >
              Cancel transfer
            </Button>
          </>
        )}
      </form>
      {error && (
        <p role="alert" className="account-error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {listing && !listing.recordings.length && (
        <p>No cloud recordings in this project yet.</p>
      )}
      <ul className="cloud-list">
        {listing?.recordings.map((r) => (
          <li key={r.id}>
            <div>
              <strong>{r.display_name}</strong>
              <span>
                {(r.file_size_bytes / 1_000_000).toFixed(2)} MB ·{' '}
                {r.status === 'ready'
                  ? `${r.channel_count} channels · ${r.duration_seconds} s`
                  : r.status === 'deleted'
                    ? 'Cleanup pending'
                    : r.status}
              </span>
              {r.cleanup_after && r.status !== 'ready' && (
                <small>
                  Retry cleanup after{' '}
                  {new Date(r.cleanup_after).toLocaleString()} if this transfer
                  was interrupted.
                </small>
              )}
            </div>
            <div className="project-actions">
              {r.status === 'ready' && (
                <Link to={`/app/recordings/${r.id}`}>Open recording ↗</Link>
              )}
              <Button
                variant="text"
                disabled={busy}
                onClick={(event) => {
                  deleteTrigger.current = event.currentTarget;
                  setRemoving(r);
                }}
              >
                {r.status === 'deleted' ? 'Retry cleanup' : 'Delete recording'}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {removing && (
        <div
          className="cloud-confirm"
          role="alertdialog"
          aria-modal="false"
          aria-labelledby="cloud-delete-title"
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !busy) closeConfirmation();
          }}
        >
          <h3 id="cloud-delete-title">Delete “{removing.display_name}”?</h3>
          <p>
            This permanently removes its private EDF. Export any session
            annotations first. Interrupted transfers may retain a recovery entry
            and quota for up to one hour.
          </p>
          <Button disabled={busy} onClick={() => void remove()}>
            Confirm recording deletion
          </Button>
          <Button
            variant="secondary"
            ref={keepButton}
            disabled={busy}
            onClick={closeConfirmation}
          >
            Keep recording
          </Button>
        </div>
      )}
    </section>
  );
}
