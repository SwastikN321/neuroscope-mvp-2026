import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Unit tests must remain offline even when the owner configures a real project.
// Auth workflow tests inject SDK doubles; the browser harness has isolated fixtures.
for (const name of [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'VITE_SITE_URL',
  'VITE_AUTH_CALLBACK_PATH',
])
  vi.stubEnv(name, '');

afterEach(cleanup);
window.scrollTo = vi.fn();
Element.prototype.scrollIntoView = vi.fn();

// Canvas rendering is verified in real Chrome; jsdom has no 2D context.
HTMLCanvasElement.prototype.getContext = vi.fn(() => null);
