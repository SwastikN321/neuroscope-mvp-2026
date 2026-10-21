import { Link } from 'react-router';
import { Logo } from '../components/brand/Logo';

export function Footer() {
  return (
    <footer className="site-footer product-footer">
      <div className="product-footer__grid">
        <div className="product-footer__brand">
          <Link to="/" aria-label="NeuroScope home">
            <Logo />
          </Link>
          <p>
            A clearer perspective on neural signals.
            <br />
            Built for curiosity. Grounded in data.
          </p>
        </div>
        <nav aria-label="Footer product">
          <h2>Product</h2>
          <Link to="/#product">The platform</Link>
          <Link to="/#how-it-works">How it works</Link>
          <Link to="/#use-cases">Who it’s for</Link>
          <Link to="/app">Open the workspace</Link>
          <Link to="/login">Log in</Link>
          <Link to="/signup">Create an account</Link>
        </nav>
        <nav aria-label="Footer documentation">
          <h2>Resources</h2>
          <a href="/docs/research-preview.html">Research preview guide</a>
          <a href="/docs/research-preview.html#validation">Validation notes</a>
          <Link to="/#documentation">Questions & answers</Link>
          <a href="/docs/research-preview.html#limits">
            Supported formats & limits
          </a>
        </nav>
        <nav aria-label="Footer notices">
          <h2>Transparency</h2>
          <a href="/docs/research-preview.html#privacy">Local data handling</a>
          <a href="/docs/research-preview.html#research">
            Research-use limitations
          </a>
          <a href="/models/ATTRIBUTION.md">Anatomical asset attribution</a>
          <a href="/THIRD-PARTY-NOTICES.txt">Third-party licenses</a>
        </nav>
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} NeuroScope</span>
        <span>Research preview · Not for clinical diagnosis</span>
        <span>
          Brain for Blender · Anderson Winkler ·{' '}
          <a href="https://creativecommons.org/licenses/by-sa/3.0/">
            CC BY-SA 3.0
          </a>
        </span>
      </div>
    </footer>
  );
}
