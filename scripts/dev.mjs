import path from 'node:path';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';

const esbuildBinary = path.resolve(
  'node_modules',
  '@esbuild',
  'win32-x64',
  'esbuild.exe',
);

function loadDotEnv() {
  const envPath = path.resolve('.env');
  if (!fs.existsSync(envPath)) {
    return;
  }

  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const separator = trimmed.indexOf('=');
    if (separator < 0) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadDotEnv();

const frontendHost = process.env.FRONTEND_HOST || '127.0.0.1';
const frontendPort = process.env.FRONTEND_PORT || '5173';

process.env.ESBUILD_BINARY_PATH = esbuildBinary;
process.argv.push('--host', frontendHost, '--port', frontendPort, '--strictPort');
process.argv.push('--configLoader', 'runner');

const viteCli = pathToFileURL(path.resolve('node_modules', 'vite', 'bin', 'vite.js')).href;
await import(viteCli);
