/**
 * Session store (Svelte 5 runes). Holds the auth token + the current `/me`
 * profile, and is the single source of truth for "who is logged in". The token
 * is persisted to localStorage so a reload keeps you signed in; the API client is
 * kept in sync via `api.setToken`.
 */
import type { MeResponse, OtpVerifyResponse } from '@cropsaathi/contracts';
import { api } from './services';
import { setLang } from './i18n.svelte';

const TOKEN_KEY = 'cropsaathi.token';

type Status = 'loading' | 'anonymous' | 'authenticated';

interface SessionState {
  status: Status;
  token: string | null;
  me: MeResponse | null;
}

export const session = $state<SessionState>({
  status: 'loading',
  token: null,
  me: null
});

function persistToken(t: string | null): void {
  session.token = t;
  api.setToken(t);
  if (typeof localStorage === 'undefined') return;
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage disabled — session lives for this tab only */
  }
}

function applyProfileLanguage(me: MeResponse | null): void {
  if (me?.farmer?.preferred_language) setLang(me.farmer.preferred_language);
}

/** Read a stored token (if any) and hydrate the profile. Call once at startup. */
export async function bootstrapSession(): Promise<void> {
  let stored: string | null = null;
  if (typeof localStorage !== 'undefined') {
    try {
      stored = localStorage.getItem(TOKEN_KEY);
    } catch {
      stored = null;
    }
  }
  if (!stored) {
    session.status = 'anonymous';
    return;
  }
  persistToken(stored);
  try {
    const me = await api.getMe();
    session.me = me;
    applyProfileLanguage(me);
    session.status = 'authenticated';
  } catch {
    persistToken(null);
    session.me = null;
    session.status = 'anonymous';
  }
}

/** Finish login after OTP verification: store the token and hydrate `/me`. */
export async function completeLogin(resp: OtpVerifyResponse): Promise<MeResponse | null> {
  persistToken(resp.access_token);
  try {
    const me = await api.getMe();
    session.me = me;
    applyProfileLanguage(me);
    session.status = 'authenticated';
    return me;
  } catch {
    session.me = null;
    session.status = 'authenticated';
    return null;
  }
}

/** Re-fetch `/me` (e.g. after completing the profile). */
export async function refreshMe(): Promise<MeResponse> {
  const me = await api.getMe();
  session.me = me;
  applyProfileLanguage(me);
  return me;
}

export async function logout(): Promise<void> {
  try {
    await api.logout();
  } catch {
    /* ignore */
  }
  persistToken(null);
  session.me = null;
  session.status = 'anonymous';
}

export function isAuthenticated(): boolean {
  return session.status === 'authenticated' && session.me !== null;
}
export function isOperator(): boolean {
  return session.me?.role === 'OPERATOR';
}
export function isFarmer(): boolean {
  return session.me?.role === 'FARMER';
}
/** A logged-in farmer who has not yet completed their profile. */
export function needsProfile(): boolean {
  return session.me?.role === 'FARMER' && session.me.profile_complete === false;
}
