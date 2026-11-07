import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = new URL('..', import.meta.url);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === 'public') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(js|mjs|html|css)$/.test(name)) out.push(path);
  }
  return out;
}

test('the page title is exactly GTA: Sydney Psyco', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<title>GTA: Sydney Psyco<\/title>/);
  assert.match(html, /<h1>GTA: Sydney Psyco<\/h1>/);
  assert.match(html, /does not run the Grand-V engine/);
});

test('source does not vendor Grand-V, RAGE, or a proprietary GTA runtime', () => {
  const files = walk(root.pathname);
  const banned = ['gta-browser-' + 'launcher', 'play' + 'gta5', 'rockstar' + 'games.com', 'Launcher' + 'App'];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const needle of banned) {
      assert.equal(text.includes(needle), false, `${file} contains ${needle}`);
    }
  }
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(pkg.dependencies), ['three']);
});
