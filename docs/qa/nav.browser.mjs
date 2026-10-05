import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
// Browser preview QA for the new nav: Library, Projects, Snippets, Follow-ups, Landmarks, Settings. Run: npx vite --port 5199 &
const origin = process.env.QA_ORIGIN || 'http://localhost:5199', out = process.env.QA_ARTIFACTS || '/tmp/pip-nav-qa';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
await ctx.addInitScript(() => { localStorage.setItem('pip.session.v1', JSON.stringify({ access_token: 's', refresh_token: 's', expires_at: Math.floor(Date.now() / 1000) + 86400, user: { id: 'nav-qa', email: 'qa@example.invalid', name: 'Alex Rivera' } })); localStorage.setItem('pip.onboarded.nav-qa', '1'); localStorage.setItem('pip.sync.cursor.nav-qa', '1'); });
await ctx.route(u => new URL(u.toString()).origin !== origin, r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
await page.goto(origin + '/?seed=1'); await page.getByRole('heading', { name: /Hi, Alex/ }).waitFor();
const dock = page.locator('.db-dock');
for (const n of ['Library', 'Projects', 'Snippets', 'Follow-ups', 'Landmarks', 'Settings']) assert.equal(await dock.getByRole('button', { name: new RegExp('^' + n) }).count(), 1, 'dock has ' + n);
assert.equal(await dock.getByRole('button', { name: /^Today/ }).count(), 0, 'old dock views are gone');
await page.screenshot({ path: out + '/1-dock.png' });
// Library keeps the old views as chips
await dock.getByRole('button', { name: /^Library/ }).click(); await page.getByRole('group', { name: 'Library views' }).getByRole('button', { name: /Pinned/ }).click();
// Snippets: add, persist, copy, delete
await dock.getByRole('button', { name: /^Snippets/ }).click(); const sn = page.getByRole('dialog', { name: 'Snippets' });
await sn.getByRole('button', { name: 'Keep it' }).click(); await sn.getByText('Give it a name').waitFor();
await sn.getByLabel('Snippet name').fill('Email signature'); await sn.getByLabel('Snippet text').fill('Best,\nAlex'); await sn.getByRole('button', { name: 'Keep it' }).click();
await sn.getByText('Email signature').waitFor(); await page.screenshot({ path: out + '/2-snippets.png' });
await page.keyboard.press('Escape'); assert.equal(await sn.count(), 0, 'Escape closes');
await page.reload(); await dock.getByRole('button', { name: /^Snippets/ }).click(); await page.getByRole('dialog', { name: 'Snippets' }).getByText('Email signature').waitFor();
await page.getByRole('button', { name: 'Delete Email signature' }).click(); await page.getByText('No snippets yet').waitFor(); await page.keyboard.press('Escape');
// Follow-ups: add overdue, done toggle
await dock.getByRole('button', { name: /^Follow-ups/ }).click(); const fu = page.getByRole('dialog', { name: 'Follow-ups' });
await fu.getByLabel('Follow-up').fill('Ask Mia about the logo'); await fu.getByLabel('Due date').fill('2020-01-01'); await fu.getByRole('button', { name: 'Keep it' }).click();
await fu.getByText(/Overdue/).waitFor(); await page.screenshot({ path: out + '/3-followups.png' });
await fu.getByRole('checkbox').click(); await fu.getByText('Nothing waiting').waitFor(); await page.keyboard.press('Escape');
// Projects opens a folder in the Library
await dock.getByRole('button', { name: /^Projects/ }).click(); const pj = page.getByRole('dialog', { name: 'Projects' }); await pj.waitFor(); await page.screenshot({ path: out + '/4-projects.png' });
if (await pj.getByRole('button', { name: 'Open' }).count()) { await pj.getByRole('button', { name: 'Open' }).first().click(); await pj.waitFor({ state: 'detached' }); } else await page.keyboard.press('Escape');
// Landmarks + Settings from the dock
await dock.getByRole('button', { name: /^Landmarks/ }).click(); await page.getByRole('dialog', { name: 'Landmarks' }).waitFor(); await page.keyboard.press('Escape');
await dock.getByRole('button', { name: /^Settings/ }).click(); await page.getByRole('dialog', { name: 'Settings' }).waitFor(); await page.keyboard.press('Escape');
// Home via wordmark
await page.getByRole('button', { name: 'Pip home' }).click(); await page.getByRole('heading', { name: /Hi, Alex/ }).waitFor();
// narrow width: dock does not overflow the page
await page.setViewportSize({ width: 420, height: 800 }); await page.waitForTimeout(200);
const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); await page.screenshot({ path: out + '/5-narrow.png' });
assert.ok(over <= 1, 'no horizontal page overflow at 420px: ' + over);
assert.deepEqual(errors, []); await browser.close(); console.log('nav browser QA passed', out);
