import { useEffect, useState } from 'react';
export type Resource<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; message: string };
export function useProjectResource<T>(
  load: (signal: AbortSignal) => Promise<T>,
) {
  const [state, setState] = useState<Resource<T>>({ status: 'loading' });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ status: 'ready', data });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState({
            status: 'error',
            message:
              error instanceof Error
                ? error.message
                : 'Unable to load projects.',
          });
      });
    return () => controller.abort();
  }, [load, version]);
  const reload = () => {
    setState({ status: 'loading' });
    setVersion((v) => v + 1);
  };
  return { state, reload };
}
