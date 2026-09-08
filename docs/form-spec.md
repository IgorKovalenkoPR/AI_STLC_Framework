# Специфікація форми

Джерело правди для формулювань. Змінили тут — змініть у `apps-script/BuildForm.gs`
і запустіть меню **AI STLC ▸ Rebuild form**. Форму не редагують кліками в UI:
скрипт шукає відповіді за ID елементів, але при ручному додаванні питання ID у
`ITEM_MAP` не потрапляє і відповідь буде проігнорована.

**Назва форми:** `AI Adoption in STLC — Quarterly Project Self-Assessment`
**Мова:** заголовки і варіанти відповідей — англійською (збігаються з таблицею та
фреймворком, і є ключами мапінгу), пояснення під питаннями — українською.
**Налаштування:** збір email — так; редагування відповіді — дозволено; прогрес-бар — так;
обмеження «одна відповідь на людину» — вимкнено (дедуплікацію робить скрипт).

**Обсяг:** 25 елементів, з них 12 обов'язкових. Дві сітки (grid) покривають усі 8 фаз
кожна, тому у сприйнятті тім-ліда це ≈12 питань. Прапорці в `Config.gs`
(`INCLUDE_MEASURED_HOURS_SECTION`, `INCLUDE_EXTRA_METRICS`) скорочують форму до 15 елементів.

---

## Секція 1 — Project context

| # | Заголовок (EN) | Тип | Обов. | Варіанти / валідація |
|---|---|---|---|---|
| Q1 | Project | Dropdown | ✅ | 16 проєктів + `Other — not in the list`. Перехід: `Other` → секція 1b, решта → секція 2 |
| Q2 | Your name and role | Short answer | ✅ | — |
| Q3 | Reporting period | Dropdown | ✅ | `PERIODS` з `Config.gs` |
| Q4 | Testing approach on the project | Multiple choice | ✅ | `Manual only` / `Automated only` / `Mixed (manual + automation)` |
| Q5 | Product type | Checkboxes | ✅ | `Web` / `Mobile` / `Desktop` / `API / backend` / `AI-powered (ML features)` |
| Q6 | Data & privacy constraints (framework section 5, Governance) | Multiple choice | ✅ | `No restrictions — public AI tools allowed` / `Restricted — only approved / enterprise AI tools` / `Prohibited by NDA or client policy` / `Not clarified yet` |

Q4–Q6 не впливають на розрахунок напряму — вони живлять перевірки правдоподібності
(див. `applicabilityWarnings_` у `WriteSheet.gs`).

## Секція 1b — New project details

Показується лише після `Other` у Q1. Після секції — перехід у секцію 2.

| # | Заголовок | Тип | Обов. | Варіанти |
|---|---|---|---|---|
| Q1a | Project name | Short answer | ✅ | — |
| Q1b | Account manager | Multiple choice | ✅ | Yuliia / Veronika / Nora / Other |
| Q1c | Contract model | Multiple choice | ✅ | DT / TM |

## Секція 2 — AI usage per STLC phase ⭐

**Q7. `Do you use AI in this phase — and is it even possible on this project?`**
Multiple choice grid, обов'язкова відповідь у кожному рядку.

Рядки (8): `1. Requirements Analysis`, `2. Test Planning`, `3. Test Design`,
`4. Environment Setup`, `5. Test Execution`, `6. Defect Management`,
`7. Test Closure`, `8. Test Automation`.

Колонки (6):

| Код | Колонка |
|---|---|
| `USED_MEASURED` | `Yes — used & measured` |
| `USED_UNMEASURED` | `Yes — used, not measured` |
| `NOT_YET` | `No — but feasible` |
| `NA_PRODUCT` | `No — product / project specifics` |
| `NA_NDA` | `No — NDA / data privacy` |
| `NA_TOOLING` | `No — no automation / CI-CD / tooling` |

Це питання і є прямою відповіддю на вимогу «врахувати, чи використовують AI на конкретних
фазах і чи це можливо». Опис секції містить витяг з Applicability Matrix (розділ 1.3), щоб
тім-лід не вгадував, що на його типі проєкту застосовне.

