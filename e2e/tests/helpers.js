const { expect } = require('@playwright/test');

const PASSWORD = 'JanaDemo2026!';
const USERS = {
  employee: 'employee@janamen.example',
  manager: 'manager@janamen.example',
  manager2: 'manager2@janamen.example',
  hr: 'hr@janamen.example',
};

async function login(page, email) {
  await page.goto('/login');
  await page.getByLabel('Рабочая почта').fill(email);
  await page.getByLabel('Пароль').fill(PASSWORD);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Здравствуйте');
}

async function logout(page) {
  await page.evaluate(() => localStorage.clear());
}

/** ISO date `days` from today in the browser's timezone. */
const isoInDays = (days) => {
  const d = new Date(Date.now() + days * 86400000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

const shot = (page, name) => page.screenshot({ path: `screenshots/${name}.png`, fullPage: true });

module.exports = { PASSWORD, USERS, login, logout, isoInDays, shot };
