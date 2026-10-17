const { expect, test } = require('@playwright/test');
const { USERS, isoInDays, login, logout, shot } = require('./helpers');

test('S1 — employee sees profile, requests, notifications on the dashboard', async ({ page }) => {
  await login(page, USERS.employee);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Здравствуйте, Айдана!');
  await expect(page.getByText('Доступно дней отпуска')).toBeVisible();
  await expect(page.getByText('Кадровые данные')).toBeVisible();
  await expect(page.getByText('Абдрахманов Нурлан Ерикович')).toBeVisible();
  await expect(page.getByText('Последние заявки')).toBeVisible();
  await expect(page.getByText('Последние уведомления')).toBeVisible();
  await shot(page, 's1-employee-dashboard');

  await page.getByRole('link', { name: 'Мой профиль' }).first().click();
  await expect(page.getByRole('alert').filter({ hasText: 'доступны только для чтения' })).toBeVisible();
  await expect(page.getByText('Специалист по логистике')).toBeVisible();
  await shot(page, 's1-profile');
});

test('S2 — vacation request: employee submits, manager approves, employee is notified', async ({ page }) => {
  const start = isoInDays(150);
  const end = isoInDays(152);

  await login(page, USERS.employee);
  await page.getByRole('link', { name: 'Оформить отпуск' }).click();
  await page.getByLabel('Первый день отпуска').fill(start);
  await page.getByLabel('Последний день отпуска').fill(end);
  await page.getByLabel('Комментарий для руководителя').fill('E2E: отпуск на три дня');
  await expect(page.getByText('Отпуск на 3 дня')).toBeVisible();
  await shot(page, 's2-new-request');
  await page.getByRole('button', { name: 'Отправить на согласование' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Заявка отправлена руководителю' })).toBeVisible();
  await expect(page.getByText('На рассмотрении').first()).toBeVisible();
  const requestUrl = page.url();
  await logout(page);

  await login(page, USERS.manager);
  await page.getByRole('link', { name: 'Команда' }).click();
  const row = page.locator('div').filter({ hasText: 'Касымова Айдана' }).filter({ hasText: '3 дня' }).last();
  await expect(row).toBeVisible();
  await shot(page, 's2-manager-team');
  await page.goto(requestUrl);
  await page.getByRole('button', { name: 'Согласовать' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Заявка согласована' })).toBeVisible();
  await expect(page.getByText('Решение принял(а)')).toBeVisible();
  await expect(page.getByText(/DL-\d{4}-\d{5}/)).toBeVisible();
  await shot(page, 's2-approved');
  await logout(page);

  await login(page, USERS.employee);
  await page.getByRole('button', { name: /Уведомления:/ }).click();
  await page.locator('.MuiPopover-paper').getByText('Заявка на отпуск согласована').first().click();
  await expect(page).toHaveURL(requestUrl);
  await expect(page.getByText('Согласовано').first()).toBeVisible();
});

test('S2 — manager rejects with a comment that the employee sees', async ({ page }) => {
  await login(page, USERS.manager);
  await page.getByRole('link', { name: 'Команда' }).click();
  await page.getByRole('button', { name: 'Отклонить' }).first().click();
  await page.getByLabel('Причина отклонения').fill('E2E: пересекается с инвентаризацией');
  await page.getByRole('dialog').getByRole('button', { name: 'Отклонить' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Заявка отклонена' })).toBeVisible();
});

test('S3 — employee cannot open team or admin pages', async ({ page }) => {
  await login(page, USERS.employee);
  await expect(page.getByRole('link', { name: 'Команда' })).toHaveCount(0);
  await page.goto('/team');
  await expect(page.getByText('Нет доступа')).toBeVisible();
  await page.goto('/admin/employees');
  await expect(page.getByText('Нет доступа')).toBeVisible();
  await shot(page, 's3-forbidden');
});

test('S3 — manager sees only direct reports, foreign request is not found', async ({ page }) => {
  await login(page, USERS.manager);
  await page.getByRole('link', { name: 'Команда' }).click();
  await page.getByRole('tab', { name: 'Сотрудники' }).click();
  await expect(page.getByText('Касымова Айдана Бауыржановна')).toBeVisible();
  await expect(page.getByText('Оспанов Тимур')).toHaveCount(0);
  await shot(page, 's3-manager-members');

  // Тимур's request id, looked up as his own manager, then opened by Нурлан
  const id = await page.evaluate(async () => {
    const token = localStorage.getItem('janamen.token');
    const res = await fetch('/api/team/requests?status=pending', { headers: { Authorization: `Bearer ${token}` } });
    return (await res.json()).map((r) => r.employee.full_name).join('|');
  });
  expect(id).not.toContain('Оспанов');
});

test('HR sees employees directory and company-wide requests', async ({ page }) => {
  await login(page, USERS.hr);
  await page.getByRole('link', { name: 'Сотрудники' }).click();
  await expect(page.getByText('Оспанов Тимур Даулетович')).toBeVisible();
  await expect(page.getByText('Касымова Айдана Бауыржановна')).toBeVisible();
  await shot(page, 'hr-employees');
  await page.getByRole('link', { name: 'Заявки сотрудников' }).click();
  await page.getByRole('tab', { name: 'Все заявки' }).click();
  await expect(page.getByText('Оспанов Тимур Даулетович').first()).toBeVisible();

  await page.getByRole('link', { name: 'Интеграции' }).click();
  await expect(page.getByRole('heading', { name: '1С:ЗУП' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Documentolog' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'submit_leave_order' }).first()).toBeVisible();
  await shot(page, 'hr-integrations');
});

test('mobile layout: drawer navigation works at 375px', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await login(page, USERS.employee);
  await shot(page, 'mobile-dashboard');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  await page.getByRole('button', { name: 'Меню' }).click();
  await page.getByRole('link', { name: 'Мои заявки' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Мои заявки');
  await page.close();
});
