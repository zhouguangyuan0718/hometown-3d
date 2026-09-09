import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const info = JSON.parse(await readFile('model-info.json', 'utf8'));
const data = await readFile('public/model.glb');
assert.equal(data.length, info.web.bytes, 'Update model-info.json when changing the model');
assert.equal(createHash('sha256').update(data).digest('hex'), info.web.sha256, 'Update the model hash so browsers load the new version');
console.log('Model version and integrity verified.');
