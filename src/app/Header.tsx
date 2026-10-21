import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { Logo } from '../components/brand/Logo';
import { Button, ButtonLink } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';

export function Header() {
  const immersive = useLocation().pathname === '/';
  const [menuOpen, setMenuOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function dismiss(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        toggleRef.current?.focus();
      }
    }
    document.addEventListener('keydown', dismiss);
    return () => document.removeEventListener('keydown', dismiss);
  }, [menuOpen]);

  function closeMenu() {
    setMenuOpen(false);
  }
  return (
    <header
      className={`site-header ${immersive ? 'site-header--immersive' : ''}`}
    >
      <div className="site-header__inner page-container">
        <Link to="/" aria-label="NeuroScope home" onClick={closeMenu}>
          <Logo />
        </Link>
        <nav className="desktop-nav" aria-label="Main navigation">
          <Link to="/#product">Product</Link>
          <Link to="/#how-it-works">How It Works</Link>
          <Link to="/#use-cases">Use Cases</Link>
          <Link to="/#documentation">Documentation</Link>
        </nav>
        <ButtonLink className="header-cta" to="/app" variant="secondary">
          Open App <Icon name="corner" />
        </ButtonLink>
        <Button
          className="menu-toggle"
          variant="secondary"
          ref={toggleRef}
          aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <Icon name={menuOpen ? 'close' : 'menu'} />
        </Button>
      </div>
      {menuOpen && (
        <nav
          id="mobile-navigation"
          className="mobile-nav page-container"
          aria-label="Mobile navigation"
        >
          {[
            ['Product', '/#product'],
            ['How It Works', '/#how-it-works'],
            ['Use Cases', '/#use-cases'],
            ['Documentation', '/#documentation'],
            ['Open App', '/app'],
          ].map(([label, to]) => (
            <Link key={to} to={to!} onClick={closeMenu}>
              {label} <Icon name="arrow" />
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
