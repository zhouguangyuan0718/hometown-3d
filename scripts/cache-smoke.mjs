import { chromium } from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';

const url = process.argv[2] || 'http://127.0.0.1:4173/';
await mkdir('artifacts', { recursive: true });
const profile = await mkdtemp(path.resolve('artifacts/cache-profile-'));
const options = { channel: 'chrome', headless: true, viewport: { width: 1000, height: 800 }, args: ['--enable-unsafe-swiftshader'] };
let context;
const report = [];
async function openAndCheck(page, expectedSource, label) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.locator('#app[data-loaded="true"]').waitFor({ timeout: 240000 });
  await page.waitForFunction(() => window.viewerDiagnostics().timing.cacheSaved, null, { timeout: 30000 });
  const diagnostics = await page.evaluate(() => window.viewerDiagnostics());
  assert.equal(diagnostics.timing.source, expectedSource, label);
  assert(diagnostics.triangles > 1000);
  assert.deepEqual(errors, []);
  report.push({ label, ...diagnostics.timing });
}
try {
  context = await chromium.launchPersistentContext(profile, options);
  let page = await context.newPage();
  await openAndCheck(page, 'network', 'first download');
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.clearBrowserCache');
  let blocked = 0;
  await context.route('**/model.glb*', route => { blocked++; return route.abort(); });
  await openAndCheck(page, 'local-cache', 'reopen with HTTP cache cleared and model network blocked');
  assert.equal(blocked, 0, 'Cached reload must make zero model requests');
  await context.close();

  context = await chromium.launchPersistentContext(profile, options);
  await context.route('**/model.glb*', route => { blocked++; return route.abort(); });
  page = await context.newPage();
  await openAndCheck(page, 'local-cache', 'browser process restarted with model network blocked');
  assert.equal(blocked, 0, 'Persisted cache must make zero model requests');
  await context.unroute('**/model.glb*');

  // Damaged local bytes must be discarded and recovered from the real model URL.
  await page.evaluate(async () => {
    const name = (await caches.keys()).find(name => name.startsWith('hometown-3d-models-v1:'));
    const cache = await caches.open(name);
    const key = (await cache.keys())[0];
    await cache.put(key, new Response('damaged cache entry'));
  });
  await openAndCheck(page, 'network', 'corrupt cache recovers by downloading valid model');
  await context.close();

  context = await chromium.launchPersistentContext(await mkdtemp(path.resolve('artifacts/no-cache-profile-')), options);
  await context.addInitScript(() => { Object.defineProperty(window, 'caches', { get() { throw new DOMException('Storage disabled', 'SecurityError'); } }); });
  page = await context.newPage();
  await page.goto(url);
  await page.locator('#app[data-loaded="true"]').waitFor({ timeout: 240000 });
  const unavailable = await page.evaluate(() => window.viewerDiagnostics().timing);
  assert.equal(unavailable.source, 'network');
  assert.equal(unavailable.cacheSaved, false);
  report.push({ label: 'storage disabled still loads model', ...unavailable });
  await writeFile('artifacts/cache-report.json', JSON.stringify({ url, blockedModelRequests: blocked, checks: report }, null, 2));
  console.log(JSON.stringify({ url, blockedModelRequests: blocked, checks: report }, null, 2));
} finally { await context?.close(); }
