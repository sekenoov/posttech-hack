const { expect, test } = require('@playwright/test');
const { USERS, login, shot } = require('./helpers');

test('RU/KZ — interface switches to Kazakh and the choice is saved in the profile', async ({ page }) => {
  await login(page, USERS.employee);
  await page.getByRole('button', { name: 'Қаз' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Сәлеметсіз бе, Айдана!');
  await expect(page.getByRole('link', { name: 'Басты бет' })).toBeVisible();
  await expect(page.getByText('Логистикалық операциялар').first()).toBeVisible();
  await expect(page.getByText('Қолжетімді демалыс күндері')).toBeVisible();
  await shot(page, 'kz-dashboard');

  // saved server-side: a fresh session in another browser context opens in Kazakh
  const other = await page.context().browser().newPage();
  await login(other, USERS.employee).catch(() => {});
  await expect(other.getByRole('heading', { level: 1 })).toHaveText('Сәлеметсіз бе, Айдана!');
  await other.close();

  await page.getByRole('button', { name: 'Рус' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Здравствуйте, Айдана!');
});
