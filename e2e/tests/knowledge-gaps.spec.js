const { expect, test } = require('@playwright/test');
const { USERS, login, logout, shot } = require('./helpers');

async function ask(page, question) {
  await page.getByRole('textbox', { name: /Например/ }).fill(question);
  await page.getByRole('button', { name: 'Отправить' }).click();
}

const lastBot = (page) => page.getByRole('article', { name: 'AI Jana' }).last();

test('Knowledge gaps: unanswered and unhelpful questions reach HR, export and draft article', async ({ page }) => {
  // employee: one question outside the knowledge base, one answer marked unhelpful
  await login(page, USERS.employee);
  await page.getByRole('link', { name: 'AI Jana', exact: true }).click();
  await ask(page, 'Есть ли у нас ДМС?');
  await expect(lastBot(page)).toContainText('нет подтверждённой информации');
  await ask(page, 'Кто согласует мой отпуск?');
  await expect(lastBot(page).getByText('Источники')).toBeVisible();
  await lastBot(page).getByRole('button', { name: 'Не помогло' }).click();
  await expect(lastBot(page)).toContainText('Вопрос передан HR');
  await logout(page);

  // HR: journal, filter, status, export
  await login(page, USERS.hr);
  await page.getByRole('link', { name: 'Пробелы в базе знаний' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Пробелы в базе знаний');
  const table = page.getByRole('table');
  await expect(table.getByRole('row', { name: /Есть ли у нас ДМС\?/ })).toContainText('Нет релевантного документа');
  await expect(table.getByRole('row', { name: /Кто согласует мой отпуск\?/ })).toContainText('Не помогло');
  await shot(page, 'hr-knowledge-gaps');

  await page.getByLabel('Тип').click();
  await page.getByRole('option', { name: 'Не помогло' }).click();
  await expect(table.getByRole('row')).toHaveCount(2); // header + one event

  await table.getByRole('row', { name: /Кто согласует мой отпуск\?/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Статус').click();
  await page.getByRole('option', { name: 'В работе' }).click();
  await expect(dialog.getByText('Score')).toHaveCount(0);
  await dialog.getByLabel('Комментарий HR').fill('Уточнить раздел про согласование');
  await dialog.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Запись обновлена' })).toBeVisible();
  await expect(table.getByRole('row', { name: /Кто согласует мой отпуск\?/ })).toContainText('В работе');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Экспорт в Excel' }).click();
  expect((await download).suggestedFilename()).toMatch(/^janamen-knowledge-gaps-\d{4}-\d{2}-\d{2}\.xlsx$/);

  // «Создать статью» opens the existing editor with an unsaved draft section
  await page.getByLabel('Тип').click();
  await page.getByRole('option', { name: 'Все' }).click();
  await table.getByRole('row', { name: /Есть ли у нас ДМС\?/ }).click();
  const gapDialog = page.getByRole('dialog');
  await gapDialog.getByLabel('Категория').click();                      // where the question belongs
  await page.getByRole('option', { name: 'Частые вопросы сотрудников' }).click();
  await gapDialog.getByRole('button', { name: 'Создать статью' }).click();
  await expect(page).toHaveURL(/\/admin\/knowledge\?draft=.*doc=KB-FAQ-001/);
  await expect(page.getByLabel('Название')).toHaveValue('Частые вопросы сотрудников'); // editor opened in the chosen document
  await expect(page.getByText('добавлен в документ как черновик раздела')).toBeVisible();
  await expect(page.getByLabel(/Текст/)).toHaveValue(/## Есть ли у нас ДМС\?/);
  await shot(page, 'hr-gap-draft-article');
});
