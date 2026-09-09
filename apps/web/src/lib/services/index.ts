/**
 * Picks the adapter from environment and exposes a single shared `api` client to
 * the whole app. Flip `PUBLIC_API_MODE` in apps/web/.env:
 *
 *   PUBLIC_API_MODE=mock   → in-memory SIH backend (default; no credentials)
 *   PUBLIC_API_MODE=live   → real Hono API at PUBLIC_API_BASE_URL
 *
 * We use `$env/dynamic/public` so the mode can be set at deploy time (e.g. Vercel)
 * without rebuilding.
 */
import { env } from '$env/dynamic/public';
import type { ApiClient } from './api';
import { createMockClient } from './adapters/mock';
import { createLiveClient } from './adapters/live';

export type ApiMode = 'mock' | 'live';

export const API_MODE: ApiMode = env.PUBLIC_API_MODE === 'live' ? 'live' : 'mock';

function build(): ApiClient {
  if (API_MODE === 'live') {
    const base = env.PUBLIC_API_BASE_URL;
    if (!base) {
      throw new Error(
        'PUBLIC_API_MODE=live requires PUBLIC_API_BASE_URL (see apps/web/.env.example).'
      );
    }
    return createLiveClient(base);
  }
  return createMockClient();
}

/** The one API client every screen imports. */
export const api: ApiClient = build();

export type { ApiClient } from './api';
export { ApiClientError, isApiClientError } from './errors';
export type { CentreBookingRow, CentreBookingsResponse } from './api';
