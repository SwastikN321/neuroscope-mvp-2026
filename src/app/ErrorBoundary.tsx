import { Component, type ErrorInfo, type ReactNode } from 'react';

export class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV)
      console.error('NeuroScope rendering error', error, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <main className="error-state page-container">
          <p className="section-label">NEUROSCOPE / RECOVERY</p>
          <h1>Something interrupted the view.</h1>
          <p>Reload the page to return to NeuroScope.</p>
          <a className="button button--primary" href="/">
            Return to overview
          </a>
        </main>
      );
    }
    return this.props.children;
  }
}
