import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useAuth } from '../auth/context';
import { RequireAccount } from '../auth/RequireAccount';
import { EEGWorkspace } from '../eeg/EEGWorkspace';
import {
  createEDFSource,
  type ApiMetadata,
  type Limits,
} from '../eeg/localApi';
import type { EEGDataSource } from '../eeg/recording';
import { cloudEnabled, cloudRequest } from './api';
import '../eeg/workspace.css';
export default function CloudWorkspace() {
  const { user } = useAuth(),
    { recordingId = '' } = useParams();
  return (
    <RequireAccount>
      <Viewer
        key={`${user?.id}:${recordingId}`}
        id={recordingId}
        userId={user?.id || ''}
      />
    </RequireAccount>
  );
}
function Viewer({ id, userId }: { id: string; userId: string }) {
  const [source, setSource] = useState<EEGDataSource | null>(null),
    [error, setError] = useState(''),
    [missing, setMissing] = useState(false),
    [project, setProject] = useState('');
  useEffect(() => {
    const c = new AbortController();
    async function open() {
      if (!cloudEnabled)
        throw new Error(
          'Private cloud recordings are not enabled in this build.',
        );
      const send = <T,>(
        path: string,
        signal?: AbortSignal,
        method = 'GET',
        format: 'json' | 'blob' = 'json',
      ) => cloudRequest<T>(path, signal, method, format, userId);
      const health = await send<{ limits: Limits }>(
        '/api/cloud/health',
        c.signal,
      );
      const meta = await send<
        Omit<ApiMetadata, 'expires_in_seconds'> & {
          expires_in_seconds: null;
          project_id: string;
          display_name: string;
        }
      >(`/api/cloud/recordings/${id}`, c.signal);
      const data = await createEDFSource(
        { ...meta, expires_in_seconds: 0 },
        health.limits,
        () => setMissing(true),
        c.signal,
        {
          request: send,
          path: `/api/cloud/recordings/${id}`,
          name: meta.display_name,
        },
      );
      data.recording.storage = 'private-cloud';
      if (!c.signal.aborted) {
        setProject(meta.project_id);
        setSource(data);
      }
    }
    void open().catch((e) => {
      if (!c.signal.aborted)
        setError(e instanceof Error ? e.message : 'Unable to open recording.');
    });
    return () => c.abort();
  }, [id, userId]);
  if (!source)
    return (
      <section className="eeg-load-state">
        <h1>{error ? 'Recording unavailable' : 'Opening private EDF…'}</h1>
        <p role={error ? 'alert' : 'status'}>
          {error || 'Verifying account access and original measurements.'}
        </p>
        <Link to="/dashboard">Return to projects</Link>
      </section>
    );
  return (
    <EEGWorkspace
      source={source}
      unavailable={
        missing
          ? 'Recording access ended. Export your session annotations before leaving.'
          : undefined
      }
      recordingControls={
        <section className="eeg-source-bar">
          <Link to={`/dashboard/projects/${project}`}>← Back to project</Link>
          <p>
            Private cloud EDF · Native measurements. Annotations stay in this
            browser session; export JSON before leaving. PNG and native-sample
            CSV exports remain available.
          </p>
        </section>
      }
    />
  );
}
