import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(cleanup);
window.scrollTo = vi.fn();
Element.prototype.scrollIntoView = vi.fn();

// Canvas rendering is verified in real Chrome; jsdom has no 2D context.
HTMLCanvasElement.prototype.getContext = vi.fn(() => null);
