# AI STLC Framework — збір метрик використання AI

Google Form + Google Apps Script, які допомагають QA тім-лідам оцінити використання AI
на кожній із 8 фаз STLC і автоматично заповнюють колонки **`Actual, %`** у зведеній
таблиці *AI QA Optimization — Target vs Actual*.

## Що це вирішує

| Проблема | Рішення |
|---|---|
| Проєкти різні — на частині з них AI на певних фазах не використовується або взагалі неможливий | У формі кожна фаза має 6 градацій відповіді, включно з причинами неможливості (специфіка продукту, NDA, відсутність автоматизації/CI-CD). Причина так і потрапляє в `Actual, %` текстом |
| Тім-ліди не знають, як «виміряти» використання AI | Форма питає години «до / з AI» у зрозумілих одиницях; формули з фреймворку рахує скрипт. Немає замірів — є фолбек на оцінку діапазоном |
| Заповнення таблиці вручну по 16 проєктах × 8 фаз | `onFormSubmit` знаходить рядок за назвою проєкту і пише всі 8 значень із приміткою-аудитом |

## Структура репозиторію

```
apps-script/     Google Apps Script — код, який виконується у script.google.com
  Config.gs        єдине джерело правди: фази, проєкти, колонки, словник міток
  BuildForm.gs     програмна побудова форми (секції, питання, валідації, переходи)
  Parse.gs         відповідь форми → канонічний об'єкт
  Compute.gs       розрахунок Actual, % (формули і знаки з фреймворку)
  WriteSheet.gs    пошук рядка, запис комірок, примітки, новий проєкт, лог
  Maturity.gs      AI Maturity Model (0–3 на фазу) на окремий аркуш
  Formatting.gs    умовне форматування колонок Actual
  Triggers.gs      setup(), onFormSubmit, нагадування
  Recompute.gs     повний перерахунок, coverage-звіт, знімок періоду
  Menu.gs          меню «AI STLC» у таблиці
  Test.gs          20 тест-кейсів розрахункового шару
docs/            документація (українською)
data/            довідники: проєкти, фази, словник міток (seed для Config.gs)
templates/       вихідні файли-джерела (xlsx і docx), без змін
tools/           запуск тестів під Node
```

## Швидкий старт

1. Прочитати **[docs/deployment.md](docs/deployment.md)** — 6 кроків, ~15 хвилин.
2. Роздати тім-лідам **[docs/faq-teamleads.md](docs/faq-teamleads.md)** — одна сторінка, як заповнити форму.
3. Наприкінці періоду: меню **AI STLC ▸ Snapshot current period**, далі `Файл → Завантажити → .xlsx`.

## Документація

| Файл | Про що |
|---|---|
| [docs/deployment.md](docs/deployment.md) | Розгортання: конвертація xlsx, копіювання скриптів, `setup()`, перевірка |
| [docs/form-spec.md](docs/form-spec.md) | Повний текст усіх питань — джерело правди для формулювань |
| [docs/mapping-spec.md](docs/mapping-spec.md) | Мапінг «відповідь → комірка», словник міток, кольори |
| [docs/calculation-rules.md](docs/calculation-rules.md) | Формули, знаки, пріоритет джерел, крайні випадки |
| [docs/faq-teamleads.md](docs/faq-teamleads.md) | Одна сторінка для тім-лідів |
| [docs/operations.md](docs/operations.md) | Дублікати, нові проєкти, зміна періоду, траблшутинг |

## Тести

```bash
node tools/run-tests.js     # 20 кейсів розрахункового шару, без Google-акаунта
```
Ті самі тести доступні у таблиці: меню **AI STLC ▸ Run self-test**.

## Джерела

- `templates/AI_Testing_Framework_for_STLC.docx` — AI Testing Framework for STLC, v1.2 (23.04.26)
- `templates/AI_QA_Optimization_Target_vs_Actual.xlsx` — цільова таблиця (16 проєктів × 8 фаз)
