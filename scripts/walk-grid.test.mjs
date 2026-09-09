import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { WalkGrid } from '../src/walk-grid.js';

const data = JSON.parse(await readFile('src/walk-data.json', 'utf8'));
await mkdir('artifacts', { recursive: true });
const info = JSON.parse(await readFile('model-info.json', 'utf8'));
const scale = JSON.parse(await readFile('src/walk-scale.json', 'utf8'));
const grid = new WalkGrid(data);
const start = () => ({ x: data.spawn[0], y: data.spawn[1], z: data.spawn[2] });

test('standing eye height retains the historical scale after the blue door is resized', () => {
  assert.equal(scale.modelSha256, info.web.sha256);
  assert.equal(scale.sourceModelSha256, info.source.sha256);
  assert.equal(scale.referenceHeightMeters, 1.8);
  assert.equal(scale.calibrationSourceModelSha256, 'ff6ac2a452e7e6c124ddccd9c723ebb4a58fc94596b51f9aac375ab22120919f');
  assert.equal(scale.referenceHeightUnits, 3.0700000524520874);
  assert.equal(scale.unitsPerMeter, 3.0700000524520874 / 1.8);
  assert.equal(data.eyeHeightMeters, 1.62);
  assert(Math.abs(data.eyeHeight / scale.referenceHeightUnits - 1.62 / 1.8) < 1e-9);
  assert(Math.abs(data.eyeHeight / data.unitsPerMeter - 1.62) < 1e-9);
  assert.equal(grid.eyeHeight(data.spawn[0], data.spawn[2]), data.eyeHeight);
});

test('overhead geometry caps eye height locally and open courtyards restore it', () => {
  const lowCeiling = new WalkGrid({ width: 2, depth: 1, cell: 1, origin: [0, 0], eyeHeight: 2.7, rows: [[[0, [0, 0]]]], eyeLimits: [[0, 2400]] });
  assert.equal(lowCeiling.eyeHeight(0, 0), 2.4);
  assert.equal(lowCeiling.eyeHeight(1, 0), 2.7);
  for (const [index, millimetres] of data.eyeLimits) {
    const col = index % data.width, row = Math.floor(index / data.width);
    const x = data.origin[0] + col * data.cell, z = data.origin[1] + row * data.cell;
    assert(grid.eyeHeight(x, z) < data.eyeHeight);
    assert.equal(grid.eyeHeight(x, z), millimetres / 1000);
    assert(grid.eyeHeight(x, z) >= scale.minEyeHeightMeters * scale.unitsPerMeter - 0.001);
  }
  assert.equal(grid.eyeHeight(4.2, 4.2), data.eyeHeight);
  assert.equal(grid.eyeHeight(3, -6), data.eyeHeight);
});

test('the raised courtyard gate permits continuous walking at full calibrated eye height', () => {
  const position = start();
  for (let z = position.z; z >= 8.5; z -= 0.06) {
    grid.move(position, 0, z - position.z);
    assert(Math.abs(position.z - z) < 0.001, 'The doorway must remain passable');
    assert.equal(grid.eyeHeight(position.x, position.z), data.eyeHeight, 'The raised gate must not force the camera to duck');
  }
});

function pathTo(x, z) {
  const [sc, sr] = grid.cell(data.spawn[0], data.spawn[2]);
  const [tc, tr] = grid.cell(x, z);
  const source = sr * data.width + sc, target = tr * data.width + tc;
  const previous = new Map([[source, null]]), queue = [source];
  for (let i = 0; i < queue.length && !previous.has(target); i++) {
    const index = queue[i], col = index % data.width, row = Math.floor(index / data.width);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = col + dx, nr = row + dz, next = nr * data.width + nc;
      const height = grid.height(nc, nr);
      if (height === null || previous.has(next) || Math.abs(height - grid.height(col, row)) > data.maxStep + 0.001) continue;
      previous.set(next, index); queue.push(next);
    }
  }
  assert(previous.has(target), `Destination ${x}, ${z} must be reachable through the gate and stairs`);
  const route = [];
  for (let i = target; i !== null; i = previous.get(i)) route.push([data.origin[0] + i % data.width * data.cell, grid.heights[i] / 1000, data.origin[1] + Math.floor(i / data.width) * data.cell]);
  return route.reverse();
}

test('navigation matches the model and starts on safe ground outside the gate', () => {
  assert.equal(data.modelSha256, info.web.sha256);
  assert.equal(grid.sample(data.spawn[0], data.spawn[2], data.spawn[1]), data.spawn[1]);
  assert(data.spawn[2] > 12 && data.spawn[0] > 0.65 && data.spawn[0] < 1.3);
});

test('walking through the gate reaches the lower courtyard', () => {
  const position = start();
  for (const [x, y, z] of pathTo(4.2, 4.2)) {
    grid.move(position, x - position.x, z - position.z);
    assert(Math.hypot(position.x - x, position.z - z) < 0.001);
    assert(Math.abs(position.y - y) < 0.001);
  }
});

test('upper courtyard can be reached by stepping up and back down, without teleporting', async () => {
  const route = pathTo(3.0, -6.0), position = start();
  for (const [x, y, z] of route) {
    const oldY = position.y;
    grid.move(position, x - position.x, z - position.z);
    assert(Math.hypot(position.x - x, position.z - z) < 0.001);
    assert(Math.abs(position.y - oldY) <= data.maxStep + 0.001);
    assert(Math.abs(position.y - y) < 0.001);
  }
  assert(position.y > -1.5);
  for (const [x, y, z] of [...route].reverse()) grid.move(position, x - position.x, z - position.z);
  assert(Math.hypot(position.x - data.spawn[0], position.z - data.spawn[2]) < 1e-8);
  assert.equal(position.y, data.spawn[1]);
  await writeFile('artifacts/walk-test-route.json', JSON.stringify(route));
});

test('a large movement cannot tunnel through the courtyard wall', () => {
  const position = { x: 4.2, y: grid.height(...grid.cell(4.2, 4.2)), z: 4.2 };
  grid.move(position, -20, 0);
  assert(position.x > -0.1 && position.x < 0.5);
  assert(grid.sample(position.x, position.z, position.y) !== null);
});

test('walking backwards stops at the outside edge of the gate platform', () => {
  const position = start();
  grid.move(position, 0, 50);
  assert(position.z > data.spawn[2] && position.z < 14);
  assert(grid.sample(position.x, position.z, position.y) !== null);
});

test('blocked diagonal corners cannot be crossed', () => {
  const tiny = new WalkGrid({ width: 2, depth: 2, cell: 1, origin: [0, 0], maxStep: 0.4, rows: [[[0, [0]]], [[1, [0]]]] });
  const position = { x: 0, y: 0, z: 0 };
  tiny.move(position, 1, 1);
  assert(position.x < 0.5 && position.z < 0.5);
});
