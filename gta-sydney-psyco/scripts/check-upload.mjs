import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const dist = new URL('../dist/', import.meta.url);
const MB = 1024 * 1024;
const required = [
  'index.html',
  'data/harbour.json',
  'characters/sean-oshea.glb',
  'characters/sean-hello.wav',
  'characters/manifest.json',
  'textures/manifest.json',
  'environment/kloofendal_48d_partly_cloudy_2k.hdr',
  '.htaccess',
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

const root = dist.pathname;
const files = walk(root);
const problems = [];
let wasm = 0;
let js = 0;
let bytes = 0;

for (const file of files) {
  const size = statSync(file).size;
  bytes += size;
  const rel = relative(root, file).replaceAll('\\', '/');
  if (rel.includes('node_modules')) problems.push(`${rel} is a dependency folder`);
  const ext = rel.slice(rel.lastIndexOf('.'));
  if ((ext === '.js' || ext === '.html' || ext === '.php') && size > MB) {
    problems.push(`${rel} is ${(size / MB).toFixed(2)} MB. InfinityFree deletes HTML, PHP, and JS files over 1 MB.`);
  }
  if (rel === '.htaccess' && size > 10 * 1024) problems.push('.htaccess is over 10 kB');
  if (size > 10 * MB) problems.push(`${rel} is ${(size / MB).toFixed(2)} MB. InfinityFree deletes other files over 10 MB.`);
  if (ext === '.js') js += 1;
  if (ext === '.wasm') wasm += 1;
}

const html = readFileSync(join(root, 'index.html'), 'utf8');
if (!html.includes('src="./assets/')) problems.push('index.html script is not a relative ./assets path');
if (html.includes('src="/assets/') || html.includes('href="/assets/')) problems.push('index.html uses a root-absolute asset path');

for (const rel of required) {
  if (!files.some((file) => relative(root, file).replaceAll('\\', '/') === rel)) problems.push(`missing ${rel}`);
}
if (wasm !== 1) problems.push(`expected one .wasm file, found ${wasm}`);

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

console.log(`upload check ok: ${files.length} files, ${(bytes / MB).toFixed(1)} MB, ${js} js, ${wasm} wasm`);
