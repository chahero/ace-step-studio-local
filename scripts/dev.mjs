import path from 'node:path';
import { pathToFileURL } from 'node:url';

const esbuildBinary = path.resolve(
  'node_modules',
  '@esbuild',
  'win32-x64',
  'esbuild.exe',
);

process.env.ESBUILD_BINARY_PATH = esbuildBinary;
process.argv.push('--host', '127.0.0.1', '--port', '5173', '--strictPort');
process.argv.push('--configLoader', 'runner');

const viteCli = pathToFileURL(path.resolve('node_modules', 'vite', 'bin', 'vite.js')).href;
await import(viteCli);
