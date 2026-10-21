import { createContext, useContext } from 'react';
import type { User } from '@supabase/supabase-js';
export type AuthState = {
  status: 'loading' | 'guest' | 'authenticated' | 'unconfigured' | 'error';
  user: User | null;
  notice: string;
  signedOut?: boolean;
};
export const AuthContext = createContext<
  AuthState & { retry: () => void; logout: () => Promise<void> }
>({
  status: 'unconfigured',
  user: null,
  notice: '',
  retry: () => {},
  logout: async () => {
    throw new Error('Authentication is not configured.');
  },
});
export const useAuth = () => useContext(AuthContext);
