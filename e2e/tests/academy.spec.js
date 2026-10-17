const fs = require('node:fs');
const path = require('node:path');
const { expect, test } = require('@playwright/test');
const { USERS, login, logout, shot } = require('./helpers');

// The answer key is never sent by the API; the test reads it from the seed file.
const seed = JSON.parse(fs.readFileSync(path.join(__dirname, '../../backend/seed_data/courses.json'), 'utf-8'));
const infosec = seed.courses.find((c) => c.slug === 'information-security-basics');

test('S4 — HR assigns a course, employee completes lessons and quiz, result is saved', async ({ page }) => {
  await login(page, USERS.hr);
  await page.getByRole('link', { name: 'Обучение' }).click();
  await page.getByRole('button', { name: 'Назначить курс' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Курс').click();
  await page.getByRole('option', { name: infosec.title }).click();
  await dialog.getByLabel('Сотрудники').fill('Касымова');
  await page.getByRole('option', { name: /Касымова Айдана/ }).click();
  await dialog.getByRole('button', { name: 'Назначить курс' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Назначено: 1' })).toBeVisible();
  await logout(page);

  await login(page, USERS.employee);
  await page.getByRole('button', { name: /Уведомления:/ }).click();
  await page.locator('.MuiPopover-paper').getByText('Вам назначен курс').first().click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(infosec.title);

  // two lessons, then reload: progress must survive
  for (let i = 0; i < 2; i += 1) {
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(infosec.lessons[i].title);
    await page.getByRole('button', { name: /Урок пройден/ }).click();
  }
  await page.reload();
  await expect(page.getByText('53%')).toBeVisible(); // 2 of 3 lessons = 80% * 2/3
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(infosec.lessons[2].title);
  await shot(page, 's4-lesson');
  await page.getByRole('button', { name: 'Урок пройден, к тесту' }).click();

  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Итоговый тест');
  for (const [i, q] of infosec.questions.entries()) {
    await page.getByRole('group', { name: new RegExp(`^${i + 1}\\.`) }).getByLabel(q.options[q.correct], { exact: true }).check();
  }
  await page.getByRole('button', { name: 'Проверить ответы' }).click();
  await expect(page.getByRole('status')).toContainText('Курс пройден! Результат 100%');
  await shot(page, 's4-quiz-passed');

  await page.getByRole('link', { name: 'Мой профиль' }).first().click();
  await expect(page.getByText(infosec.title)).toBeVisible();
  await expect(page.getByText('Результат: 100%')).toBeVisible();
  await logout(page);

  await login(page, USERS.hr);
  await page.getByRole('link', { name: 'Обучение' }).click();
  const row = page.getByRole('row').filter({ hasText: 'Касымова Айдана' }).filter({ hasText: infosec.title });
  await expect(row).toContainText('100%');
  await expect(row).toContainText('Завершён');
});
