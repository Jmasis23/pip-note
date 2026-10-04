import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

// Optional driver: npm install --no-save --package-lock=false playwright
// Synthetic accounts and notes only; all remote requests are intercepted.
const origin = 'http://127.0.0.1:1431';
const artifacts = process.env.QA_ARTIFACTS || '/tmp/pip-dashboard-qa';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '1431', '--strictPort'], { stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(origin)).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  await mkdir(artifacts, { recursive: true });
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const errors = [];
  const intercept = route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    return route.fulfill({ status: 200, contentType: 'application/json', body: route.request().method() === 'GET' ? '[]' : '{}' });
  };
  await context.route('**/*', intercept);
  const authenticate = () => {
    localStorage.setItem('pip.session.v1', JSON.stringify({ access_token: 'synthetic', refresh_token: 'synthetic', expires_at: Math.floor(Date.now() / 1000) + 86400, user: { id: 'dashboard-qa', email: 'qa@example.invalid', name: 'Alex Rivera' } }));
    localStorage.setItem('pip.onboarded.dashboard-qa', '1');
    localStorage.setItem('pip.sync.cursor.dashboard-qa', '1');
  };
  await context.addInitScript(authenticate);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${origin}/?seed=1`);
  const home = page.getByRole('main', { name: 'Your dashboard' });
  await page.getByRole('heading', { name: 'Hi, Alex.' }).waitFor();
  await page.locator('.home-stats strong').first().waitFor();
  assert.equal(await page.locator('.home-stats strong').first().textContent(), '7');
  assert.equal(await page.locator('.home-note').count(), 2);
  await page.setViewportSize({ width: 1180, height: 780 });
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => {
    const dock = document.querySelector('.db-dock').getBoundingClientRect();
    return document.querySelector('.home-welcome').getBoundingClientRect().height < 150
      && [...document.querySelectorAll('.home-lower>section')].every(section => section.getBoundingClientRect().bottom < dock.top);
  }), true, 'compact greeting leaves recent notes and checklist details visible above the dock');
  await page.locator('.home-signoff').scrollIntoViewIfNeeded();
  assert.ok(await page.evaluate(() => window.scrollY > 0), 'remaining content uses the document scroll');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.screenshot({ path: `${artifacts}/desktop.png`, fullPage: true });

  // Open a pinned note, update its pin, and verify Home reflects the edit.
  await page.locator('.home-note').first().click();
  await page.getByRole('textbox', { name: 'Title', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Unpin', exact: true }).click();
  await page.getByRole('button', { name: 'Back to notes', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.home-note').length === 1);

  // Continue an unfinished capture, preserving its exact text.
  await page.evaluate(async () => { await (await import('/src/useNotes.ts')).repo.saveDraft('Remember the scenic route'); });
  await page.getByRole('button', { name: 'Resume draft' }).click();
  assert.equal(await page.getByRole('textbox', { name: 'Note text' }).inputValue(), 'Remember the scenic route');
  await page.keyboard.press('Escape');
  await page.getByRole('dialog', { name: 'Quick capture' }).waitFor({ state: 'detached' });

  // A checklist is opened in the existing editor; Home updates after autosave.
  await page.getByRole('button', { name: 'Open checklist: Groceries' }).click();
  await page.getByRole('checkbox', { name: 'Done: Oat milk' }).check();
  await page.getByRole('button', { name: 'Back to notes', exact: true }).click();
  await page.waitForFunction(() => ![...document.querySelectorAll('.home-check-list button')].some(button => button.textContent.includes('Oat milk')));

  // Filtering the board cannot filter the Home summary.
  await page.getByRole('button', { name: 'All pinned notes' }).click();
  await page.locator('.db-board').waitFor();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  assert.equal(await page.locator('.home-stats strong').first().textContent(), '7');
  await page.getByRole('searchbox', { name: 'Search notes' }).fill('Lisbon');
  await home.waitFor({ state: 'detached' });
  await page.waitForFunction(() => document.querySelectorAll('.db-card').length === 1);
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  assert.equal(await page.getByRole('searchbox', { name: 'Search notes' }).inputValue(), '');

  // Keyboard capture, theme, narrow layout, and reduced motion remain usable.
  await page.getByRole('button', { name: 'Capture a thought' }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('dialog', { name: 'Quick capture' }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('dialog', { name: 'Quick capture' }).waitFor({ state: 'detached' });
  await page.evaluate(async () => { const { repo } = await import('/src/useNotes.ts'); await repo.setPrefs({ ...await repo.getPrefs(), theme: 'dark', reducedMotion: true }); });
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await page.screenshot({ path: `${artifacts}/dark.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: `${artifacts}/mobile-dark.png`, fullPage: true });
  await page.evaluate(async () => { const { repo } = await import('/src/useNotes.ts'); await repo.setPrefs({ ...await repo.getPrefs(), theme: 'light' }); });
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await page.screenshot({ path: `${artifacts}/mobile.png`, fullPage: true });

  // Empty and nameless accounts get honest, useful starting states.
  const emptyContext = await browser.newContext();
  await emptyContext.route('**/*', intercept);
  await emptyContext.addInitScript(authenticate);
  const empty = await emptyContext.newPage();
  empty.on('pageerror', error => errors.push(error.message));
  await empty.goto(origin);
  await empty.getByRole('button', { name: 'Keep your first thought' }).waitFor();
  assert.equal(await empty.locator('.home-stats strong').first().textContent(), '0');
  assert.equal(await empty.locator('.home-note').count(), 0);
  await empty.screenshot({ path: `${artifacts}/empty.png`, fullPage: true });
  await empty.evaluate(() => { const session = JSON.parse(localStorage.getItem('pip.session.v1')); delete session.user.name; localStorage.setItem('pip.session.v1', JSON.stringify(session)); });
  // Mount directly so the init script doesn't put the synthetic name back on reload.
  await empty.evaluate(async () => {
    const React = await import('/node_modules/.vite/deps/react.js');
    const ReactDOM = await import('/node_modules/.vite/deps/react-dom_client.js');
    const Desk = (await import('/src/dirs/DirB.tsx')).default;
    const root = document.createElement('div'); document.body.replaceChildren(root);
    (ReactDOM.createRoot ?? ReactDOM.default.createRoot)(root).render((React.createElement ?? React.default.createElement)(Desk));
  });
  await empty.getByRole('heading', { name: 'Hi there.' }).waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS dashboard: personal greeting, pins and checklist updates, draft resume, view/search navigation, keyboard capture, dark/mobile/reduced motion, empty and missing-name states.');
  console.log(`Screenshots: ${artifacts}`);
} finally {
  await browser?.close();
  server.kill();
}
