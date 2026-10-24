import { lazy, Suspense } from 'react';
import { Route, Routes, useLocation } from 'react-router';
import { AuthProvider } from '../features/auth/AuthProvider';
import { Header } from './Header';
import { Footer } from './Footer';
import { ErrorBoundary } from './ErrorBoundary';
import { RouteEffects } from './RouteEffects';
import { HomePage } from '../pages/HomePage';
import { NotFoundPage } from '../pages/NotFoundPage';

const AuthPage = lazy(() => import('../features/auth/AuthPages'));
const AuthCallback = lazy(() => import('../features/auth/AuthCallback'));
const Dashboard = lazy(() => import('../features/auth/Dashboard'));
const ProjectDetails = lazy(
  () => import('../features/projects/ProjectDetails'),
);
const CloudWorkspace = lazy(() => import('../features/cloud/CloudWorkspace'));
const WorkspacePage = lazy(() => import('../pages/WorkspacePage'));

export function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
function AppRoutes() {
  const pathname = useLocation().pathname.replace(/\/$/, '');
  const workspace =
    pathname === '/app' || pathname.startsWith('/app/recordings/');
  const account =
    [
      '/login',
      '/signup',
      '/forgot-password',
      '/reset-password',
      '/auth/callback',
      '/dashboard',
    ].includes(pathname) || pathname.startsWith('/dashboard/projects/');
  return (
    <ErrorBoundary>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {!workspace && !account && <Header />}
      <RouteEffects />
      <main id="main-content" tabIndex={-1}>
        <Suspense
          fallback={
            <div className="route-loading page-container" role="status">
              Opening NeuroScope…
            </div>
          }
        >
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/app" element={<WorkspacePage />} />
            <Route
              path="/app/recordings/:recordingId"
              element={<CloudWorkspace />}
            />
            <Route
              path="/login"
              element={<AuthPage key="login" mode="login" />}
            />
            <Route
              path="/signup"
              element={<AuthPage key="signup" mode="signup" />}
            />
            <Route
              path="/forgot-password"
              element={<AuthPage key="forgot" mode="forgot" />}
            />
            <Route
              path="/reset-password"
              element={<AuthPage key="reset" mode="reset" />}
            />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route
              path="/dashboard/projects/:projectId"
              element={<ProjectDetails />}
            />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </main>
      {!workspace && !account && <Footer />}
    </ErrorBoundary>
  );
}