## Секція 3 — AI maturity

**Q8. `AI maturity level per phase (0–3)`** — Multiple choice grid, ✅, ті самі 8 рядків.
Колонки: `0 — no AI`, `1 — occasional (tried 1–2 times, no process)`,
`2 — defined process (systematic, shared prompts, results reviewed)`,
`3 — measured & improving (gains measured, quarterly review)`.

Пишеться на аркуш `AI Maturity`; основну таблицю не змінює.

## Секція 4 — Reporting basis

**Q9. `How can you report the impact?`** — Multiple choice, ✅:
- `I have measured numbers (before / after)` → секція 5
- `Estimates only — no tracked baseline` → секція 6

## Секція 5 — Measured data (усі поля опційні)

Одне поле на фазу у форматі `baseline / with AI` — удвічі менше полів, ніж пара
окремих числових питань. Валідація: regex `^\s*\d+([.,]\d+)?\s*[\/;]\s*\d+([.,]\d+)?\s*$`.
Після секції — перехід у секцію 6.

| # | Заголовок | Одиниця | Приклад |
|---|---|---|---|
| Q10 | Phase 1 — Requirements analysis cycle time (hours per epic/feature): baseline / with AI | год | `8 / 5` |
| Q11 | Phase 2 — Test planning effort (hours per test plan): baseline / with AI | год | `16 / 12` |
| Q12 | Phase 3 — Test case authoring (hours per 10 test cases): baseline / with AI | год | `5 / 3.5` |
| Q13 | Phase 4 — Environment provisioning (hours per environment): baseline / with AI | год | `6 / 4` |
| Q14 | Phase 5 — Execution speed (test cases per hour): baseline / with AI | TC/год | `6 / 7.5` |
| Q15 | Phase 6 — Defect triage (minutes per defect): baseline / with AI | хв | `20 / 13` |
| Q16 | Phase 7 — Test summary report (hours per report): baseline / with AI | год | `4 / 2.5` |
| Q17 | Phase 8 — Automation script authoring (hours per 10 scripts): baseline / with AI | год | `20 / 14` |

Підказка Q14 окремо наголошує, що там більше = краще.

## Секція 6 — Self-assessed impact

**Q18. `Estimated improvement vs your pre-AI baseline`** — Multiple choice grid, ✅,
ті самі 8 рядків. Колонки і середини діапазонів, які бере скрипт:

| Колонка | Midpoint |
|---|---|
| `No change (0%)` | 0.00 |
| `Up to 10%` | 0.05 |
| `10–20%` | 0.15 |
| `20–30%` | 0.25 |
| `30–40%` | 0.35 |
| `Over 40%` | 0.45 |
| `Not applicable` | — |

Діапазони навмисно збігаються з цільовими коридорами фреймворку, тож самооцінка одразу
лягає на шкалу Target.

## Секція 7 — Tools, quality signals & feedback

| # | Заголовок | Тип | Обов. |
|---|---|---|---|
| Q19 | Which AI tool categories did you actually use this period? | Checkboxes + Other | ✅ |
| Q20 | AI-generated test case acceptance rate, % | Short answer, 0–100 | ⬜ |
| Q21 | AI hallucination / rework rate on AI outputs, % | Short answer, 0–100 | ⬜ |
| Q22 | Automation coverage, % | Short answer, 0–100 | ⬜ |
| Q23 | Confidence in the figures you reported | Multiple choice | ✅ |
| Q24 | Main blockers to AI adoption and what support you need | Paragraph | ⬜ |
| Q25 | Best AI win this period (1–2 sentences) | Paragraph | ⬜ |

Q19 — категорії з розділу 1.2 фреймворку. Q20–Q22 — метрики з розділів 2.3, 2.6, 2.8.
Q23 (`High — tracked in Jira / timesheets` / `Medium — partially tracked` /
`Low — expert judgement`) записується в примітку до кожної заповненої комірки —
це головний захист від того, щоб оцінка читалась як точний замір.
