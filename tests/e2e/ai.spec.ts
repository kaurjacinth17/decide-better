import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';

// Route mocks must see every request, so keep the service worker out of the way.
test.use({ serviceWorkers: 'block' });

const verdict = (page: Page) => page.locator('#verdict');
const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function withAi(
  page: Page,
  handlers: Partial<Record<'intake' | 'challenge' | 'gut' | 'memo', (body: Record<string, unknown>) => unknown>>,
) {
  const seen: Record<string, unknown[]> = {};
  await page.route('**/api/ai/status', (r) => json(r, { available: true, model: 'claude-sonnet-5-5' }));
  await page.route('**/api/ai/*', async (r) => {
    const feature = new URL(r.request().url()).pathname.split('/').pop()!;
    if (feature === 'status') return r.fallback();
    const body = r.request().postDataJSON() as Record<string, unknown>;
    (seen[feature] ??= []).push(body);
    const h = handlers[feature as keyof typeof handlers];
    return h ? json(r, h(body)) : json(r, { error: { code: 'upstream', message: 'not mocked' } }, 502);
  });
  return seen;
}

test('without an API key the app works fully and says AI is unavailable', async ({ page, request }) => {
  const res = await request.post('/api/ai/intake', { data: { description: 'A long enough description of a dilemma.' } });
  expect(res.status()).toBe(503);
  expect((await res.json()).error.code).toBe('unavailable');
  await page.goto('/');
  await expect(page.getByTestId('ai-status')).toHaveText(/aren't set up on this server/);
  await expect(page.getByTestId('intake')).toHaveCount(0);
  await expect(page.getByTestId('challenge')).toHaveCount(0);
  await expect(verdict(page).locator('.big b')).toHaveText('7.35');
});

test('A. intake: proposal shown as a diff, edited item by item, then created', async ({ page }) => {
  const seen = await withAi(page, {
    intake: () => ({
      proposal: {
        title: 'Pune offer or stay in Mumbai?',
        options: ['Stay in Mumbai', 'Pune offer', 'Wait a year'],
        criteria: [
          {
            name: 'Salary',
            weight: 30,
            hint: '',
            mode: 'value',
            unit: '₹ LPA',
            direction: 1,
            values: [18, 24, null],
            dealBreaker: null,
            why: 'You mentioned pay first.',
          },
          {
            name: 'Family nearby',
            weight: 35,
            hint: '10 = closest',
            mode: 'score',
            unit: '',
            direction: 1,
            values: [null, null, null],
            dealBreaker: null,
            why: 'Your parents are in Mumbai.',
          },
          {
            name: 'Short commute',
            weight: 15,
            hint: '10 = shortest',
            mode: 'score',
            unit: '',
            direction: 1,
            values: [null, null, null],
            dealBreaker: 4,
            why: 'Over an hour is a deal-breaker.',
          },
        ],
        assumptions: ['Assumed the Pune role is permanent.'],
      },
    }),
  });
  await page.goto('/');
  await page.getByText('Start from a description (AI)').click();
  const panel = page.getByTestId('intake');
  await panel.getByLabel('Describe your dilemma').fill('I have an offer in Pune at 24 LPA; I earn 18 in Mumbai where my family lives.');
  await panel.getByRole('button', { name: 'Suggest a worksheet' }).click();
  await expect(panel.getByRole('note')).toContainText('AI suggestions are proposals');
  await expect(panel).toContainText('from your description: Stay in Mumbai ₹18 LPA, Pune offer ₹24 LPA ·');
  // Item by item: drop an option, rename a criterion, change an importance.
  await panel.getByLabel('Keep option Wait a year').uncheck();
  await panel.getByLabel('Criterion 2 name').fill('Near family');
  await panel.getByLabel('Importance of Short commute').fill('25');
  await expect(page.locator('#title')).toHaveValue('Should I switch jobs?'); // nothing changed yet
  await panel.getByRole('button', { name: 'Create decision from kept items' }).click();
  await expect(page.locator('#title')).toHaveValue('Pune offer or stay in Mumbai?');
  await expect(page.getByLabel('Option 3 name')).toHaveCount(0);
  await expect(page.getByLabel('Criterion 2 name')).toHaveValue('Near family');
  await expect(page.getByLabel('Stay in Mumbai on Salary', { exact: true })).toHaveValue('18');
  await expect(page.getByLabel('Stay in Mumbai on Near family', { exact: true })).toHaveValue('5');
  expect(seen.intake).toHaveLength(1);
});

test('B. challenger: flags can be accepted (undoably) or dismissed', async ({ page }) => {
  const seen = await withAi(page, {
    challenge: () => ({
      flags: [
        {
          id: 'f0',
          kind: 'inconsistent_score',
          title: 'Brand scored equally',
          explanation: 'You described the new company as unknown, yet both score 7 on Brand.',
          suggestion: { action: 'set_score', criterion: 'Brand', option: 'Switch to new job', score: 4 },
        },
        {
          id: 'f1',
          kind: 'missing_criterion',
          title: 'Commute',
          explanation: 'Nothing covers travel time.',
          suggestion: { action: 'add_criterion', criterion: 'Commute', weight: 15, hint: '10 = shortest' },
        },
      ],
    }),
  });
  await page.goto('/');
  const panel = page.getByTestId('challenge');
  await panel.getByLabel(/What do you know about the options/).fill('The new company is a little-known startup.');
  await panel.getByRole('button', { name: 'Challenge my scores' }).click();
  await expect(panel.getByTestId('flag')).toHaveCount(2);
  await expect(panel.getByRole('note')).toContainText('AI suggestions are proposals');
  expect((seen.challenge![0] as { context: string }).context).toContain('little-known startup');
  // Nothing changed until accepted.
  await expect(page.getByLabel('Switch to new job on Brand', { exact: true })).toHaveValue('7');
  await panel.getByTestId('flag').first().getByRole('button', { name: 'Accept' }).click();
  await expect(page.getByLabel('Switch to new job on Brand', { exact: true })).toHaveValue('4');
  await expect(panel.getByTestId('flag').first()).toContainText('Applied. Use Undo to reverse it.');
  await panel.getByTestId('flag').nth(1).getByRole('button', { name: 'Dismiss' }).click();
  await expect(page.getByLabel('Criterion 6 name')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByLabel('Switch to new job on Brand', { exact: true })).toHaveValue('7');
  expect(
    await new AxeBuilder({ page })
      .include('[data-testid="challenge"]')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
      .then((r) => r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').length),
  ).toBe(0);
});

test('C. gut interview: up to 3 questions, then a proposed criterion with a preview', async ({ page }) => {
  const questions = ['What would you miss most about staying?', 'How does that feel day to day?'];
  await withAi(page, {
    gut: (body) => {
      const n = (body.transcript as unknown[]).length;
      if (n < 2) return { step: { done: false, question: questions[n] } };
      return {
        step: {
          done: true,
          summary: 'You keep coming back to your team.',
          proposal: { name: 'Team I love', why: 'You mentioned your team twice.', hint: '10 = closest team', weight: 60, scores: [10, 2] },
        },
      };
    },
  });
  await page.goto('/');
  await page.getByLabel('Your gut pick').selectOption({ label: 'Stay in current job' });
  const panel = page.getByTestId('gut-interview');
  await panel.getByRole('button', { name: 'Start the questions' }).click();
  await panel.getByLabel(questions[0]!).fill('My team, honestly.');
  await panel.getByRole('button', { name: 'Answer' }).click();
  await panel.getByLabel(questions[1]!).fill('I look forward to work because of them.');
  await panel.getByRole('button', { name: 'Answer' }).click();
  await expect(panel).toContainText('Team I love');
  await expect(panel).toContainText('If added as proposed: Stay in current job would lead with');
  await expect(panel).toContainText('your gut pick');
  await panel.getByRole('button', { name: 'Add this criterion' }).click();
  await expect(page.getByLabel('Criterion 6 name')).toHaveValue('Team I love');
  await expect(verdict(page).getByRole('heading', { name: 'Stay in current job' })).toBeVisible();
  await expect(page.getByTestId('gut')).toContainText('Your gut and your criteria agree');
});

test('D. memo: AI draft shown with the proposals note; server errors fall back gracefully', async ({ page }) => {
  let fail = true;
  await withAi(page, {
    memo: (body) => {
      expect((body.facts as { leader: { score: string } }).leader.score).toBe('7.35');
      if (fail) {
        fail = false;
        return {
          error: {
            code: 'invalid_output',
            message: 'The AI memo quoted figures that the engine didn’t produce (0.7), so it was discarded.',
          },
        };
      }
      return { memo: { headline: 'Switch to new job leads with 7.35.', sections: [{ heading: 'Why', body: 'It wins 86% of runs.' }] } };
    },
  });
  await page.goto('/memo');
  const section = page.getByTestId('ai-memo');
  await section.getByRole('button', { name: 'Draft with AI' }).click();
  await expect(section.getByRole('alert')).toContainText('so it was discarded');
  await expect(page.locator('article.memo')).toContainText('7.35 out of 10'); // standard memo unaffected
  await section.getByRole('button', { name: 'Try again' }).click();
  await expect(section).toContainText('Switch to new job leads with 7.35.');
  await expect(section.getByRole('note')).toContainText('every number in it was checked');
});

test('AI can be switched off by the user', async ({ page }) => {
  await withAi(page, {});
  await page.goto('/');
  await expect(page.getByTestId('challenge')).toBeVisible();
  await page.getByLabel('AI suggestions').uncheck();
  await expect(page.getByTestId('challenge')).toHaveCount(0);
  await expect(page.getByTestId('intake')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('challenge')).toHaveCount(0);
});

test('AI panels keep 44px touch targets and no horizontal scroll at 360px @phone', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone only');
  await withAi(page, {
    intake: () => ({
      proposal: {
        title: 'Which city?',
        options: ['Delhi', 'Bengaluru'],
        criteria: [
          {
            name: 'Rent',
            weight: 30,
            hint: '',
            mode: 'value',
            unit: '₹ a month',
            direction: -1,
            values: [22000, 30000],
            dealBreaker: null,
            why: 'Budget is tight.',
          },
        ],
        assumptions: [],
      },
    }),
  });
  await page.goto('/');
  await page.getByText('Start from a description (AI)').click();
  await page.getByLabel('Describe your dilemma').fill('Delhi or Bengaluru, rent is 22k vs 30k a month.');
  await page.getByRole('button', { name: 'Suggest a worksheet' }).click();
  await expect(page.getByLabel('Keep option Delhi')).toBeVisible();
  const small = await page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        '[data-testid="intake"] button, [data-testid="intake"] label.chk, [data-testid="intake"] input:not([type=checkbox]), [data-testid="challenge"] button',
      ),
    ]
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && (r.height < 43.5 || r.width < 43.5))
      .map(({ el, r }) => `${el.tagName} ${el.textContent?.slice(0, 20)} ${Math.round(r.width)}×${Math.round(r.height)}`),
  );
  expect(small).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
});
