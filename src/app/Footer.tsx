import { Link } from 'react-router';
import { Logo } from '../components/brand/Logo';

export function Footer() {
  return (
    <footer className="site-footer page-container">
      <div className="footer-top">
        <Link to="/" aria-label="NeuroScope home">
          <Logo />
        </Link>
        <p>Research. With perspective.</p>
        <nav aria-label="Footer navigation">
          <Link to="/">Overview</Link>
          <Link to="/app">Workspace</Link>
          <Link to="/#design-system">Design system</Link>
        </nav>
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} NeuroScope</span>
        <span>NEURAL DATA, REIMAGINED.</span>
        <span>BUILT WITH INTENTION</span>
      </div>
    </footer>
  );
}
