/**
 * @cropsaathi/contracts
 *
 * Single, human-edited source of truth for CropSaathi's API contract. Both the
 * Hono backend (via `pnpm contracts:sync`) and the SvelteKit frontend import
 * request/response schemas, route constants, and shared types from here.
 */
export * from './common';
export * from './routes';
export * from './phase1';
export * from './phase2';
export * from './phase3';
