import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Node's own process, typed here so the app's types stay browser only.
declare const process: { env: Record<string, string | undefined>; cwd(): string };

export default defineConfig(({ mode }) => {
  // Without the Supabase settings the console runs on demo data. That is right
  // for tests and previews, and must never reach customers: a production deploy
  // on Vercel without them fails here instead.
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  if (process.env.VERCEL_ENV === 'production' && !(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_PUBLISHABLE_KEY)) {
    throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY must be set for a production deploy.');
  }
  return { plugins: [react()] };
});
