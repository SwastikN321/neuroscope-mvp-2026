import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { createProject, updateProject, type ResearchProject } from './api';
export function ProjectForm({
  project,
  onSaved,
  onCancel,
}: {
  project?: ResearchProject;
  onSaved: (p: ResearchProject) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(project?.name ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (request.current) return;
    const c = new AbortController();
    request.current = c;
    setBusy(true);
    setError('');
    try {
      const saved = await (project
        ? updateProject(project, { name, description }, c.signal)
        : createProject({ name, description }, c.signal));
      if (!c.signal.aborted) onSaved(saved);
    } catch (e) {
      if (!c.signal.aborted)
        setError(
          e instanceof Error ? e.message : 'Unable to save the project.',
        );
    } finally {
      if (!c.signal.aborted) {
        request.current = null;
        setBusy(false);
      }
    }
  }
  return (
    <form
      className="project-form"
      onSubmit={submit}
      aria-label={project ? 'Edit project' : 'Create project'}
    >
      <fieldset disabled={busy}>
        <legend>
          {project ? 'Edit project details' : 'A new research direction'}
        </legend>
        <label>
          Project name
          <input
            autoFocus
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Give your research a name"
          />
        </label>
        <label>
          Description <span>(optional)</span>
          <textarea
            maxLength={4000}
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What would you like to explore?"
          />
        </label>
        <p className="project-hint">
          On creation or save, these details are stored privately in your
          account. Use non-identifying research descriptions; EEG files and
          annotations stay outside this project.
        </p>
        <div className="project-actions">
          <Button type="submit">
            {busy ? 'Saving…' : project ? 'Save changes' : 'Create project'}
          </Button>
          <Button variant="text" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </fieldset>
      {error && (
        <p className="account-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
