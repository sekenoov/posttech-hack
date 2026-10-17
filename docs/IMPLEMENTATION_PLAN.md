# JanaМен — план реализации

> **Статус на 2026-10-17: Phase 0–5 выполнены.** 81 API-тест и 12 e2e-сценариев проходят на чистом `docker compose up --build`. Соответствие требованиям — [COMPLIANCE.md](COMPLIANCE.md). Ниже — исходный план с отметками; отклонения от него перечислены в конце.

Приоритеты выставлены по весам жюри: сквозной сценарий 30%, UX 20%, архитектура 20%, AI 15%, Academy 10%, презентация 5%. Правило: каждая фаза заканчивается зелёными тестами и рабочим `docker compose up --build`.

Легенда: **P0** — без этого сценарий S1–S6 не работает; **P1** — заметно повышает оценку; **P2** — если останется время.

## Phase 0 — Аудит ✅

- [x] Аудит кода, запуск baseline, smoke-тест API
- [x] REQUIREMENTS, ARCHITECTURE, IMPLEMENTATION_PLAN, ACCEPTANCE_TESTS, JANA_BRAND_RESEARCH

## Phase 1 — Core HR (P0) ✅

1. **Гигиена репозитория:** `git rm --cached` для `backend/data/*.db` и `backend/.cursor/debug.log`; удалить debug-логгер из `auth.py`; убрать `../.cursor` и `--reload` из compose; корневой `.env.example`.
2. **Безопасность:** закрыть `/auth/register`; обязательный `SECRET_KEY`; `permissions.py` со scope-проверками; ограничить `PATCH /me` личными полями.
3. **Модель данных:** `Department`, `EmployeeProfile`, расширение `LeaveRequest`, `LeaveRequestHistory`, `Notification`.
4. **Workflow отпуска:** удалить автосогласование; `leave_service` с правилами (раздел 5 ARCHITECTURE); эндпоинты:
   - `GET/POST /requests`, `GET /requests/{id}` (с историей), `POST /requests/{id}/cancel`
   - `GET /team/requests`, `POST /team/requests/{id}/decision` `{decision, comment}`
   - `GET /team/members` — командная проекция без лишних ПДн
5. **Уведомления (backend):** `notification_service.notify()`, `GET /notifications`, `POST /notifications/{id}/read`, `POST /notifications/read-all`.
6. **Seed:** синтетическая структура Jana Post (6 подразделений, 8–10 сотрудников, 2 руководителя, HR), заявки во всех статусах.
7. **Тесты:** pytest — матрица доступа, workflow, IDOR.
8. **Удаление out-of-scope модулей** (после согласования): Payroll, Attendance, Wellness, Career, Complaints, Compliance, AI recommendations, Landing — из роутинга, навигации и `main.py`.

Уже в этой фазе фронтенд-экраны заявок строятся на новом `AppLayout` и design tokens (Phase 4 — только полировка).

## Phase 2 — Jana Academy (P0) ✅

1. Модели `Course`, `CourseLesson`, `QuizQuestion`, `CourseAssignment`, `LearningProgress`. Старые `LearningContent` и `UserLearningProgress` удаляются.
2. API: `GET /academy/courses`, `GET /academy/courses/{id}` (уроки без ответов quiz), `POST /academy/courses/{id}/lessons/{n}/complete`, `POST /academy/courses/{id}/quiz` → балл на сервере; `POST /admin/academy/assignments` (HR).
3. Уведомления «курс назначен» и «курс завершён» (сотруднику и назначившему HR).
4. Контент: «Welcome to Jana Post» и «Основы информационной безопасности», по 3–4 урока и 5 вопросов, с пометкой «демонстрационный материал».
5. UI: каталог, страница курса с прогресс-баром, плеер уроков, quiz с результатом; блок обучения в профиле и на дашборде.
6. Тесты: назначение только HR, нельзя пройти чужое назначение, балл считается сервером, прогресс сохраняется.

## Phase 3 — AI Jana (P0) ✅

