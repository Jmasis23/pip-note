import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
// Browser preview of the compact tool window (?tool=1) running Quick Recall. Proves the UI logic only, not native window behavior.
const origin = process.env.QA_ORIGIN || 'http://localhost:5199', out = process.env.QA_ARTIFACTS || '/tmp/pip-recall-qa';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 420, height: 480 }, permissions: ['clipboard-read', 'clipboard-write'] });
await ctx.addInitScript(() => localStorage.setItem('snippets', JSON.stringify([{ id: 's1', name: 'Email signature', text: 'Best, Alex', updatedAt: 1 }])));
const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
await page.goto(origin + '/?tool=1&seed=1');
const dlg = page.getByRole('dialog', { name: 'Quick Recall' }); await dlg.waitFor();
await page.getByLabel('Search what you kept').waitFor(); assert.ok(await page.getByRole('option').count() >= 2, 'recent items listed');
assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Search what you kept', 'search is focused on open');
await page.screenshot({ path: out + '/1-recall.png' });
await page.getByLabel('Search what you kept').fill('signature'); await page.getByRole('option').first().waitFor();
assert.match(await page.getByRole('option').first().innerText(), /Email signature/);
await page.keyboard.press('Enter'); await page.getByText('Copied.').waitFor();
assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'Best, Alex', 'Enter copies the snippet text');
await page.getByLabel('Search what you kept').fill('zzzzqq'); await page.getByText('Nothing matches.').waitFor();
await page.screenshot({ path: out + '/2-empty.png' });
// Project Shelf and Clipboard Shelf (preview): shelves from folders, clipboard history unavailable outside the Windows app
await page.evaluate(() => { const v = JSON.parse(localStorage.getItem('pip.store.v1')); v.notes.slice(0, 3).forEach((n, i) => { n.folder = i ? 'Home' : 'Work'; }); localStorage.setItem('pip.store.v1', JSON.stringify(v)); });
await page.goto(origin + '/?tool=project&seed=1'); const ps = page.getByRole('dialog', { name: 'Project Shelf' }); await ps.waitFor();
await ps.getByRole('group', { name: 'Projects' }).getByRole('button').first().waitFor(); await page.screenshot({ path: out + '/3-project-shelf.png' });
await ps.getByRole('option').first().click(); await page.getByText('Copied.').waitFor();
await page.goto(origin + '/?tool=clipboard&seed=1'); await page.getByRole('dialog', { name: 'Clipboard Shelf' }).getByText('only runs in the Windows app').waitFor();
// Utilities, Resume, Snippets, Follow-ups compact windows
await page.goto(origin + '/?tool=utilities&seed=1'); const ut = page.getByRole('dialog', { name: 'Quick Utilities' }); await ut.waitFor();
await ut.getByLabel('Text').fill('  hello   world  \n\nzeta\nalpha'); await ut.getByRole('button', { name: 'Remove blank lines' }).click(); await ut.getByText(/copied/).waitFor();
assert.equal(await ut.getByLabel('Text').inputValue(), '  hello   world  \nzeta\nalpha'); await page.screenshot({ path: out + '/4-utilities.png' });
await page.goto(origin + '/?tool=resume&seed=1'); await page.getByRole('dialog', { name: 'Resume Cards' }).getByText('Last edited').waitFor();
await page.goto(origin + '/?tool=snippets&seed=1'); const sp = page.getByRole('dialog', { name: 'Snippets' }); await sp.getByRole('option', { name: /Email signature/ }).click(); await sp.getByText(/Copied "Email signature"/).waitFor();
assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'Best, Alex');
await page.goto(origin + '/?tool=followups&seed=1'); await page.evaluate(() => localStorage.setItem('followups', JSON.stringify([{ id: 'f1', text: 'Ask Mia', due: '2020-01-01', done: false, createdAt: 1 }])));
await page.reload(); const fg = page.getByRole('dialog', { name: 'Follow-ups' }); await fg.getByText(/Overdue/).waitFor(); await fg.getByRole('checkbox').click(); await fg.getByText('Nothing waiting').waitFor();
await page.reload(); await page.getByRole('dialog', { name: 'Follow-ups' }).getByText('Nothing waiting').waitFor();
assert.deepEqual(errors, []); await browser.close(); console.log('recall browser QA passed', out);
