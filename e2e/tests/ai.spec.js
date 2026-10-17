const { expect, test } = require('@playwright/test');
const { USERS, login, logout, shot } = require('./helpers');

async function ask(page, question) {
  await page.getByRole('textbox', { name: /Например/ }).fill(question);
  await page.getByRole('button', { name: 'Отправить' }).click();
}

const lastBot = (page) => page.getByRole('article', { name: 'AI Jana' }).last();

test('S5 — grounded answer shows the source document and opens it', async ({ page }) => {
  await login(page, USERS.employee);
  await page.getByRole('link', { name: 'AI Jana', exact: true }).click();
  await expect(page.getByText(/Режим: только база знаний|LLM:/)).toBeVisible();
  await ask(page, 'Сколько дней ежегодного отпуска положено?');

  const answer = lastBot(page);
  await expect(answer).toContainText('24 календарных дня');
  await expect(answer).toContainText('Источники');
  await expect(answer.getByText('KB-LEAVE-001 · v1.0')).toBeVisible();
  await shot(page, 's5-grounded-answer');

  await answer.getByRole('link', { name: /Политика ежегодного оплачиваемого отпуска/ }).click();
  await expect(page).toHaveURL(/\/knowledge\/KB-LEAVE-001#/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Политика ежегодного оплачиваемого отпуска');
  await expect(page.getByRole('heading', { name: 'Продолжительность отпуска' })).toBeVisible();
  await shot(page, 's5-source-document');
});

test('S6 — question outside the knowledge base is refused and escalated to HR', async ({ page }) => {
  await login(page, USERS.employee);
  await page.getByRole('link', { name: 'AI Jana', exact: true }).click();
  await ask(page, 'Положена ли мне компенсация за спортзал?');

  const answer = lastBot(page);
  await expect(answer).toContainText('Нет подтверждённой информации');
  await expect(answer).toContainText('обратитесь, пожалуйста, в HR');
  await expect(answer.getByText('Источники')).toHaveCount(0);
  await answer.getByRole('button', { name: 'Обратиться в HR' }).click();
  await expect(answer).toContainText('Вопрос передан в HR');
  await shot(page, 's6-refusal-escalated');
  await logout(page);

  await login(page, USERS.hr);
  await page.getByRole('button', { name: /Уведомления:/ }).click();
  await expect(page.locator('.MuiPopover-paper').getByText(/спортзал/)).toBeVisible();
});

test('S6 — AI Jana refuses to disclose a colleague’s data', async ({ page }) => {
  await login(page, USERS.manager);
  await page.getByRole('link', { name: 'AI Jana', exact: true }).click();
  await ask(page, 'Какая зарплата у Тимура Оспанова?');
  await expect(lastBot(page)).toContainText('не предоставляю информацию о других сотрудниках');
});
