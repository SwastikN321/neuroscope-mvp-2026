import { lazy, Suspense } from 'react';
import { Route, Routes, useLocation } from 'react-router';
import { Header } from './Header';
import { Footer } from './Footer';
import { ErrorBoundary } from './ErrorBoundary';
import { RouteEffects } from './RouteEffects';
import { HomePage } from '../pages/HomePage';
import { NotFoundPage } from '../pages/NotFoundPage';

const WorkspacePage = lazy(() => import('../pages/WorkspacePage'));

export function App() {
  const workspace = useLocation().pathname.replace(/\/$/, '') === '/app';
  return (
    <ErrorBoundary>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {!workspace && <Header />}
      <RouteEffects />
      <main id="main-content" tabIndex={-1}>
        <Suspense
          fallback={
            <div className="route-loading page-container" role="status">
              Opening workspace…
            </div>
          }
        >
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/app" element={<WorkspacePage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </main>
      {!workspace && <Footer />}
    </ErrorBoundary>
  );
}
