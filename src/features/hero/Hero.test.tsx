import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, type RefObject } from 'react';
import { MemoryRouter } from 'react-router';
import { Quaternion, Vector3 } from 'three';
import { Hero } from './Hero';
import { webGLAvailable } from './sceneState';
import type { SceneInput } from './sceneState';

const capture = vi.hoisted(() => ({
  input: null as RefObject<SceneInput> | null,
}));
// Test the accessible input contract without requiring a GPU in jsdom.
vi.mock('./NeuralCanvas', () => ({
  default: function CanvasStub({ input }: { input: RefObject<SceneInput> }) {
    useEffect(() => {
      capture.input = input;
    }, [input]);
    return null;
  },
}));

vi.mock('./sceneState', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./sceneState')>()),
  webGLAvailable: vi.fn(() => false),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(webGLAvailable).mockReturnValue(false);
  capture.input = null;
});

describe('Sculpture interaction', () => {
  it('permits complete rotations on both axes and resets the view', async () => {
    vi.mocked(webGLAvailable).mockReturnValue(true);
    render(
      <MemoryRouter>
        <Hero />
      </MemoryRouter>,
    );
    const sculpture = screen.getByRole('group', {
      name: /360-degree rotation/,
    });
    await waitFor(() => expect(capture.input).not.toBeNull());
    for (let i = 0; i < 100; i++)
      fireEvent.keyDown(sculpture, { key: 'ArrowRight' });
    for (let i = 0; i < 140; i++)
      fireEvent.keyDown(sculpture, { key: 'ArrowDown' });
    const expected = new Quaternion()
      .setFromAxisAngle(new Vector3(1, 0, 0), 140 * 0.05)
      .multiply(
        new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 100 * 0.08),
      );
    const actual = new Quaternion(...capture.input!.current.rotation);
    expect(Math.abs(actual.dot(expected))).toBeCloseTo(1, 8);
    fireEvent.keyDown(sculpture, { key: 'Home' });
    expect(capture.input!.current.rotation).toEqual([0, 0, 0, 1]);
  });
  it('activates synthetic activity, pauses, and resumes on direct interaction', async () => {
    vi.mocked(webGLAvailable).mockReturnValue(true);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Hero />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: 'Activate signal' }));
    expect(
      screen.getByRole('button', { name: 'Signal activated' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await user.click(
      screen.getByRole('button', { name: 'Pause sculpture motion' }),
    );
    expect(
      screen.getByRole('button', { name: 'Resume sculpture motion' }),
    ).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(
      screen.getByRole('group', { name: /360-degree rotation/ }),
      { key: 'ArrowRight' },
    );
    expect(
      screen.getByRole('button', { name: 'Pause sculpture motion' }),
    ).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('Hero alternatives', () => {
  it('keeps the hero and navigation usable without WebGL', () => {
    render(
      <MemoryRouter>
        <Hero />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole('img', {
        name: 'Still artwork of the folded neural sculpture',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Explore NeuroScope' }),
    ).toHaveAttribute('href', '/app');
    expect(
      screen.queryByRole('button', { name: 'Activate signal' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('WEBGL UNAVAILABLE / STILL VIEW'),
    ).toBeInTheDocument();
  });
  it('honors reduced motion even on a WebGL-capable device', () => {
    vi.mocked(webGLAvailable).mockReturnValue(true);
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    render(
      <MemoryRouter>
        <Hero />
      </MemoryRouter>,
    );
    expect(screen.getByText('REDUCED MOTION / STILL VIEW')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Pause sculpture motion' }),
    ).not.toBeInTheDocument();
    expect(document.querySelector('canvas')).toBeNull();
  });
});
