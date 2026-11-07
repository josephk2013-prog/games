import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

test('surface textures are present and attributed to CC0 ambientCG downloads', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/textures/manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.license, 'CC0-1.0');
  assert.match(manifest.licenseUrl, /creativecommons\.org\/publicdomain\/zero/);
  assert.match(manifest.discovery, /Google Images was not used/);
  assert.ok(manifest.assets.length >= 4);
  for (const asset of manifest.assets) {
    assert.match(asset.page, /^https:\/\/ambientcg\.com\/view\?id=/);
    assert.match(asset.download, /^https:\/\/ambientcg\.com\/get\?file=/);
    for (const file of asset.files) {
      assert.equal(existsSync(new URL(`../public/textures/${file}`, import.meta.url)), true, file);
    }
  }
});
