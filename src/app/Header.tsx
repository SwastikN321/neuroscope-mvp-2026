import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
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
          <NavLink to="/" end>
            Overview
          </NavLink>
          <NavLink to="/app">Workspace</NavLink>
          <Link to="/#design-system">Design system</Link>
        </nav>
        <ButtonLink className="header-cta" to="/app" variant="secondary">
          Open workspace <Icon name="corner" />
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
          <NavLink to="/" end onClick={closeMenu}>
            Overview <Icon name="arrow" />
          </NavLink>
          <NavLink to="/app" onClick={closeMenu}>
            Workspace <Icon name="arrow" />
          </NavLink>
          <Link to="/#design-system" onClick={closeMenu}>
            Design system <Icon name="arrow" />
          </Link>
        </nav>
      )}
    </header>
  );
}
