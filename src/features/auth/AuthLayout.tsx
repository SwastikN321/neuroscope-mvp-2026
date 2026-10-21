import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Logo } from '../../components/brand/Logo';
import './auth.css';
export function AuthLayout({
  children,
  wide = false,
}: {
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="account-shell">
      <header className="account-header">
        <Link to="/" aria-label="NeuroScope home">
          <Logo />
        </Link>
        <Link to="/app">
          Explore as a guest <span aria-hidden="true">↗</span>
        </Link>
      </header>
      {wide ? (
        <div className="account-wide">{children}</div>
      ) : (
        <div className="account-grid">
          <aside
            className="account-story"
            aria-label="About your NeuroScope account"
          >
            <span className="account-eyebrow">
              A NEW PERSPECTIVE ON NEURAL DATA
            </span>
            <h2>
              Curiosity,
              <br />
              <span>
                with a place
                <br />
                to begin.
              </span>
            </h2>
            <p>
              Explore the signal. Follow an observation.
              <br />
              Take the next step in your research.
            </p>
            <div className="account-art" aria-hidden="true">
              <svg viewBox="0 0 600 260" fill="none">
                {Array.from({ length: 14 }, (_, i) => (
                  <path
                    key={i}
                    d={`M -20 ${130 + i * 3} C 110 ${40 + i * 7}, 160 ${240 - i * 4}, 260 ${100 + i * 3} S 420 ${30 + i * 8}, 620 ${130 + i * 2}`}
                    stroke={i % 3 === 0 ? '#80d6d9' : '#537987'}
                    opacity={0.2 + i * 0.035}
                  />
                ))}
              </svg>
              <span>NEUROSCOPE / RESEARCH PREVIEW</span>
            </div>
            <p className="account-story-note">
              The EEG demo is open to everyone.
              <br />
              Private project plans, with the EEG workspace open to everyone.
            </p>
          </aside>
          <section className="account-form-panel">{children}</section>
        </div>
      )}
      <footer className="account-footer">
        <span>Built for scientific curiosity.</span>
        <span>Research preview · Not for clinical use.</span>
      </footer>
    </div>
  );
}