1. 5 документов в `knowledge_base/` с front-matter (`id`, `title`, `version`, `effective_date`, `disclaimer`).
2. Модуль `ai/` (раздел 6 ARCHITECTURE): разбиение на фрагменты по заголовкам, TF-IDF retriever, порог, guard, LLM-адаптеры, экстрактивный fallback.
3. API `POST /ai/ask` `{question, history?}` → `{answer, sources, grounded, mode}`; `POST /ai/escalate` создаёт обращение в HR и уведомление.
4. HR: просмотр базы знаний (`GET /admin/kb`), правка версии документа в UI — P1.
5. UI: страница `/assistant` и плавающая кнопка; карточки источников с переходом к фрагменту документа; кнопка «Обратиться в HR».
6. Evaluation (`tests/test_ai_eval.py`): вопрос из базы → `grounded=true` и источник; вопрос вне базы → refusal; пустой/мусорный ввод; «покажи зарплату Иванова» → отказ; LLM недоступен → экстрактивный режим; в каждом grounded-ответе есть ≥1 источник.

## Phase 4 — Brand & UX (P1) ✅

1. `theme/tokens.js` → MUI theme + CSS-переменные; логотип; favicon; заголовки страниц.
2. `AppLayout` для всех ролей; дашборды трёх ролей; состояния loading/empty/error/403/404.
3. i18n: вынести строки в `ru.json`; `kk.json` для навигации и ключевых экранов (P2 — полностью).
4. Центр уведомлений: колокольчик с бейджем, страница, deep-links.
5. Mock-адаптеры 1С:ЗУП и Documentolog + журнал интеграций в админке HR.
6. Адаптивность: проверка на 375 px и 1440 px.

## Phase 5 — Testing & Delivery (P0) ✅

1. Прогон ACCEPTANCE_TESTS вручную и e2e-скриптом против поднятого compose (API-уровень).
2. Проверка «с нуля»: `docker compose down -v && docker compose up --build`.
3. README (запуск, аккаунты, сценарии, тесты, что реализовано / смоделировано / в развитии), `docs/INTEGRATIONS.md`, матрица соответствия, `docs/DEMO_SCRIPT.md`.
4. Финальный аудит требований по REQUIREMENTS.md.

## Отклонения от исходного плана

| План | Факт | Почему |
|---|---|---|
| `LearningProgress` отдельной таблицей | Прогресс хранится в `CourseAssignment` | Одна запись «назначение + прогресс» проще и без потерь для MVP |
| `KnowledgeDocument` из файлов | Документы в БД, засеваются из `knowledge_base/*.md` | Нужна правка HR в интерфейсе с версионированием |
| Retrieval на scikit-learn | Собственный TF-IDF без зависимостей + проверка покрытия слов | Меньше образ; покрытие отсекает ложные совпадения («курс доллара» ≠ «курс обучения») |
| LLM: Anthropic | OpenRouter — основной, Anthropic — дополнительный, режим без LLM | Решение команды после Phase 0 |
| Схема `models/` пакетом | Один `models.py` | ≈15 моделей — пакет не нужен |
| FastAPI 0.104 | 0.115 | SDK `anthropic` требует anyio ≥ 4 |

## Решения, согласованные после Phase 0

| # | Вопрос | Рекомендация |
|---|---|---|
| 1 | Удалить out-of-scope модули (Payroll, Attendance, Wellness, Career, Complaints, Compliance, AI recommendations, Landing) | Удалить из кода отдельным коммитом; история остаётся в git |
| 2 | LLM-провайдер для AI Jana | Anthropic Claude через env; без ключа — экстрактивный режим, демо работает офлайн |
| 3 | Схема БД | Пересоздать демо-БД с нуля (данные синтетические), без миграции старых таблиц |
| 4 | Порт фронтенда | `FRONTEND_PORT` в `.env`, по умолчанию 3000 |

## Риски

| Риск | Митигация |
|---|---|
| Ключ LLM недоступен на защите / нет сети | Экстрактивный режим — полноценный путь, покрыт тестами |
| Регрессии при удалении модулей | Удаление одним коммитом + полный прогон тестов |
| Нехватка времени на KZ-локализацию | Архитектура i18n с первого дня, KZ — только для готовых экранов |
