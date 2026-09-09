/**
 * scripts/dev-all.mjs
 *
 * Runs both the local Hono API server (port 54321) and the Vite frontend (port 5173)
 * concurrently in a single terminal process.
 */
import { spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

console.log('\n🌾 CropSaathi — Starting Fullstack Dev Environment...');

// 1. Build contracts first
console.log('[1/3] Building contracts...');
const buildContracts = spawn('pnpm', ['--filter', '@cropsaathi/contracts', 'build'], {
  cwd: rootDir,
  shell: true,
  stdio: 'inherit'
});

buildContracts.on('close', (code) => {
  if (code !== 0) {
    console.error('Failed to build contracts, exiting.');
    process.exit(code ?? 1);
  }

  // 2. Start Backend API server (port 54321)
  console.log('[2/3] Starting Backend API Façade (port 54321)...');
  const api = spawn('npx', ['tsx', 'scripts/serve-api.mjs'], {
    cwd: rootDir,
    shell: true,
    stdio: 'inherit'
  });

  // 3. Start Frontend Vite server (port 5173)
  console.log('[3/3] Starting Frontend Vite Server (port 5173)...');
  const web = spawn('pnpm', ['--filter', '@cropsaathi/web', 'dev'], {
    cwd: rootDir,
    shell: true,
    stdio: 'inherit'
  });

  function cleanup() {
    console.log('\nShutting down dev servers...');
    try { api.kill(); } catch {}
    try { web.kill(); } catch {}
    process.exit(0);
  }

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  api.on('exit', () => cleanup());
  web.on('exit', () => cleanup());
});
