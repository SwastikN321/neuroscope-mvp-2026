/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLOUD_RECORDINGS_ENABLED?: string;
  readonly VITE_CLOUD_API_ORIGIN?: string;
  readonly VITE_SITE_URL?: string;
  readonly VITE_AUTH_CALLBACK_PATH?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
