// Builds the libvisio2svg WebAssembly module with Docker and copies it to public/wasm.
//   node scripts/build-wasm.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'public/wasm');
mkdirSync(out, { recursive: true });

const run = (args) => execFileSync('docker', args, { stdio: 'inherit', env: { ...process.env, MSYS_NO_PATHCONV: '1' } });
run(['build', '-t', 'racklibrary-wasm', resolve(root, 'wasm')]);
run(['run', '--rm', '-v', `${out}:/out`, 'racklibrary-wasm']);
console.log(`WebAssembly converter written to ${out}`);
