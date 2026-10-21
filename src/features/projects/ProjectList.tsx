import { useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '../../components/ui/Button';
import { listProjects } from './api';
import { useProjectResource } from './useProjectResource';
import { ProjectForm } from './ProjectForm';
import './projects.css';
export function ProjectList() {
  const [creating, setCreating] = useState(false),
    [page, setPage] = useState(0);
  const navigate = useNavigate();
  return (
    <section className="projects-panel" aria-label="Private research projects">
      <div className="projects-title">
        <div>
          <span className="account-eyebrow">YOUR LIBRARY / PRIVATE</span>
          <h2>Research projects</h2>
        </div>
        {!creating && (
          <Button onClick={() => setCreating(true)}>
            New project <span aria-hidden="true">＋</span>
          </Button>
        )}
      </div>
      <p className="project-hint">
        A persistent place for your research plans. Project details are saved to
        your account; cloud EEG storage is not available yet.
      </p>
      {creating ? (
        <ProjectForm
          onCancel={() => setCreating(false)}
          onSaved={(p) => navigate(`/dashboard/projects/${p.id}`)}
        />
      ) : (
        <ProjectPage
          key={page}
          page={page}
          setPage={setPage}
          create={() => setCreating(true)}
        />
      )}
    </section>
  );
}
function ProjectPage({
  page,
  setPage,
  create,
}: {
  page: number;
  setPage: (p: number) => void;
  create: () => void;
}) {
  const load = useCallback((s: AbortSignal) => listProjects(page, s), [page]);
  const { state, reload } = useProjectResource(load);
  if (state.status === 'loading')
    return (
      <p role="status" className="project-state">
        Loading your projects…
      </p>
    );
  if (state.status === 'error')
    return (
      <div className="project-state">
        <p role="alert" className="account-error">
          {state.message}
        </p>
        <Button variant="secondary" onClick={reload}>
          Retry projects
        </Button>
      </div>
    );
  return (
    <>
      {state.data.projects.length === 0 ? (
        <div className="project-empty">
          <span aria-hidden="true" className="project-empty-symbol">
            ＋
          </span>
          <h3>{page === 0 ? 'Start with a question.' : 'No more projects.'}</h3>
          <p>
            {page === 0
              ? 'Create your first private project to give your next investigation a home.'
              : 'Return to the previous page to view your projects.'}
          </p>
          {page === 0 && (
            <Button variant="secondary" onClick={create}>
              Create your first project
            </Button>
          )}
        </div>
      ) : (
        <ul className="project-list">
          {state.data.projects.map((p) => (
            <li key={p.id}>
              <Link to={`/dashboard/projects/${p.id}`}>
                <div className="project-card-top">
                  <span className="project-status">{p.status}</span>
                  <span aria-hidden="true">↗</span>
                </div>
                <h3>{p.name}</h3>
                <p>{p.description || 'No description yet.'}</p>
                <span className="project-date">
                  Updated{' '}
                  {new Date(p.updated_at).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {(page > 0 || state.data.hasMore) && (
        <nav className="project-pagination" aria-label="Project pages">
          <Button
            variant="secondary"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>
          <span>Page {page + 1}</span>
          <Button
            variant="secondary"
            disabled={!state.data.hasMore}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </nav>
      )}
    </>
  );
}
