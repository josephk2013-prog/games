import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/world.js', import.meta.url), 'utf8');

test('harbour water shader is multiscale and does not stamp the old sparkle dots', () => {
  assert.match(source, /uniform float uQuality/);
  assert.match(source, /reflect\(-viewDir, n\)/);
  assert.match(source, /float ripple\(vec2 p\)/);
  assert.equal(source.includes('pow(max(sin(vWorld.x * 0.72'), false);
});
