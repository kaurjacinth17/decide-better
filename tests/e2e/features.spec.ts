import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const verdict = (page: Page) => page.locator('#verdict');

async function seriousViolations(page: Page) {
  const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  return res.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`);
}

test('share a read-only link, open it elsewhere, and make a copy', async ({ page, context, browser }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.getByRole('button', { name: 'Which laptop' }).click();
  await page.getByRole('button', { name: 'Share read-only link' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Read-only link copied' })).toBeVisible();
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(url).toMatch(/\/view#d=/);

  // A different browser profile: nothing in its IndexedDB.
  const other = await browser.newContext();
  const viewer = await other.newPage();
  await viewer.goto(url);
  await expect(viewer.getByRole('note').filter({ hasText: 'viewing a shared decision' })).toBeVisible();
  await expect(viewer.getByRole('heading', { level: 1 })).toHaveText('Which laptop should I buy?');
  await expect(verdict(viewer).locator('.big b')).toHaveText('8.75');
  await expect(verdict(viewer).locator('.ro')).toContainText('ThinkPad X1 Carbon');
  await expect(viewer.getByLabel('MacBook Air 13 on Performance', { exact: true })).toHaveAttribute('readonly', '');
  await expect(viewer.getByRole('button', { name: 'Add criterion' })).toHaveCount(0);
  await expect(viewer.getByRole('slider', { name: 'Importance of Price' })).toBeDisabled();
  expect(await seriousViolations(viewer)).toEqual([]);

  await viewer.getByRole('button', { name: 'Make a copy' }).click();
  await expect(viewer).toHaveURL(/\/$/);
  await expect(viewer.locator('#title')).toHaveValue('Which laptop should I buy?');
  await expect(viewer.getByLabel('MacBook Air 13 on Performance', { exact: true })).not.toHaveAttribute('readonly');
  await other.close();
});

test('a damaged share link explains itself', async ({ page }) => {
  await page.goto('/view#d=nonsense');
  await expect(page.getByRole('heading', { name: "Can't open this shared decision" })).toBeVisible();
});

test('save a version, re-weight, and compare before/after', async ({ page }) => {
  await page.goto('/');
  await expect(verdict(page).getByRole('heading', { name: 'Switch to new job' })).toBeVisible();
  await page.getByRole('button', { name: 'Save version' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved “Version 1' })).toBeVisible();
  // Push Risk past its flip point (20%): raw 10 → 60 makes it 40%.
  const risk = page.getByRole('slider', { name: 'Importance of Risk' });
  await risk.fill('60');
  await risk.blur();
  await expect(verdict(page).getByRole('heading', { name: 'Stay in current job' })).toBeVisible();
  await page.getByRole('link', { name: 'Compare versions' }).click();
  await expect(page.getByRole('heading', { name: 'Compare two versions' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('The leader changes: Switch to new job → Stay in current job.');
  // Opening the page directly (snapshots load asynchronously) still defaults to the saved version.
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('The leader changes: Switch to new job → Stay in current job.');
  const row = page.getByRole('row', { name: /^Risk/ });
  await expect(row).toContainText('10%');
  await expect(row).toContainText('40%');
  await expect(row).toContainText('+30 pts');
  expect(await seriousViolations(page)).toEqual([]);
});

test('decision memo quotes the computed figures and is printable', async ({ page }) => {
  await page.goto('/');
  await expect(verdict(page)).toContainText('Wins in 86%');
  await page.getByRole('link', { name: 'Decision memo' }).click();
  const memo = page.locator('article.memo');
  await expect(memo.getByRole('heading', { level: 1 })).toHaveText('Should I switch jobs?');
  await expect(memo).toContainText(
    'Switch to new job comes out ahead with 7.35 out of 10, 0.53 points ahead of Stay in current job (6.82).',
  );
  await expect(memo).toContainText('It wins 86% of 2,000 simulated outcomes (robust).');
  await expect(memo).toContainText('The result changes if Risk is weighted above 20% (now 10%)');
  await expect(page.getByRole('button', { name: 'Print or save as PDF' })).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('button', { name: 'Print or save as PDF' })).toBeHidden();
});

test('works offline after the first visit (PWA)', async ({ page, context }) => {
  await page.goto('/');
  await expect(verdict(page)).toContainText('Wins in 86%');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  // Reload once so the page is controlled by the service worker and hands over its resources.
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await page.waitForTimeout(1000);
  await context.setOffline(true);
  await page.reload();
  await expect(verdict(page).locator('.big b')).toHaveText('7.35');
  await expect(verdict(page)).toContainText('Wins in 86% of 2,000 simulations');
  await page.goto('/memo');
  await expect(page.locator('article.memo')).toContainText('7.35 out of 10');
  await context.setOffline(false);
});

test('manifest makes the app installable', async ({ request }) => {
  const res = await request.get('/manifest.webmanifest');
  expect(res.ok()).toBe(true);
  const m = await res.json();
  expect(m.display).toBe('standalone');
  expect(m.icons.some((i: { sizes: string }) => i.sizes === '512x512')).toBe(true);
  const sw = await request.get('/sw.js');
  expect(sw.headers()['cache-control']).toContain('no-cache');
});
