import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

// Install the optional browser driver with: npm install --no-save --package-lock=false playwright

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], { cwd: process.cwd(), stdio: 'ignore' });
let browser;
try {
  await new Promise(resolve => setTimeout(resolve, 1500));
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const mountBoard = async () => {
    await page.goto('http://127.0.0.1:1420/?seed=1&capture=1');
    await page.evaluate(async () => {
      const React = await import('/node_modules/.vite/deps/react.js');
      const ReactDOM = await import('/node_modules/.vite/deps/react-dom_client.js');
      const Desk = (await import('/src/dirs/DirB.tsx')).default;
      document.documentElement.classList.remove('cap-win');
      const root = document.createElement('div');
      document.body.replaceChildren(root);
      (ReactDOM.createRoot ?? ReactDOM.default.createRoot)(root).render((React.createElement ?? React.default.createElement)(Desk));
    });
    await page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: /^All(?:\s|$)/ }).click();
    await page.locator('.db-card').first().waitFor();
    await page.waitForTimeout(350);
  };

  await mountBoard();
  const card = page.locator('.db-card').first();
  const id = await card.evaluate(el => el.textContent.includes('Landing page idea') ? 'n1' : '');
  assert.equal(id, 'n1');
  const before = await card.boundingBox();
  await page.mouse.move(before.x + 70, before.y + 35);
  await page.mouse.down();
  await page.mouse.move(before.x + 240, before.y + 145, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(350);
  const after = await card.boundingBox();
  assert.ok(after.x - before.x > 100, 'card should follow the pointer');
  assert.equal(await page.locator('.db-sheet').count(), 0, 'drag release must not open the note');
  const saved = await page.evaluate(async () => (await (await import('/src/useNotes.ts')).repo.getPrefs()).cardPositions?.n1);
  assert.ok(saved && Math.abs(saved.x - 170) < 3 && Math.abs(saved.y - 110) < 3, 'position should persist');

  await mountBoard();
  const placedCard = page.getByRole('button', { name: /Open Landing page idea/ });
  const restored = await placedCard.boundingBox();
  assert.ok(Math.abs(restored.x - after.x) < 3 && Math.abs(restored.y - after.y) < 3, 'reload should restore placement');
  const keyboardCard = page.locator('.db-card').nth(1);
  const keyboardBefore = await keyboardCard.boundingBox();
  const boardBefore = await page.locator('.db-board').boundingBox();
  await keyboardCard.focus();
  await page.keyboard.press('Alt+ArrowRight');
  const keyboardSaved = await page.evaluate(async () => (await (await import('/src/useNotes.ts')).repo.getPrefs()).cardPositions?.n4);
  assert.ok(Math.abs(keyboardSaved.x - (keyboardBefore.x - boardBefore.x + 24)) < 3, 'keyboard movement should save');
  await page.evaluate(async () => {
    await (await import('/src/useNotes.ts')).repo.setPinned('n1', false);
    window.dispatchEvent(new Event('pip:changed'));
  });
  await page.waitForTimeout(300);
  const reordered = await placedCard.boundingBox();
  assert.ok(Math.abs(reordered.x - restored.x) < 3 && Math.abs(reordered.y - restored.y) < 3, 'sorting should not move a placed card');
  await page.setViewportSize({ width: 420, height: 750 });
  await page.waitForTimeout(350);
  const narrowCard = await placedCard.boundingBox();
  const board = await page.locator('.db-board').boundingBox();
  assert.ok(narrowCard.x >= board.x - 2 && narrowCard.x + narrowCard.width <= board.x + board.width + 2, 'card should stay visible on a narrow board');
  await placedCard.click();
  assert.equal(await page.locator('.db-sheet').count(), 1, 'normal click should open the note');
  const assertOverlayCoversCards = async (selector) => {
    assert.equal(await page.evaluate(selector => [...document.querySelectorAll('.db-card')].every(card => {
      const rect = card.getBoundingClientRect();
      const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
      return y < 0 || y >= innerHeight || !!document.elementFromPoint(x, y)?.closest(selector);
    }), selector), true, 'dialogs must cover even cards with saved high stacking orders');
  };
  await assertOverlayCoversCards('.db-veil');
  await page.getByRole('button', { name: 'Back to notes', exact: true }).click();
  await page.locator('.db-veil').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('dialog', { name: 'Settings', exact: true }).waitFor();
  await assertOverlayCoversCards('.scrim');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.setViewportSize({ width: 1200, height: 850 });
  const notesBeforeArrange = await page.evaluate(async () => (await (await import('/src/useNotes.ts')).repo.syncState()).notes);
  await page.getByRole('button', { name: 'Auto arrange', exact: true }).click();
  await page.mouse.move(10, 10);
  await page.waitForTimeout(350);
  const assertArranged = async () => {
    const state = await page.evaluate(async () => (await import('/src/useNotes.ts')).repo.syncState());
    assert.deepEqual(state.prefs.cardPositions, {}, 'arrangement reset should persist');
    assert.deepEqual(state.notes, notesBeforeArrange, 'arranging must preserve note content and revisions');
    assert.equal(await page.evaluate(() => {
      const board = document.querySelector('.db-board').getBoundingClientRect();
      return [...document.querySelectorAll('.db-card')].every(card => {
        const rect = card.getBoundingClientRect();
        return Math.abs(rect.left - board.left - card.offsetLeft) < 2 && Math.abs(rect.top - board.top - card.offsetTop) < 2;
      });
    }), true, 'all cards should return to their natural column positions');
  };
  await assertArranged();
  await mountBoard();
  await assertArranged();
  assert.deepEqual(errors, []);
  console.log('Card drag, persistence, keyboard, resize, dialog layering, auto arrange, and reload: PASS');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
