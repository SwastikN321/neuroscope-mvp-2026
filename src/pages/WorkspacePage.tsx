import { useEffect, useState } from 'react';
import { RecordingSession } from '../features/eeg/RecordingSession';
import type { EEGDataSource } from '../features/eeg/recording';
import '../features/eeg/workspace.css';
export default function WorkspacePage() {
  const [source, setSource] = useState<EEGDataSource | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    // Keep the route's loading state paintable before the bounded demo generation.
    const timer = window.setTimeout(() => {
      void import('../features/eeg/synthetic')
        .then(({ createSyntheticSource }) => {
          if (!cancelled) setSource(createSyntheticSource());
        })
        .catch(() => {
          if (!cancelled) setError(true);
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);
  if (error)
    return (
      <section className="eeg-load-state" role="alert">
        <h1>Unable to prepare the demo</h1>
        <p>Reload the workspace to try again.</p>
        <a href="/app">Reload workspace</a>
        <a href="/">Return to homepage</a>
      </section>
    );
  if (!source)
    return (
      <section className="eeg-load-state eeg-initial" role="status">
        <span className="eeg-kicker">NEUROSCOPE / SYNTHETIC EEG</span>
        <p>Preparing your demo recording…</p>
      </section>
    );
  return <RecordingSession demo={source} />;
}
