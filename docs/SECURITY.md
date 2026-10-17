# JanaМен — безопасность

## 1. Исправленные уязвимости WorkHub (Phase 1A)

| ID | Было | Исправление | Тест |
|---|---|---|---|
| SEC-1 | `POST /auth/register` без авторизации, с выбором роли: любой мог стать HR | Эндпоинт удалён. Учётные записи создаёт HR (`POST /admin/employees`) или синхронизация с 1С:ЗУП | `test_public_registration_is_disabled` |
| SEC-2 | `PATCH /users/me` менял Ф.И.О. и `manager_id` | `PATCH /me` принимает только `personal_phone` и `locale`; схема с `extra="forbid"` → 422 на любое официальное поле | `test_employee_cannot_change_official_fields` |
| SEC-3 | Согласование по совпадению отдела: можно было согласовать свою заявку или заявку коллеги-руководителя | Решение принимает только непосредственный руководитель (`manager_id`) или HR как резервный согласующий; self-approval запрещён для всех ролей | `test_manager_cannot_approve_own_request`, `test_hr_cannot_approve_own_request`, `test_manager_cannot_decide_other_team_request` |
| SEC-4 | Автосогласование pending-заявок через 5 минут | Логика удалена; переходы статусов — только в `services/leave.py` | `test_no_automatic_approval_of_old_pending_requests` |
| SEC-5 | Debug-логгер писал email и префикс bcrypt-хеша; фронтенд слал телеметрию на `127.0.0.1:7243` | Оба удалены | — |
| SEC-6 | Дефолтный JWT-секрет в коде | `SECRET_KEY` из env; если не задан — случайный ключ на процесс | `test_protected_endpoints_require_valid_token` (поддельный и просроченный токены) |
| SEC-7 | Загрузка файлов без ограничений | Модуль документов удалён (хранение документов вне scope кейса) | — |
| SEC-9 | В git лежали `backend/data/employee_portal.db` и `backend/.cursor/debug.log` | `git rm --cached`, правила в `.gitignore` | Проверка `git ls-files` в чек-листе поставки |

## 2. Модель доступа

Все правила собраны в `backend/app/permissions.py`.

| Ресурс | Сотрудник | Руководитель | HR |
|---|---|---|---|
| Свой профиль | чтение; запись только личных полей | то же | то же |
| Профиль другого | — | прямые подчинённые, командная проекция без контактов (`/team/members`) | все (`/admin/employees`) |
| Свои заявки | создание, просмотр, отзыв pending | то же | то же |
| Чужие заявки | — | прямые подчинённые: просмотр и решение | все: просмотр и решение, кроме своих |
| Уведомления | только свои | только свои | только свои |
| `/admin/*` | 403 | 403 | да |

Чужие объекты по ID возвращают **404**, а не 403, чтобы не раскрывать их существование.

## 3. Подготовка чистого репозитория для сдачи

**Проблема.** История git содержит файлы, которые не должны публиковаться повторно:
- `backend/.cursor/debug.log` — отладочный лог с email-ами демо-аккаунтов WorkHub и служебными данными;
- `backend/data/employee_portal.db` — SQLite-база WorkHub с bcrypt-хешами демо-паролей.

Оба файла уже есть в публичной истории upstream-репозитория `Alen983/WorkHub`. Реальных персональных данных там нет, но публиковать их ещё раз в репозитории команды не нужно. `.env` в историю никогда не попадал (проверено `git log --all -- backend/.env`).

**Правило: ветку `janamen` с текущей историей никуда не пушить.** Для сдачи создаём новый репозиторий из текущего дерева.

### Вариант A (рекомендуемый): новый репозиторий с одним коммитом

```bash
# 1. Проверить, что в рабочем дереве нет секретов и локальных данных
git status --short                       # должно быть пусто
git ls-files | grep -E '\.env$|\.db$|\.log$|\.cursor/'   # должно быть пусто
docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest detect --source /repo --no-git -v

# 2. Экспортировать дерево без истории
git archive --format=tar --prefix=janamen/ HEAD | tar -x -C ../

# 3. Новый репозиторий
cd ../janamen
git init -b main
git add -A
git commit -m "JanaМен — HR-платформа Jana Post (Terricon Valley Hackathon 2026)"
git remote add origin <URL репозитория команды>
git push -u origin main
```

`git archive` берёт только отслеживаемые файлы: `.env`, базы и логи в экспорт не попадут.

### Вариант B: сохранить историю, вычистив файлы

```bash
pip install git-filter-repo
git clone --no-local . ../janamen-clean && cd ../janamen-clean
git filter-repo --invert-paths --path backend/.cursor --path backend/data
git log --all --oneline -- backend/.cursor backend/data   # должно быть пусто
```

Не используйте вариант B на основном клоне: `filter-repo` переписывает историю.

### Атрибуция

Проект основан на WorkHub (MIT, © 2026 Alen983). Файл `LICENSE` сохраняется в новом репозитории, а README содержит ссылку на исходный проект.

## 4. Секреты и конфигурация

- Все ключи (`SECRET_KEY`, `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`) задаются только через `.env` или переменные окружения и не передаются на фронтенд.
- `.env.example` содержит только имена переменных.
- Пароли хранятся как bcrypt-хеши (cost 12).
- Демо-пароль `JanaDemo2026!` — только для синтетических аккаунтов демо-стенда. Переопределяется через `DEMO_PASSWORD`.

## 5. Известные ограничения MVP

- JWT хранится в `localStorage` (риск при XSS). Для продакшена — httpOnly cookie + CSRF-защита.
- Нет rate limiting на `/auth/login`. Для продакшена — лимит на уровне nginx или API-шлюза.
- SQLite без шифрования на диске. Для продакшена — PostgreSQL с шифрованием тома.
