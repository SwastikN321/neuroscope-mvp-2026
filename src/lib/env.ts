// Legacy optional API configuration; Auth configuration lives in features/auth/config.ts.
// Browser configuration is public. Backend secrets must live outside VITE_*.
function optional(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

export const env = Object.freeze({
  apiBaseUrl: optional(import.meta.env.VITE_API_BASE_URL),
  supabaseUrl: optional(import.meta.env.VITE_SUPABASE_URL),
  supabasePublishableKey: optional(
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  ),
});
