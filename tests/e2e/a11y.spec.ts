import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectNoSeriousViolations(page: Page, label: string) {
  const res = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const bad = res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const summary = bad.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.nodes
        .map((n) => n.target.join(' '))
        .slice(0, 3)
        .join(' | ')}`,
  );
  expect(summary, `${label}: axe serious/critical violations`).toEqual([]);
}

async function ready(page: Page) {
  await page.goto('/');
  await expect(page.locator('#verdict')).toContainText('simulations');
}

for (const theme of ['light', 'dark'] as const) {
  test(`axe: main view, settings drawer and dialog in ${theme} theme @phone`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await ready(page);
    await expectNoSeriousViolations(page, `${theme} main`);

    await page.getByRole('button', { name: 'Which laptop' }).click();
    await page.getByRole('button', { name: 'Settings for Price' }).click();
    await page.getByLabel('Your gut pick').selectOption({ label: 'ThinkPad X1 Carbon' });
    await expectNoSeriousViolations(page, `${theme} laptop + settings + gut`);

    await page.getByRole('button', { name: 'Help me set weights' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expectNoSeriousViolations(page, `${theme} dialog`);
  });
}

test('touch targets are at least 44×44 px on a 360px phone @phone', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone only');
  await ready(page);
  await page.getByRole('button', { name: 'Settings for Salary' }).click();
  await page.getByText('Export or import a decision').click();
  const small = await page.evaluate(() => {
    const sel = 'button, select, textarea, a[href], summary, label.chk, input:not([type=checkbox]):not([type=hidden])';
    return [...document.querySelectorAll<HTMLElement>(sel)]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return (
          r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !el.closest('.sr-only-x') && !el.classList.contains('sr-only-x')
        );
      })
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.height < 43.5 || r.width < 43.5)
      .map(
        ({ el, r }) =>
          `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}" ${Math.round(r.width)}×${Math.round(r.height)}`,
      );
  });
  expect(small).toEqual([]);
});

test('the whole matrix and verdict can be operated by keyboard with visible focus', async ({ page }) => {
  await ready(page);
  // The skip link is the first stop and lands on the matrix.
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to the scoring matrix' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();

  // Every focusable control shows a visible focus indicator.
  const report = await page.evaluate(async () => {
    const els = [...document.querySelectorAll<HTMLElement>('button:not([disabled]), select, input, textarea, a[href], summary')].filter(
      (el) => el.offsetParent !== null,
    );
    const missing: string[] = [];
    for (const el of els) {
      el.focus({ focusVisible: true } as FocusOptions);
      if (document.activeElement !== el) continue; // e.g. inside a collapsed <details>
      const cs = getComputedStyle(el);
      const ring = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
      const shadow = cs.boxShadow !== 'none';
      const border = el.matches('.oname, .cname, .q');
      if (!ring && !shadow && !border) missing.push(`${el.tagName} ${el.getAttribute('aria-label') ?? el.textContent?.slice(0, 20)}`);
    }
    return { count: els.length, missing };
  });
  expect(report.count).toBeGreaterThan(40);
  expect(report.missing).toEqual([]);

  // Change a score, a weight and the gut pick using only the keyboard.
  const score = page.getByLabel('Switch to new job on Growth', { exact: true });
  await score.focus();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('2');
  await page.keyboard.press('Enter');
  await expect(page.locator('#verdict h2')).toHaveText('Stay in current job');
  const slider = page.getByRole('slider', { name: 'Importance of Risk' });
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveValue('11');
  await page.getByRole('button', { name: 'Settings for Risk' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Settings for Risk' })).toHaveAttribute('aria-expanded', 'true');

  // The dialog traps focus and closes with Escape, returning focus to its opener.
  const opener = page.getByRole('button', { name: 'Help me set weights' });
  await opener.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'About the same' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('the simulation result appears and updates after edits (worker + 150 ms debounce)', async ({ page }) => {
  await ready(page);
  await expect(page.locator('#verdict')).toContainText('Wins in 86% of 2,000 simulations');
  const growth = page.getByLabel('Switch to new job on Growth', { exact: true });
  await growth.fill('6');
  await growth.blur();
  await expect(page.locator('#verdict')).not.toContainText('Wins in 86%');
  await expect(page.locator('#verdict .pill')).toBeVisible();
});
