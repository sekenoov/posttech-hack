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
  await expect(answer.getByText('KB-LEAVE-001 v1.0')).toBeVisible();
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
  await expect(answer).toContainText('Обратитесь, пожалуйста, в HR');
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

test('AI Jana answers the employee’s own leave balance and offers a request', async ({ page }) => {
  await login(page, USERS.employee);
  await page.getByRole('link', { name: 'AI Jana', exact: true }).click();
  await ask(page, 'Сколько дней я могу взять в отпуск?');

  const answer = lastBot(page);
  await expect(answer).toContainText('Данные JanaМен');
  await expect(answer).toContainText(/Сейчас вы можете взять \d+ календарн/);
  await expect(answer).toContainText(/Положено на \d{4} год/);
  await expect(answer.getByText('Источники')).toHaveCount(0);
  await answer.getByRole('link', { name: 'Подать заявку' }).click();
  await expect(page).toHaveURL(/\/requests\/new$/);
});

test('AI Jana shows a manager the requests waiting for a decision as cards', async ({ page }) => {
  await login(page, USERS.manager);
  await page.getByRole('link', { name: 'AI Jana', exact: true }).click();
  await ask(page, 'Какие заявки ждут моего решения?');

  const answer = lastBot(page);
  await expect(answer).toContainText('Данные JanaМен');
  await expect(answer).toContainText(/Вашего решения ждут \d+ заявк/);
  const card = answer.getByRole('link', { name: /На рассмотрении/ }).first();
  await expect(card).toBeVisible();
  await card.click();
  await expect(page).toHaveURL(/\/requests\/\d+$/);
});

test('AI Jana lists the employee’s own requests with their statuses', async ({ page }) => {
  await login(page, USERS.employee);
  await page.getByRole('link', { name: 'AI Jana', exact: true }).click();
  await ask(page, 'Что с моими заявками?');
  const answer = lastBot(page);
  await expect(answer).toContainText(/У вас \d+ заяв/);
  await expect(answer.getByRole('link', { name: 'Мои заявки' })).toBeVisible();
});
