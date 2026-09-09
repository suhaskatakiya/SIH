import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/**
 * CropSaathi web app (Phase 1). The app runs as a client-side SPA
 * (`ssr = false` in the root +layout.ts), so we build static assets with a
 * single-page fallback. This deploys to ANY static host — Vercel, Netlify,
 * GitHub Pages, Cloudflare Pages, or an S3 bucket — and `pnpm preview` serves
 * the production build locally. The live API (when PUBLIC_API_MODE=live) is a
 * separate Supabase Edge Function, so the frontend needs no server of its own.
 * @type {import('@sveltejs/kit').Config}
 */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      fallback: 'index.html', // SPA fallback: every route is served by the client router
      precompress: false
    })
  }
};

export default config;
