import { test, expect } from '@playwright/test';

async function login(page: import('@playwright/test').Page) {
  const response = await page.request.post('http://127.0.0.1:8000/auth/jwt/login', {
    form: {
      username: 'admin@example.com',
      password: '12345678',
    },
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  await page.context().addCookies([
    {
      name: 'accessToken',
      value: body.access_token,
      url: 'http://127.0.0.1:3000',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);

  await page.goto('/dashboard');
  await expect(page).toHaveURL(/dashboard/);
}

test('global balance, history drawer, and image pre-cost preview stay visible', async ({ page }) => {
  await login(page);

  const balanceButton = page.getByRole('button').filter({ hasText: /99199|\d{2,}/ }).first();
  await expect(balanceButton).toBeVisible();
  await balanceButton.screenshot({ path: '.sisyphus/evidence/task-18-e2e-balance-history.png' });

  await balanceButton.click();
  await expect(page.getByText('积分流水')).toBeVisible();
  await expect(page.getByText(/当前余额/)).toBeVisible();

  await page.goto('/ai/image');
  const previewBlock = page.getByText('生成前积分预估').locator('..');
  await expect(page.getByText('生成前积分预估')).toBeVisible();
  const modelCombo = page.getByRole('combobox').first();
  await modelCombo.click();
  await expect(page.locator('[role="listbox"]').first()).toBeVisible();
  await expect(previewBlock.getByText(/计算中\.\.\.|消耗\s*\d+\s*积分|请选择模型后查看积分预估/)).toBeVisible();
  await previewBlock.screenshot({ path: '.sisyphus/evidence/task-18-e2e-precost-flow.png' });
});
