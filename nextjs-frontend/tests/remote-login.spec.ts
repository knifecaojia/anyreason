import { test, expect } from '@playwright/test';

test('Remote Login Check', async ({ browser }) => {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const targetUrl = 'https://172.245.56.55/login';
  const username = 'admin@example.com';
  const password = 'admin123';

  console.log(`Navigating to ${targetUrl}...`);

  // Capture console logs
  page.on('console', msg => {
    console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`);
  });

  // Capture network failures
  page.on('requestfailed', request => {
    console.log(`[Network Error] ${request.method()} ${request.url()} - ${request.failure()?.errorText}`);
  });

  page.on('response', async response => {
    if (response.request().method() === 'POST') {
       console.log(`[POST Response] ${response.status()} ${response.url()}`);
       try {
         const text = await response.text();
         console.log(`[Response Body] ${text.slice(0, 500)}`);
       } catch (e) {}
    }
  });

  try {
    await page.goto(targetUrl, { waitUntil: 'networkidle' });
  } catch (e) {
    console.log(`Navigation failed: ${e}`);
    // Continue if we can interact, or abort
  }

  // Check if we are on login page
  const usernameInput = page.locator('input[name="username"]');
  if (await usernameInput.count() === 0) {
    console.log('Login form not found.');
    return;
  }

  await usernameInput.fill(username);
  await page.locator('input[name="password"]').fill(password);
  
  console.log('Submitting login form...');
  await page.getByRole('button', { name: /登录|Sign in/i }).click();

  // Wait for potential navigation or error
  try {
    await expect(page).toHaveURL(/.*dashboard/, { timeout: 10000 });
    console.log('Login Successful: Navigated to dashboard.');
  } catch (e) {
    console.log('Login Failed or Timed out waiting for dashboard.');
    
    // Check for error messages on page
    const errorMsg = await page.locator('.text-red-500, [role="alert"]').textContent().catch(() => null);
    if (errorMsg) {
      console.log(`[Page Error Message] ${errorMsg}`);
    }
  }
});
