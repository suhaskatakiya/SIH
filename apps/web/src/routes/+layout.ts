// The app is a client-rendered SPA: all data comes from the API client (mock or
// live) in the browser, and the mock adapter uses localStorage. Disabling SSR
// keeps a single, consistent data path and avoids server/client hydration splits.
export const ssr = false;
export const prerender = false;
