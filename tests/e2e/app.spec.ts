import { expect, test, type Page } from '@playwright/test';

const verdict = (page: Page) => page.locator('#verdict');
const cell = (page: Page, option: string, criterion: string) => page.getByLabel(`${option} on ${criterion}`, { exact: true });

async function fresh(page: Page) {
  await page.goto('/');
  await expect(verdict(page)).toBeVisible();
}

test.describe('happy paths', () => {
  test('opens on the Job template with the prototype verdict', async ({ page }) => {
    await fresh(page);
    await expect(page.locator('#title')).toHaveValue('Should I switch jobs?');
    const v = verdict(page);
    await expect(v.getByRole('heading', { name: 'Switch to new job' })).toBeVisible();
    await expect(v.locator('.big b')).toHaveText('7.35');
    await expect(v).toContainText('Ahead of Stay in current job by 0.53 points.');
    await expect(v).toContainText('Your decision changes if Risk is weighted above 20% (now 10%).');
    await expect(v).toContainText('Wins in 86% of 2,000 simulations');
    await expect(page.getByRole('table', { name: 'Points breakdown' }).locator('tfoot')).toContainText('7.35');
  });

  test('editing a score updates the verdict; undo and redo work', async ({ page }) => {
    await fresh(page);
    const growth = cell(page, 'Stay in current job', 'Growth');
    await growth.fill('10');
    await growth.blur();
    // Stay: 6.825 + 0.3 × 5 = 8.325 → leads
    await expect(verdict(page).getByRole('heading', { name: 'Stay in current job' })).toBeVisible();
    await expect(verdict(page).locator('.big b')).toHaveText('8.32');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(verdict(page).locator('.big b')).toHaveText('7.35');
    await expect(growth).toHaveValue('5');
    await page.getByRole('button', { name: 'Redo' }).click();
    await expect(growth).toHaveValue('10');
    // Keyboard shortcut outside text fields
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+z');
    await expect(growth).toHaveValue('5');
  });

  test('laptop template rules out the ThinkPad on price', async ({ page }) => {
    await fresh(page);
    await page.getByRole('button', { name: 'Which laptop' }).click();
    const v = verdict(page);
    await expect(v.getByRole('heading', { name: 'MacBook Air 13' })).toBeVisible();
    await expect(v.locator('.big b')).toHaveText('8.75');
    await expect(v.locator('.ro')).toContainText('ThinkPad X1 Carbon: Price is ₹1,35,000, above your limit of ₹1,30,000.');
    await expect(v).toContainText('Dell XPS 14');
  });

  test('blank template is a coin flip tie', async ({ page }) => {
    await fresh(page);
    await page.getByRole('button', { name: 'Blank' }).click();
    await expect(verdict(page)).toContainText('Effectively a tie.');
    await expect(verdict(page).locator('.pill')).toHaveText('Coin flip');
  });

  test('add, rename and remove criteria and options; criterion settings', async ({ page }) => {
    await fresh(page);
    await page.getByRole('button', { name: 'Add criterion' }).click();
    const name = page.getByLabel('Criterion 6 name');
    await expect(name).toBeFocused();
    await name.fill('Commute');
    await name.press('Enter');
    await expect(page.getByRole('slider', { name: 'Importance of Commute' })).toBeVisible();
    await page.getByRole('button', { name: 'Add option' }).click();
    await expect(page.getByLabel('Option 3 name')).toHaveValue('Option C');
    await page.getByRole('button', { name: 'Remove Option C' }).click();
    await expect(page.getByLabel('Option 3 name')).toHaveCount(0);
    await page.getByRole('button', { name: 'Remove Commute' }).click();
    await expect(page.getByLabel('Criterion 6 name')).toHaveCount(0);

    // Switch Salary from actual values to a 1–10 rating
    await page.getByRole('button', { name: 'Settings for Salary' }).click();
    await page.getByRole('button', { name: '1–10 rating' }).click();
    await expect(cell(page, 'Stay in current job', 'Salary')).toHaveValue('7.5');
    // Score deal-breaker: rule out anything below 8 on Salary
    await page.getByLabel('Deal-breaker').check();
    const limit = page.getByLabel('Rule out any option scoring below');
    await limit.fill('8');
    await limit.blur();
    await expect(verdict(page)).toContainText('Winner by elimination');
    await expect(verdict(page).locator('.ro')).toContainText('Stay in current job: Salary scored 7.5, below your minimum of 8.');
  });

  test('gut check explains a disagreement', async ({ page }) => {
    await fresh(page);
    await page.getByLabel('Your gut pick').selectOption({ label: 'Stay in current job' });
    const gut = page.getByTestId('gut');
    await expect(gut).toContainText(
      'You lean towards Stay in current job, but your criteria prefer Switch to new job by 0.53 points, mostly because of Growth',
    );
    await expect(gut).toContainText('Stay in current job would come out on top if');
  });

  test('pairwise weight helper suggests and applies weights', async ({ page }) => {
    await fresh(page);
    await page.getByRole('button', { name: 'Help me set weights' }).click();
    const dlg = page.getByRole('dialog', { name: 'Which matters more to you?' });
    await expect(dlg).toBeVisible();
    await expect(dlg).toContainText('Question 1 of 10');
    await dlg.getByRole('button', { name: 'Growth, by a lot' }).click();
    for (let k = 0; k < 9; k++) await page.getByRole('dialog').getByRole('button', { name: 'About the same' }).click();
    await expect(page.getByRole('dialog', { name: 'Suggested weights' })).toBeVisible();
    await page.getByRole('button', { name: 'Apply these weights' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('slider', { name: 'Importance of Growth' })).not.toHaveValue('30');
  });

  test('decisions persist across reloads (IndexedDB) and the library switches between them', async ({ page }) => {
    await fresh(page);
    await page.locator('#title').fill('My own job question');
    await page.locator('#title').press('Enter');
    await page.getByRole('button', { name: 'MBA specialisation' }).click();
    await expect(page.locator('#title')).toHaveValue('Which MBA specialisation should I pick?');
    await page.reload();
    await expect(page.locator('#title')).toHaveValue('Which MBA specialisation should I pick?');
    await page.getByLabel('Saved decisions').selectOption({ label: 'My own job question' });
    await expect(page.locator('#title')).toHaveValue('My own job question');
    await expect(verdict(page).locator('.big b')).toHaveText('7.35');
  });

  test('duplicate and two-step delete', async ({ page }) => {
    await fresh(page);
    await page.getByRole('button', { name: 'Duplicate' }).click();
    await expect(page.locator('#title')).toHaveValue('Should I switch jobs? (copy)');
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Confirm delete' })).toBeVisible();
    await page.getByRole('button', { name: 'Confirm delete' }).click();
    await expect(page.locator('#title')).toHaveValue('Should I switch jobs?');
    await expect(page.getByLabel('Saved decisions').locator('option')).toHaveCount(1);
  });

  test('copy summary puts Markdown on the clipboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await fresh(page);
    await page.getByRole('button', { name: 'Copy summary' }).click();
    await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
    const txt = await page.evaluate(() => navigator.clipboard.readText());
    expect(txt).toContain('# Should I switch jobs?');
    expect(txt).toContain('| Salary | 25% | ₹18 LPA (7.5) | ₹24 LPA (10) |');
    expect(txt).toContain('Wins in 86% of 2000 simulations (robust).');
  });

  test('imports a prototype export pasted into the box', async ({ page }) => {
    await fresh(page);
    const proto = {
      id: 'x1',
      tpl: 'blank',
      title: 'Imported from prototype',
      options: [
        { id: 'a', name: 'Tea' },
        { id: 'b', name: 'Coffee' },
      ],
      criteria: [{ id: 'c', name: 'Taste', w: 50, s: [9, 6], v: ['', ''], cert: 1, min: null, mode: 'score', dir: 1, unit: '', hint: '' }],
    };
    await page.getByText('Export or import a decision').click();
    await page.getByLabel('Decision data').fill(JSON.stringify(proto));
    await page.getByRole('button', { name: 'Import pasted decision' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Imported “Imported from prototype” as a new decision.' })).toBeVisible();
    await expect(verdict(page).getByRole('heading', { name: 'Tea' })).toBeVisible();
    await page.getByLabel('Decision data').fill('not json');
    await page.getByRole('button', { name: 'Import pasted decision' }).click();
    await expect(page.getByRole('status').filter({ hasText: "That doesn't look like a Decide Better decision" })).toBeVisible();
  });

  test('migrates the prototype localStorage library on first run', async ({ page }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem(
        'decide-better-lib',
        JSON.stringify({
          cur: 'p1',
          at: { p1: 1 },
          items: {
            p1: {
              id: 'p1',
              tpl: 'blank',
              title: 'Old prototype decision',
              options: [
                { id: 'a', name: 'Left' },
                { id: 'b', name: 'Right' },
              ],
              criteria: [{ id: 'c', name: 'Joy', w: 10, s: [3, 8] }],
            },
          },
        }),
      );
    });
    await page.goto('/');
    await expect(page.locator('#title')).toHaveValue('Old prototype decision');
    await expect(verdict(page).getByRole('heading', { name: 'Right' })).toBeVisible();
  });

  test('theme switch applies and persists @phone', async ({ page }) => {
    await fresh(page);
    await page.getByLabel('Theme').selectOption('dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('phone layout: no horizontal scroll and a leader bar that hides over the verdict @phone', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'phone only');
    await fresh(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    const bar = page.getByTestId('leaderbar');
    await expect(bar).toContainText('Leader Switch to new job');
    await expect(bar).toContainText('7.35 · wins 86%');
    await verdict(page).scrollIntoViewIfNeeded();
    await expect(bar).toHaveClass(/hide/);
  });

  test("switching decisions never shows or crashes on another decision's simulation", async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await fresh(page);
    await expect(verdict(page)).toContainText('Wins in 86%');
    // Same option count, different criteria count: the classic stale-result trap.
    await page.getByRole('button', { name: 'Blank' }).click();
    await expect(verdict(page).locator('.pill')).toHaveText('Coin flip');
    await page.getByRole('button', { name: 'Buy or rent' }).click();
    await page.getByRole('button', { name: 'Move cities' }).click();
    await page.getByLabel('Saved decisions').selectOption({ index: 3 });
    await expect(verdict(page)).toContainText('Wins in 86%');
    expect(errors).toEqual([]);
  });
});
