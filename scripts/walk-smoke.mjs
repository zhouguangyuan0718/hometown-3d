import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const url = process.argv[2] || 'http://127.0.0.1:4173/';
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader'] });
await mkdir('artifacts', { recursive: true });
const results = [];
const diagnostics = page => page.evaluate(() => window.viewerDiagnostics());
try {
  for (const mobile of [false, true]) {
    const name = mobile ? 'mobile' : 'desktop';
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, isMobile: mobile, hasTouch: mobile });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await page.locator('#app[data-loaded=true]').waitFor({ timeout: 240000 });
    await page.locator('#walk').click();
    await page.locator('#app.walking').waitFor();
    const start = await diagnostics(page);
    assert(start.walk.active);
    assert(Math.abs(start.camera[1] - start.walk.position[1] - 1.62) < 0.001);
    await page.screenshot({ path: `artifacts/walk-${name}-gate.png` });
    if (!mobile) {
      await page.keyboard.down('w'); await page.waitForTimeout(2200); await page.keyboard.up('w');
      const inside = await diagnostics(page);
      assert(inside.walk.position[2] < 10.6, 'W must take the walker through the open gate');
      await page.screenshot({ path: `artifacts/walk-${name}-inside.png` });
      await page.keyboard.down('a'); await page.waitForTimeout(1000); await page.keyboard.up('a');
      const atWall = await diagnostics(page);
      assert(atWall.walk.position[0] > -0.1, 'Walk must not cross the courtyard wall');
      await page.mouse.move(700, 450); await page.mouse.down(); await page.mouse.move(790, 420, { steps: 10 }); await page.mouse.up();
      assert.notEqual((await diagnostics(page)).walk.yaw, atWall.walk.yaw, 'Dragging turns the head');
      await page.keyboard.down('q'); await page.waitForTimeout(300); await page.keyboard.up('q');
      assert((await diagnostics(page)).walk.yaw > -0.315, 'Q rotates the heading');
      await page.keyboard.press('Escape');
      assert.equal((await diagnostics(page)).walk.active, false);
      await page.locator('#walk').click();
      await page.locator('#app.walking').waitFor();
      assert.deepEqual((await diagnostics(page)).walk.position, start.walk.position);
    } else {
      // Real simultaneous touch pointers: hold forward while dragging to look.
      const cdp = await context.newCDPSession(page);
      const box = await page.locator('[data-move=forward]').boundingBox();
      const pad = { id: 1, x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const look = { id: 2, x: 275, y: 300 };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pad, look] });
      for (let i = 0; i < 10; i++) {
        await page.waitForTimeout(100);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pad, { ...look, x: look.x + i * 2 }] });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      const moved = await diagnostics(page);
      assert(moved.walk.position[2] < start.walk.position[2] - 0.7, 'Touch pad must move the walker');
      assert(moved.walk.yaw < -0.01, 'Second touch must turn the head at the same time');
      await page.waitForTimeout(150);
      const stopped = (await diagnostics(page)).walk.position;
      await page.waitForTimeout(250);
      assert.deepEqual((await diagnostics(page)).walk.position, stopped, 'Releasing the touch pad stops movement');
      await page.screenshot({ path: `artifacts/walk-${name}-inside.png` });
      await page.setViewportSize({ width: 844, height: 390 });
      await page.screenshot({ path: 'artifacts/walk-mobile-landscape.png' });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    }
    await page.locator('#gate').click();
    assert.deepEqual((await diagnostics(page)).walk.position, start.walk.position);
    await page.locator('#home').click();
    assert.equal((await diagnostics(page)).walk.active, false);
    assert.equal(await page.locator('#walk-hud').isVisible(), false);
    assert((await diagnostics(page)).camera[1] > 10);
    assert.deepEqual(errors, []);
    results.push({ name, passed: true, start: start.walk, errors });
    await context.close();
  }
  await writeFile('artifacts/walk-smoke-report.json', JSON.stringify({ url, results }, null, 2));
  console.log(JSON.stringify({ url, results }, null, 2));
} finally { await browser.close(); }
