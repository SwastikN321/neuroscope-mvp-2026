import { authClient } from '../auth/client';
import { ApiError } from '../eeg/localApi';
export const cloudEnabled =
  import.meta.env.VITE_CLOUD_RECORDINGS_ENABLED === 'true';
const configured = import.meta.env.VITE_CLOUD_API_ORIGIN?.trim() || '';
export function cloudEndpoint(path: string) {
  if (!cloudEnabled)
    throw new ApiError('Private cloud recordings are not enabled yet.', 403);
  if (!path.startsWith('/api/cloud/'))
    throw new ApiError('Invalid cloud request.');
  if (configured) {
    const origin = new URL(configured);
    if (
      origin.protocol !== 'https:' ||
      origin.origin !== configured ||
      origin.username ||
      origin.password
    )
      throw new ApiError('Cloud API must use an exact HTTPS origin.');
    return configured + path;
  }
  if (!import.meta.env.DEV)
    throw new ApiError('The private EEG backend is not configured.');
  return '/cloud-eeg' + path;
}
export async function bearer(expectedUserId?: string) {
  if (!authClient)
    throw new ApiError('Sign in to access private recordings.', 401);
  const { data, error } = await authClient.auth.getSession();
  if (
    error ||
    !data.session ||
    (expectedUserId && data.session.user.id !== expectedUserId)
  )
    throw new ApiError(
      'Your session changed. Return to your project and sign in again.',
      401,
    );
  // Server independently verifies this token using trusted Supabase Auth on every request.
  return data.session.access_token;
}
let queue: Promise<unknown> = Promise.resolve();
export function cloudRequest<T>(
  path: string,
  signal?: AbortSignal,
  method = 'GET',
  format: 'json' | 'blob' = 'json',
  expectedUserId?: string,
): Promise<T> {
  const result = queue
    .catch(() => {})
    .then(async () => {
      const timeout = AbortSignal.timeout(120000);
      const abort = signal ? AbortSignal.any([signal, timeout]) : timeout;
      for (let attempt = 0; ; attempt++) {
        abort.throwIfAborted();
        let response: Response;
        try {
          response = await fetch(cloudEndpoint(path), {
            method,
            signal: abort,
            cache: 'no-store',
            credentials: 'omit',
            headers: {
              Authorization: 'Bearer ' + (await bearer(expectedUserId)),
            },
          });
        } catch (error) {
          if (signal?.aborted) throw error;
          throw new ApiError(
            'Private EEG service unavailable or timed out. Refresh your project before retrying.',
          );
        }
        if (response.status === 429 && method === 'GET' && attempt < 6) {
          await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
          continue;
        }
        if (response.ok && format === 'blob') {
          const size = Number(response.headers.get('Content-Length'));
          if (!size || size > 16 * 1024 * 1024)
            throw new ApiError('Invalid CSV response size.');
          const blob = await response.blob();
          if (blob.size !== size)
            throw new ApiError('Incomplete CSV response.');
          return blob as T;
        }
        const body = await response.json().catch(() => null);
        if (!response.ok)
          throw new ApiError(
            body?.error?.message || 'Private recording request failed.',
            response.status,
          );
        if (body === null) throw new ApiError('Unexpected cloud response.');
        return body as T;
      }
    });
  queue = result.catch(() => {});
  return result;
}
export type CloudRecording = {
  id: string;
  project_id: string;
  display_name: string;
  file_size_bytes: number;
  status:
    | 'pending_upload'
    | 'validating'
    | 'ready'
    | 'failed'
    | 'deleting'
    | 'deleted';
  duration_seconds: string | null;
  channel_count: number | null;
  cleanup_after: string | null;
};
export type CloudListing = {
  recordings: CloudRecording[];
  quota: { used_slots: number; max_slots: number; max_file_bytes: number };
};
export async function uploadCloudEDF(
  projectId: string,
  file: File,
  name: string,
  progress: (value: number) => void,
  signal: AbortSignal,
  userId: string,
) {
  if (!/\.edf$/i.test(file.name) || file.size < 256 || file.size > 50_000_000)
    throw new ApiError(
      'Choose an EDF file from 256 to 50,000,000 bytes (50 MB). Larger recordings remain available through local development.',
    );
  const url = cloudEndpoint(`/api/cloud/projects/${projectId}/recordings`),
    token = await bearer(userId);
  signal.throwIfAborted();
  return new Promise<{ id: string; project_id: string; status: 'ready' }>(
    (resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const abort = () => xhr.abort();
      xhr.open('POST', url);
      xhr.timeout = 240000;
      xhr.setRequestHeader('Authorization', 'Bearer ' + token);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.setRequestHeader('X-Recording-Name', encodeURIComponent(name.trim()));
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) progress((e.loaded / e.total) * 100);
      };
      xhr.onload = () => {
        let body;
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          reject(
            new ApiError(
              'Upload result is uncertain. Refresh the project before retrying.',
            ),
          );
          return;
        }
        if (xhr.status !== 201 || body.status !== 'ready')
          reject(
            new ApiError(
              body?.error?.message ||
                'Upload could not be confirmed. Refresh the project.',
              xhr.status,
            ),
          );
        else resolve(body);
      };
      xhr.onerror = () =>
        reject(
          new ApiError(
            'Upload interrupted. Refresh the project before retrying.',
          ),
        );
      xhr.ontimeout = () =>
        reject(
          new ApiError(
            'Upload timed out. Refresh the project before retrying.',
          ),
        );
      xhr.onabort = () =>
        reject(new DOMException('Upload canceled.', 'AbortError'));
      xhr.onloadend = () => signal.removeEventListener('abort', abort);
      signal.addEventListener('abort', abort, { once: true });
      xhr.send(file);
    },
  );
}
