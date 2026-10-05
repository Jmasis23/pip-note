import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
// Browser preview QA for the Landmarks editor. It proves the editor UI and the JS recognizer only.
// It does NOT prove native cursor hooks, multi-monitor DPI, or background activation: see docs/qa/landmarks.md.
// Run: npx vite --port 5199 &  then  node docs/qa/landmarks.browser.mjs
const origin = process.env.QA_ORIGIN || 'http://localhost:5199';
const out = process.env.QA_ARTIFACTS || '/tmp/pip-landmarks-qa';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(() => { // synthetic session so the preview skips sign-in; all remote requests are intercepted
  localStorage.setItem('pip.session.v1', JSON.stringify({ access_token: 'synthetic', refresh_token: 'synthetic', expires_at: Math.floor(Date.now() / 1000) + 86400, user: { id: 'lm-qa', email: 'qa@example.invalid', name: 'Alex River' } }));
  localStorage.setItem('pip.onboarded.lm-qa', '1'); localStorage.setItem('pip.sync.cursor.lm-qa', '1');
});
const page = await ctx.newPage();
const errors = []; page.on('pageerror', e => errors.push(String(e)));
await page.route(u => new URL(u.toString()).origin !== origin, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
await page.goto(origin + '/?seed=1'); await page.getByRole('button', { name: /^Landmarks$/ }).click();
const sheet = page.getByRole('dialog', { name: 'Landmarks' }); await sheet.waitFor();
const screen = sheet.locator('.lm-screen'); const box = async () => (await screen.boundingBox());
const ptr = (type, x, y, buttons = 0) => screen.evaluate((el, a) => { const r = el.getBoundingClientRect(); el.dispatchEvent(new PointerEvent(a.type, { bubbles: true, clientX: r.left + a.x * r.width, clientY: r.top + a.y * r.height, buttons: a.buttons, pointerId: 1, pointerType: 'mouse' })); }, { type, x, y, buttons });
const drawRegion = async (x1, y1, x2, y2) => { await ptr('pointerdown', x1, y1, 1); for (let i = 1; i <= 6; i++) await ptr('pointermove', x1 + (x2 - x1) * i / 6, y1 + (y2 - y1) * i / 6, 1); await ptr('pointerup', x2, y2); };
const count = () => sheet.locator('.lm-screen .lm-r').count();
const base = await count(); assert.ok(base >= 1, 'presets loaded');
// overlap rejection: draw straight over an existing preset
const first = await sheet.locator('.lm-screen .lm-r').first().evaluate(el => ({ l: parseFloat(el.style.left) / 100, t: parseFloat(el.style.top) / 100, w: parseFloat(el.style.width) / 100, h: parseFloat(el.style.height) / 100 }));
await drawRegion(.5, .5, first.l + first.w / 2, first.t + first.h / 2);
await sheet.getByText(/overlaps/).first().waitFor(); assert.equal(await count(), base, 'overlap rejected');
await page.screenshot({ path: `${out}/1-overlap.png` });
// draw in free middle area, save, persist
await drawRegion(.4, .4, .6, .6); assert.equal(await count(), base + 1, 'drew');
assert.equal(await sheet.getByText('Saved.').count(), 0, 'no Saved before write');
await sheet.getByRole('button', { name: 'Save Landmarks' }).click(); await sheet.getByText('Saved.').waitFor();
await page.reload(); await page.getByRole('button', { name: /^Landmarks$/ }).click(); await sheet.waitFor(); assert.equal(await count(), base + 1, 'persisted');
// wiggle test: no ring at rest, partial ring mid-wiggle, toast on fire
await sheet.getByRole('button', { name: /Test wiggle/ }).click();
assert.equal(await sheet.locator('.lm-ring').count(), 0, 'no ring before wiggle');
let t = 0; const wig = async n => { for (let i = 0; i < n; i++) { const x = .42 + (i % 2) * .16; await ptr('pointermove', x, .5, 0); await page.waitForTimeout(40); } };
await wig(3); await sheet.locator('.lm-ring').waitFor({ timeout: 2000 });
const frac = await sheet.locator('.wring-fill').evaluate(el => { const c = parseFloat(el.getAttribute('stroke-dasharray')?.split(' ')[0] || '0'); const o = parseFloat(el.getAttribute('stroke-dashoffset') || '0'); return c ? 1 - o / c : NaN; });
assert.ok(frac > 0 && frac < 1, `partial ring (${frac})`); await page.screenshot({ path: `${out}/2-ring-partial.png` });
await wig(14); await sheet.locator('.lm-toast').waitFor({ timeout: 3000 }); await page.screenshot({ path: `${out}/3-fired.png` });
// monitor 2 tab
await sheet.getByRole('tab', { name: /Monitor 2/ }).click(); await page.screenshot({ path: `${out}/4-monitor2.png` });
// narrow width
await page.setViewportSize({ width: 420, height: 800 }); await page.waitForTimeout(200);
const over = await sheet.evaluate(el => el.scrollWidth - el.clientWidth); assert.ok(over <= 1, `no horizontal overflow at 420px (${over})`);
await page.screenshot({ path: `${out}/5-narrow.png` });
assert.deepEqual(errors, [], 'no page errors');
await browser.close(); console.log('landmarks browser QA passed; screenshots in', out);
