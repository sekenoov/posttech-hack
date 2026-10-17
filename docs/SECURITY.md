# JanaМен — безопасность

## 1. Закрытые уязвимости (Phase 1A)

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

## 3. Чистый репозиторий

Отладочный лог (`backend/.cursor/debug.log`) и локальная SQLite-база (`backend/data/employee_portal.db`) не попали в git ни в одном коммите.

Проверка перед сдачей (все команды должны вернуть пустой результат):

```bash
git status --short
git log --all --name-only --pretty=format: | grep -E '\.env$|\.db$|\.log$|\.cursor/'
git log --all -p | grep -E 'sk-(or|ant)-[A-Za-z0-9_-]{20}|_API_KEY=[A-Za-z0-9]'
```

Дополнительно можно прогнать сканер секретов:

```bash
docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest detect --source /repo -v
```

`.env` с ключами существует только локально и исключён в `.gitignore`.

## 4. Секреты и конфигурация

- Все ключи (`SECRET_KEY`, `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`) задаются только через `.env` или переменные окружения и не передаются на фронтенд.
- `.env.example` содержит только имена переменных.
- Пароли хранятся как bcrypt-хеши (cost 12).
- Демо-пароль `JanaDemo2026!` — только для синтетических аккаунтов демо-стенда. Переопределяется через `DEMO_PASSWORD`.

## 5. Известные ограничения MVP

- JWT хранится в `localStorage` (риск при XSS). Для продакшена — httpOnly cookie + CSRF-защита.
- Нет rate limiting на `/auth/login`. Для продакшена — лимит на уровне nginx или API-шлюза.
- SQLite без шифрования на диске. Для продакшена — PostgreSQL с шифрованием тома.
