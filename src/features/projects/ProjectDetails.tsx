import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { RequireAccount } from '../auth/RequireAccount';
import { useAuth } from '../auth/context';
import { AuthLayout } from '../auth/AuthLayout';
import { Button } from '../../components/ui/Button';
import { getProject, deleteProject, type ResearchProject } from './api';
import { useProjectResource } from './useProjectResource';
import { ProjectForm } from './ProjectForm';
import './projects.css';
import { cloudEnabled } from '../cloud/api';
import { ProjectRecordings } from '../cloud/ProjectRecordings';
export default function ProjectDetails() {
  const { user } = useAuth();
  const { projectId = '' } = useParams();
  return (
    <RequireAccount>
      <Detail key={`${user?.id}:${projectId}`} id={projectId} />
    </RequireAccount>
  );
}
function Detail({ id }: { id: string }) {
  const load = useCallback((s: AbortSignal) => getProject(id, s), [id]);
  const { state, reload } = useProjectResource(load);
  return (
    <AuthLayout wide>
      <Link className="project-back" to="/dashboard">
        ← All projects
      </Link>
      {state.status === 'loading' ? (
        <p role="status" className="project-state">
          Opening your project…
        </p>
      ) : state.status === 'error' ? (
        <div className="project-state">
          <h1>Unable to open this project</h1>
          <p role="alert" className="account-error">
            {state.message}
          </p>
          <Button variant="secondary" onClick={reload}>
            Retry project
          </Button>
        </div>
      ) : !state.data ? (
        <div className="project-state">
          <h1>Project unavailable</h1>
          <p>
            This project does not exist or you do not have access. Return to
            your project list.
          </p>
        </div>
      ) : (
        <ProjectContent
          key={state.data.updated_at}
          project={state.data}
          reload={reload}
        />
      )}
    </AuthLayout>
  );
}
function ProjectContent({
  project,
  reload,
}: {
  project: ResearchProject;
  reload: () => void;
}) {
  const [editing, setEditing] = useState(false),
    [deleting, setDeleting] = useState(false);
  return (
    <>
      <header className="project-detail-heading">
        <span className="account-eyebrow">
          PRIVATE RESEARCH PROJECT / {project.status.toUpperCase()}
        </span>
        <h1>{project.name}</h1>
        <p>Project details saved to your account.</p>
      </header>
      <div className="project-detail-grid">
        <section className="projects-panel">
          {editing ? (
            <ProjectForm
              project={project}
              onCancel={() => setEditing(false)}
              onSaved={reload}
            />
          ) : (
            <>
              <div className="projects-title">
                <h2>Research overview</h2>
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  Edit project
                </Button>
              </div>
              <p className="project-description">
                {project.description ||
                  'Add a description to outline your research question and intentions.'}
              </p>
            </>
          )}
          <dl className="project-meta">
            <dt>Created</dt>
            <dd>{new Date(project.created_at).toLocaleString()}</dd>
            <dt>Last updated</dt>
            <dd>{new Date(project.updated_at).toLocaleString()}</dd>
          </dl>
        </section>
        {!cloudEnabled && (
          <aside className="project-next">
            <span className="account-eyebrow">THE NEXT STEP</span>
            <h2>Explore the signal.</h2>
            <p>
              Open the EEG workspace to explore a synthetic example or a local
              EDF. Recordings and annotations are not linked to this project
              yet.
            </p>
            <Link to="/app">Open EEG workspace ↗</Link>
            <p className="project-hint">
              Export workspace changes before leaving. Cloud recording storage
              is not available.
            </p>
          </aside>
        )}
      </div>
      {cloudEnabled && <ProjectRecordings projectId={project.id} />}
      <section className="project-delete">
        <div>
          <h2>Delete project</h2>
          <p>
            Permanently remove this project’s name and description from your
            account. Delete its cloud recordings and complete any pending
            cleanup first.
          </p>
        </div>
        <Button variant="text" onClick={() => setDeleting(true)}>
          Delete project
        </Button>
      </section>
      {deleting && (
        <DeleteConfirmation
          project={project}
          cancel={() => setDeleting(false)}
        />
      )}
    </>
  );
}
function DeleteConfirmation({
  project,
  cancel,
}: {
  project: ResearchProject;
  cancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [confirmation, setConfirmation] = useState('');
  const navigate = useNavigate();
  useEffect(() => {
    const d = dialog.current!;
    d.showModal();
    return () => {
      d.close();
      request.current?.abort();
    };
  }, []);
  async function remove() {
    if (confirmation !== 'DELETE' || request.current) return;
    const c = new AbortController();
    request.current = c;
    setBusy(true);
    setError('');
    try {
      await deleteProject(project, c.signal);
      if (!c.signal.aborted) navigate('/dashboard', { replace: true });
    } catch (e) {
      if (!c.signal.aborted)
        setError(
          e instanceof Error ? e.message : 'Unable to delete this project.',
        );
    } finally {
      if (!c.signal.aborted) {
        request.current = null;
        setBusy(false);
      }
    }
  }
  return (
    <dialog
      ref={dialog}
      className="project-dialog"
      aria-labelledby="delete-project-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) cancel();
      }}
    >
      <h2 id="delete-project-title">Delete this project?</h2>
      <p>
        “{project.name}” will be permanently deleted. This cannot be undone.
        Local EEG files and exported annotations are unaffected.
      </p>
      <label>
        Type DELETE to confirm
        <input
          autoFocus
          disabled={busy}
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          autoComplete="off"
        />
      </label>
      {error && (
        <p className="account-error" role="alert">
          {error}
        </p>
      )}
      <div className="project-actions">
        <Button
          disabled={busy || confirmation !== 'DELETE'}
          onClick={() => void remove()}
        >
          {busy ? 'Deleting…' : 'Permanently delete'}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={cancel}>
          Keep project
        </Button>
      </div>
    </dialog>
  );
}
