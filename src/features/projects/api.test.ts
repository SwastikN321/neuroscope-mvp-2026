import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('../auth/client', async () => {
  const { createClient } = await import('@supabase/supabase-js');
  return {
    authClient: createClient(
      'https://project-fixture.example.test',
      'sb_publishable_fixture',
      {
        global: { fetch: mock.fetch },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    ),
  };
});
import {
  createProject,
  updateProject,
  deleteProject,
  getProject,
  listProjects,
  projectInput,
  PAGE_SIZE,
} from './api';
const row = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  owner_id: '11111111-1111-4111-8111-111111111111',
  name: 'Study',
  description: null,
  status: 'active' as const,
  metadata: {},
  created_at: '2026-10-21T12:00:00Z',
  updated_at: '2026-10-21T12:00:00Z',
};
const signal = () => new AbortController().signal;
function respond(body: unknown, status = 200) {
  mock.fetch.mockImplementation(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  respond(row);
});
describe('Project SDK requests with mocked HTTP (not live RLS)', () => {
  it('creates only allowed fields and trusts server ownership/timestamps', async () => {
    const p = await createProject(
      {
        ...{ owner_id: 'forged', id: 'forged' },
        name: '  Study  ',
        description: ' ',
      },
      signal(),
    );
    expect(p).toEqual(row);
    expect(JSON.parse(mock.fetch.mock.calls[0]![1].body)).toEqual({
      name: 'Study',
      description: null,
    });
  });
  it('uses a version condition for updates and strips ownership', async () => {
    await updateProject(
      row,
      { name: 'Renamed', description: 'Details' },
      signal(),
    );
    const url = new URL(mock.fetch.mock.calls[0]![0]);
    expect(url.searchParams.get('id')).toBe(`eq.${row.id}`);
    expect(url.searchParams.get('updated_at')).toBe(`eq.${row.updated_at}`);
    expect(JSON.parse(mock.fetch.mock.calls[0]![1].body)).toEqual({
      name: 'Renamed',
      description: 'Details',
    });
  });
  it('never claims successful update/delete when no row was returned', async () => {
    respond([]);
    await expect(
      updateProject(row, { name: 'Changed', description: '' }, signal()),
    ).rejects.toThrow('changed or is no longer');
    await expect(deleteProject(row, signal())).rejects.toThrow(
      'changed or is no longer',
    );
  });
  it('requests bounded pages with a lookahead and stable tie order', async () => {
    respond(Array.from({ length: PAGE_SIZE + 1 }, () => row));
    const r = await listProjects(1, signal());
    expect(r.projects).toHaveLength(PAGE_SIZE);
    expect(r.hasMore).toBe(true);
    const url = new URL(mock.fetch.mock.calls[0]![0]);
    expect(url.searchParams.get('offset')).toBe(String(PAGE_SIZE));
    expect(url.searchParams.get('limit')).toBe(String(PAGE_SIZE + 1));
    expect(url.searchParams.get('order')).toContain('updated_at.desc,id.asc');
  });
  it('treats invisible and missing rows identically', async () => {
    respond([]);
    expect(await getProject(row.id, signal())).toBeNull();
    expect(await getProject('bad-id', signal())).toBeNull();
    expect(mock.fetch).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['PGRST205', 'not available'],
    ['42501', 'authorized'],
    ['PGRST301', 'authorized'],
    ['23514', 'requirements'],
    ['other', 'could not be confirmed'],
  ])('maps %s without echoing server details', async (code, copy) => {
    respond({ code, message: 'private server diagnostics' }, 400);
    await expect(
      createProject({ name: 'Study', description: '' }, signal()),
    ).rejects.toThrow(copy);
  });
  it('rejects bad inputs before sending a request', async () => {
    expect(() => projectInput({ name: ' ', description: '' })).toThrow();
    await expect(
      createProject({ name: 'x'.repeat(121), description: '' }, signal()),
    ).rejects.toThrow();
    await expect(
      createProject({ name: 'valid', description: 'x'.repeat(4001) }, signal()),
    ).rejects.toThrow();
    expect(mock.fetch).not.toHaveBeenCalled();
  });
});
