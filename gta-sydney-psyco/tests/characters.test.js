import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const manifest = JSON.parse(readFileSync(new URL('../public/characters/manifest.json', import.meta.url), 'utf8'));

test('Sean O\'Shea is the supplied mesh with a generated rig, not a capsule substitute', () => {
  const sean = manifest.characters.find((item) => item.id === 'sean-oshea');
  assert.equal(sean.role, 'player');
  assert.equal(sean.sourceBones, 0);
  assert.equal(sean.triangles, 30000);
  assert.ok(sean.generatedBones.includes('legL'));
  assert.equal(sean.texturesEmbedded, false);
  const glb = readFileSync(new URL('../public/characters/sean-oshea.glb', import.meta.url));
  assert.equal(glb.subarray(0, 4).toString(), 'glTF');
  const jsonLength = glb.readUInt32LE(12);
  const json = JSON.parse(glb.subarray(20, 20 + jsonLength).toString());
  assert.equal(json.meshes[0].name, 'Humano_01Business_01_30K_001');
  assert.ok(json.skins[0].joints.length >= 8);
  assert.equal(json.meshes[0].primitives[0].attributes.JOINTS_0, 3);
  const binStart = 20 + jsonLength + 8;
  const indexView = json.bufferViews[json.accessors[6].bufferView];
  assert.equal(glb.readUInt32LE(binStart + indexView.byteOffset), 0);
});

test('supporting character and Sean voice clips are credited files', () => {
  const support = manifest.characters.find((item) => item.id === 'cesium-man');
  assert.equal(support.license, 'CC-BY-4.0');
  assert.match(support.sourceUrl, /CesiumMan/);
  const hello = readFileSync(new URL('../public/characters/sean-hello.wav', import.meta.url));
  assert.equal(hello.subarray(0, 4).toString(), 'RIFF');
  assert.equal(manifest.voice.notAClone, true);
  assert.match(manifest.voice.fallback, /stock voice/);
});
