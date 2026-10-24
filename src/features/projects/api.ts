import { authClient } from '../auth/client';

export type ResearchProject = {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  status: 'active' | 'archived';
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};
export type ProjectInput = { name: string; description: string };
const columns =
  'id,owner_id,name,description,status,metadata,created_at,updated_at';
export const PAGE_SIZE = 12;
export const isProjectId = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
export function projectInput(input: ProjectInput) {
  const name = input.name.trim();
  if (!name || [...name].length > 120 || [...input.description].length > 4000)
    throw new Error(
      'Use a project name of 1–120 characters and a description of up to 4,000 characters.',
    );
  return { name, description: input.description.trim() || null };
}
export function projectError(error: unknown): string {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? error.code
      : undefined;
  if (code === 'PGRST205' || code === '42P01')
    return 'Private projects are not available in this environment yet. Contact the site owner, or continue with the guest EEG demo.';
  if (code === '42501' || code === 'PGRST301' || code === 'PGRST302')
    return 'Project access could not be authorized. Check your session and sign in again if needed.';
  if (code === '23001' || code === '23503')
    return 'Delete this project’s cloud recordings first. If a transfer was interrupted, retry recording cleanup after its displayed lease expires, then delete the empty project.';
  if (code === '23514' || code === '23502')
    return 'The project details did not meet the database requirements. Check the name and description.';
  return 'The database request could not be confirmed. Check your connection and reload before retrying; your last change may have reached the server.';
}
function table() {
  if (!authClient) throw new Error('Account access is not configured.');
  return authClient.from('research_projects');
}
function record(data: unknown): ResearchProject {
  const p = data as ResearchProject | null;
  if (
    !p ||
    !isProjectId(p.id ?? '') ||
    !isProjectId(p.owner_id ?? '') ||
    typeof p.name !== 'string' ||
    !(p.description === null || typeof p.description === 'string') ||
    !['active', 'archived'].includes(p.status) ||
    !Number.isFinite(Date.parse(p.created_at)) ||
    !Number.isFinite(Date.parse(p.updated_at)) ||
    !p.metadata ||
    typeof p.metadata !== 'object' ||
    Array.isArray(p.metadata)
  )
    throw new Error(
      'The server returned an unexpected project response. Reload and try again.',
    );
  return p;
}
export async function listProjects(page: number, signal: AbortSignal) {
  const { data, error } = await table()
    .select(columns)
    .order('updated_at', { ascending: false })
    .order('id')
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
    .abortSignal(signal);
  if (error) throw new Error(projectError(error));
  if (!Array.isArray(data)) throw new Error('Unable to read the project list.');
  return {
    projects: data.slice(0, PAGE_SIZE).map(record),
    hasMore: data.length > PAGE_SIZE,
  };
}
export async function getProject(id: string, signal: AbortSignal) {
  if (!isProjectId(id)) return null;
  const { data, error } = await table()
    .select(columns)
    .eq('id', id)
    .abortSignal(signal)
    .maybeSingle();
  if (error) throw new Error(projectError(error));
  return data ? record(data) : null;
}
export async function createProject(input: ProjectInput, signal: AbortSignal) {
  const payload = projectInput(input);
  // No owner/id/timestamp accepted here: identity is supplied by auth.uid() in SQL.
  const { data, error } = await table()
    .insert(payload)
    .select(columns)
    .abortSignal(signal)
    .single();
  if (error) throw new Error(projectError(error));
  return record(data);
}
export async function updateProject(
  project: ResearchProject,
  input: ProjectInput,
  signal: AbortSignal,
) {
  const payload = projectInput(input);
  const { data, error } = await table()
    .update(payload)
    .eq('id', project.id)
    .eq('updated_at', project.updated_at)
    .select(columns)
    .abortSignal(signal)
    .maybeSingle();
  if (error) throw new Error(projectError(error));
  if (!data)
    throw new Error(
      'This project changed or is no longer available. Reload to review the latest version before editing.',
    );
  return record(data);
}
export async function deleteProject(
  project: ResearchProject,
  signal: AbortSignal,
) {
  const { data, error } = await table()
    .delete()
    .eq('id', project.id)
    .eq('updated_at', project.updated_at)
    .select('id')
    .abortSignal(signal)
    .maybeSingle();
  if (error) throw new Error(projectError(error));
  if (!data)
    throw new Error(
      'This project changed or is no longer available. Reload before trying to delete it again.',
    );
}
