import { test, expect } from '@playwright/test';

// Runs against the production build served by `vite preview`. Its job is not
// to re-test the tax logic (the jsdom journeys do that) but to prove the
// shipped artefact boots: entry chunk, lazy panels and static assets.
test('le parcours démo fonctionne sur le build de production', async ({ page }) => {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  // The quote API is not deployed alongside `vite preview`, so anything it
  // triggers is expected noise; everything else is a genuine build defect.
  const isApiNoise = (s: string) => s.includes('/api/') || s.includes('msft-quote');
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    if (isApiNoise(msg.text()) || isApiNoise(msg.location().url)) return;
    consoleErrors.push(msg.text());
  });
  page.on('requestfailed', (req) => {
    if (!isApiNoise(req.url())) failedRequests.push(`${req.url()} — ${req.failure()?.errorText}`);
  });
  page.on('response', (res) => {
    if (res.status() >= 400 && !isApiNoise(res.url())) failedRequests.push(`${res.url()} — HTTP ${res.status()}`);
  });

  await page.goto('/');
  await expect(page.getByRole('tablist', { name: 'Étapes de la déclaration' })).toBeVisible();

  await page.getByRole('tab', { name: /Mes données/ }).click();
  await page.getByRole('button', { name: /Charger la démo/ }).click();

  // The portfolio panel is a lazy chunk: seeing its content proves the split
  // bundle resolves at runtime, which no jsdom test can assert.
  await expect(page.getByRole('tab', { name: /Mon portefeuille/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#panel-portfolio')).toContainText('245');

  await page.getByRole('tab', { name: /Ma déclaration/ }).click();
  await expect(page.locator('#panel-declaration')).toContainText('FORMULAIRE 2042-C');

  // The quote API is not deployed with the preview server, so its 5xx is expected.
  expect(failedRequests).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('le worker pdf.js est servi par le build', async ({ request }) => {
  const res = await request.get('/pdf.worker.min.mjs');
  expect(res.status()).toBe(200);
});
