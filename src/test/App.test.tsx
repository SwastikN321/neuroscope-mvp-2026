import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { App } from '../app/App';

function renderAt(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('Application shell', () => {
  it('navigates from the overview to the workspace and updates the active route', async () => {
    const user = userEvent.setup();
    renderAt();
    expect(
      screen.getByRole('heading', { name: 'See beyond the signal.' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Explore NeuroScope' }));
    expect(
      await screen.findByRole('heading', {
        name: 'Your workspace starts here.',
      }),
    ).toBeInTheDocument();
    const mainNav = within(
      screen.getByRole('navigation', { name: 'Main navigation' }),
    );
    expect(mainNav.getByRole('link', { name: 'Workspace' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(document.title).toBe('Workspace — NeuroScope');
  });

  it('supports loading the workspace directly and clearly states its limits', async () => {
    renderAt('/app');
    expect(
      await screen.findByRole('heading', {
        name: 'Your workspace starts here.',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'No recordings, uploads, or account connections are available in this phase.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /upload/i }),
    ).not.toBeInTheDocument();
  });

  it('opens the mobile navigation, closes on Escape, and returns focus', async () => {
    const user = userEvent.setup();
    renderAt();
    const toggle = screen.getByRole('button', { name: 'Open navigation' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(
      screen.getByRole('navigation', { name: 'Mobile navigation' }),
    ).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Escape}');
    expect(
      screen.queryByRole('navigation', { name: 'Mobile navigation' }),
    ).not.toBeInTheDocument();
    expect(toggle).toHaveFocus();
  });

  it('closes mobile navigation after choosing a destination', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    await user.click(
      within(
        screen.getByRole('navigation', { name: 'Mobile navigation' }),
      ).getByRole('link', { name: 'Workspace' }),
    );
    expect(
      await screen.findByRole('heading', {
        name: 'Your workspace starts here.',
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'Mobile navigation' }),
    ).not.toBeInTheDocument();
  });

  it('offers recovery for an unknown route', async () => {
    const user = userEvent.setup();
    renderAt('/missing');
    expect(
      screen.getByRole('heading', { name: 'This signal leads elsewhere.' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Back to overview' }));
    expect(
      screen.getByRole('heading', { name: 'See beyond the signal.' }),
    ).toBeInTheDocument();
  });

  it('provides a skip link and a real design-system anchor', () => {
    renderAt();
    expect(
      screen.getByRole('link', { name: 'Skip to content' }),
    ).toHaveAttribute('href', '#main-content');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(document.getElementById('design-system')).toHaveAttribute(
      'tabindex',
      '-1',
    );
    expect(
      screen.getByRole('link', { name: /scroll into the signal/i }),
    ).toHaveAttribute('href', '#signal');
  });
});
