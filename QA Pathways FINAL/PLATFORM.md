# Learning Platform — Specification (v2)

Any learning path, built once, plugs into any host app. Every path looks and behaves the same to the learner, whatever it needs internally.

This file is the contract for **learning-path packages**, **host apps** and **plugins**. `APP_STRUCTURE.md` describes how the existing apps were built. `DESIGN_GUIDE.md` defines the look. This file defines what every path and every host must do so they fit together.

> **What changed from v1.** v1 assumed one shell that every course lives in. v2 adds two study modes, step by step or assess first (§5.1), and makes the course a **portable package** and the app a **host**. CTFL Prep is the default base host; the Learning Paths app (Postman + Playwright) is a second host. Either can be the base and load the other's paths (§3). Plugins are now framework-free (§14) so they run in both hosts. Course ids are fixed to the ids already in use: `ctfl`, `pw`, `api` (§20). The original v1 file stays unchanged as `../PLATFORM.md`; this v2 file lives in `Learning Platform/`.

---

## 0. Content and apps are separate

The learning content is never written inside an app. It lives in its own folder, in plain Markdown and JSON, in one standard format. Any app that follows this contract can host it, so content moves between apps by copying one file, without reading or changing any app code.

```
AUTHOR                         BUILD                          HOST
courses/<id>/  (source)  ──►  validate.py + build_package.py  ──►  <id>.lpp.js  ──►  any conforming app
lessons/*.md                    checks every rule in this file       one file         (courses folder,
questions/*.json                                                                       built in, or imported)
exams/*.json · cheatsheets/*.md · activities/*/activity.json · course.json · syllabus.json
```

| What | Where | Format |
|---|---|---|
| Path identity, colour, plugins, exam numbers | `course.json` | §8 |
| Modules, sections, topics, objectives, minutes | `syllabus.json` | §9 |
| Lessons (Explanation · Example · Watch out · Demo) | `lessons/<topic>.md` | §7 |
| Check and bank questions (incl. select-two) | `questions/check.json`, `bank.json` | §10 |
| Mock blueprints and fixed mocks | `exams/blueprints.json`, `fixed.json` | §11 |
| Cheat sheets | `cheatsheets/<module>.md` | §12 |
| Labs and demos | `activities/<id>/activity.json` (+ plugin code in `plugins/` when the path brings its own) | §13, §14 |
| Writing rules | `briefs/` | §25 |
| Official material (syllabus PDF, official sample exams) | never in the package: the learner's own `istqb` folder | §1 rule 9 |

Rules:
- **The `courses/<id>/` folder is the source of truth.** To change content, edit it there, validate, build. Never edit content inside an app, and never edit a built `.lpp.js`.
- **An app holds no content.** It holds screens, progress and plugins only. Replacing or upgrading an app never touches content; replacing content never touches an app.
- **Moving content to another app** = giving that app the `.lpp.js`. If the other app meets the host contract (§17), nothing else is needed. If it does not yet, the work is in the app (one adapter, §17.2), never in the content.
- **Starting a new path** = copy `course-template/`, follow §25.
- Every decision about how content is authored is recorded here; the reasons behind it are in `CONTEXT.md`.

---

## 1. Principles

1. **A learning path is a package.** A path is a folder of content plus a manifest, built into one file. It never ships its own app.
2. **A host is interchangeable.** Any app that meets the host contract (§17) can load any package that meets the package contract. A path does not know or care which host runs it.
3. **Attach in either direction.** CTFL Prep can be the base and load Postman and Playwright, or Learning Paths can be the base and load CTFL. Attaching a path never requires changing host code.
4. **Capabilities are plugins.** Anything only some paths need (animated demos, a code runner, an API workbench, a PDF viewer, live exam dates) is a plugin the path switches on in its manifest.
5. **Same structure, same lifecycle.** Every path has the same hierarchy (§4), every topic goes through the same steps (§5), every lesson has the same parts in the same order (§7).
6. **Graceful degradation.** If a host or delivery target cannot provide a capability, the feature hides itself. Nothing else changes, and nothing broken is shown.
7. **The learning design applies to every path.** `APP_STRUCTURE.md` §7.2 (rules 1–10) and §11 (rules 11–14) are part of this contract.
8. **No path-specific code in a host.** A host never branches on a course id or a lab kind. Differences come from the manifest and plugins only.
9. **Own content only.** Lessons, questions, mocks, labs and cheat sheets in a package are written by us: researched from the official syllabus and other sources, close enough to the real exam to prepare a learner to pass it, but never copied. This keeps the paths sellable and free of copyright claims. Official material (syllabus PDF, official sample exams) is never put in a package or a build; the learner adds their own copy in the `istqb` folder and the host uses it when present (§14.3).

---

## 2. Vocabulary

| Term | Meaning |
|---|---|
| **Package** | One learning path: content + manifest, built into `<id>.lpp.js` (§16). Also called a path or course |
| **Host** | An app that loads packages and provides screens, progress and plugins (§17). Today: CTFL Prep and Learning Paths |
| **Base host** | The host a learner installs and opens. Other paths are attached to it |
| **Attach** | Add a package to a host without changing host code (§24) |
| **Adapter** | The one function inside a host that turns the package format into the host's internal shape (§17.2) |
| **Contract version** | The version of this file a package or host was built against (`"2.0"`) |
| **Module** | Top-level grouping in a path (a CTFL chapter, a Playwright module) |
| **Section** | Optional grouping inside a module (CTFL uses them; Playwright and Postman do not) |
| **Topic** | The unit of learning: one objective, one lesson, three check questions, optional activities |
| **Lesson** | The short explanation for a topic |
| **Check** | The "Check yourself" carousel for a topic |
| **Question** | A four-option multiple-choice item, used in checks, practice and exams |
| **Activity** | A hands-on item from a plugin: a **demo** (watch or manipulate, not graded) or a **lab** (do it, graded by checks) |
| **Variant** | A parallel form of the same content the learner chooses (JavaScript / Python). Most paths have none |
| **Exam** | A timed or practice test built from a blueprint |
| **Cheat sheet** | Must-know notes per module |

Learner-facing labels are fixed across paths and hosts: **Module, Topic, Lesson, Check yourself, Hands-on, Cheat sheets, Mock tests, Progress**. A path may rename Module (e.g. "Chapter") in its manifest. Nothing else is renamed.

---

## 3. Architecture

```
          ┌──────────────── package contract (§6–§16) ────────────────┐
          │                                                            │
  ctfl.lpp.js      pw.lpp.js       api.lpp.js       <new>.lpp.js
  (CTFL)           (Playwright)    (Postman)        (any new path)
          │              │              │                 │
          └──────────────┴──── LP.register() ─────────────┘
                                   │
          ┌────────────── host contract (§17–§21) ───────────────┐
          │                                                       │
   CTFL Prep host                              Learning Paths host
   React + TS · exe + PWA                      vanilla JS · single HTML
   (default base)                              (alternative base)
          │                                                       │
          └──── plugins (§14): demos · labs-web · labs-api · pdf-viewer · exam-dates
```

| Host | Tech | Delivery | Plugins it provides | Role |
|---|---|---|---|---|
| **CTFL Prep** | Vite + React 19 + TypeScript | Windows exe (Go launcher, `127.0.0.1:47321`) + PWA | All, including `pdf-viewer` and `exam-dates` | Default base host |
| **Learning Paths** | Vanilla JS, one HTML file | Single HTML / claude.ai artifact | `demos`, `labs-web`, `labs-api` (no local files or server proxy) | Alternative base; portable sharing |

Both directions are supported:

| Base | Attached | Result |
|---|---|---|
| CTFL Prep | `pw.lpp.js`, `api.lpp.js` | One exe/PWA with CTFL, Playwright and Postman |
| Learning Paths | `ctfl.lpp.js` | One HTML file with Postman, Playwright and CTFL. CTFL's PDF viewer and exam-dates card hide themselves (§14.3) |

---

## 4. Course hierarchy (fixed)

```
Package
└── Module (1..n)                 id: "1", "2", …
    ├── Section (0..n, optional)  id: "2.1"
    │   └── Topic (1..n)          code: "2.1.1"
    └── Topic (1..n)              code: "2.1"  (when the module has no sections)
         ├── Lesson               exactly 1
         ├── Check questions      exactly 3 (kind "check")
         ├── Bank questions       0..n (kind "bank")
         └── Activities           0..n (demo / lab)
```

Rules:
- A module contains **either** sections **or** topics directly, not a mix.
- Topic codes are dotted strings, unique within the package, and sort in study order.
- Every topic has exactly one objective, one lesson, minutes, and three check questions. No exceptions.

---

## 5. Topic lifecycle (identical in every path and host)

```
Not started → Lesson read → Understood → Check yourself (carousel) → Passed
                                 │                                     │
                                 └── Activities (optional, any time) ──┘
```

| Step | Behaviour |
|---|---|
| Lesson | Shown in full. Inline activities (demos) appear at their declared position |
| Understood | Learner selects "I've understood this — check myself". Lesson collapses to an "understood" bar with Show lesson |
| Check yourself | One question per screen; progress dashes; Check answer → feedback with rationale for every option → Next question |
| Wrong answer | A new question on the same topic is appended (bank first, least recently seen). The same question is not repeated while alternatives exist |
| Passed | Every question in the chain answered correctly. Lesson expands again; Give me more practice / Retake check appear |
| Tested out | Set by the placement test or cleared by a mock (§5.1). Counts as passed; the lesson and check stay available |
| Activities | Never block passing. A topic with a lab shows a lab card under the check. Lab status is tracked separately ("Labs x/y") |

### 5.1 Two ways to study (every path, chosen by the learner)

| Mode | Flow | For |
|---|---|---|
| **Learn step by step** | Topics in study order: lesson → check → passed; mocks when ready | New to the subject |
| **Assess first** | Placement test → study plan → only the topics that need work → mocks | Already knows part of it; wants to save time |

The learner picks a mode on a path's first open and can switch any time; switching never loses progress. Both modes use the same lessons, checks, mocks and metrics.

**Placement test (whole-path diagnostic)**
- One assessment for the **whole path**, never per chapter or topic: each topic already ends in Check yourself (and a lab where it has one), so a chapter-level test would repeat them. The placement test's job is to place the learner across the whole syllabus in one go.
- Covers every topic not yet passed, in mixed order (interleaved across chapters, like a mock).
- Built by the host from **bank** questions only (check questions stay unseen for Check yourself).
- **Adaptive, 1–2 questions per topic:** one question first; a second question (different `concept` where possible) only if the first was right, to confirm. A wrong first answer settles the topic as Learn without a second question.
- Practice-style screen with no timer and no feedback until the end. **Not sure** is an answer and counts as wrong, so guessing does not hide gaps. Can be paused and resumed; progress is saved after every answer.
- Labs are not part of the placement test. A tested-out topic's lab stays available and still counts toward "Labs x/y".
- Per-topic result:

| Answers | Topic status | Effect |
|---|---|---|
| ✓ ✓ | **Tested out** | Counts as passed. Lesson stays available; nothing required |
| ✓ ✗ | **Review** | Lesson collapsed to the "understood" bar; learner goes straight to Check yourself |
| ✗ | **Learn** | Full lifecycle (§5) |

- The placement test can be retaken from the study plan; a retake covers only the topics still in Learn or Review.

**Study plan**
- Ordered list: Learn topics, then Review topics, each in syllabus order; Tested-out topics listed last, collapsed. Shows minutes needed vs minutes saved (from topic `minutes`).
- Every mock result (practice or exam mode) updates the plan: a Tested-out or passed topic answered wrong in a mock moves back to **Review** and its questions join Weak areas. A topic leaves the plan when it is passed or tested out again.
- The plan is the default Learn view in Assess-first mode; the syllabus tree stays one click away.

**Honest metrics (design rule 6)**
- Coverage counts passed and tested-out topics; the bar shows tested-out in a lighter shade and the number below splits them ("14 passed · 9 tested out").
- Readiness comes only from exam-mode mocks, never from the placement test.

---

## 6. Package source layout (same shape for every path)

```
courses/<id>/
├── course.json                 manifest (§8)
├── syllabus.json               modules → sections → topics (§9)
├── lessons/<topic>.md          one per topic (§7)
├── questions/
│   ├── check.json              exactly 3 per topic
│   └── bank.json               extra per topic
├── exams/
│   ├── blueprints.json         exam patterns (§11)
│   └── fixed.json              optional fixed mocks
├── cheatsheets/<module>.md     one per module (§12)
├── activities/                 only if the path uses activity plugins
│   └── <activity-id>/
│       ├── activity.json       common envelope (§13)
│       └── …                   plugin files (starters, solutions, workspace)
├── assets/                     images used by lessons (optional; embedded at build)
├── briefs/                     LESSON_BRIEF.md, QUESTION_BRIEF.md, ACTIVITY_BRIEF.md
└── dist/                       build output — <id>.lpp.js and <id>.lpp.json (§16)
```

Platform-level folders (shared by every path):

```
platform/
├── PLATFORM.md  APP_STRUCTURE.md  DESIGN_GUIDE.md
├── courses/<id>/               one folder per path (above)
├── plugins/<plugin-id>/        plugin.js + PLUGIN.md (§14)
├── hosts/
│   ├── ctfl-prep/              React host, Go launcher, PWA
│   └── learning-paths/         single-HTML host
├── course-template/            starter for a new path (copy, rename, fill)
└── scripts/
    ├── validate.py             package rules (§22)
    └── build_package.py        courses/<id>/ → dist/<id>.lpp.js + .lpp.json
```

---

## 7. Lesson format (fixed)

File: `lessons/<topic-code>.md`

````markdown
---
topic: "2.1"
title: "Role-based locators"
objective: "Locate elements by ARIA role and accessible name with getByRole."
level: "Understand"            # from manifest levels.question
minutes: 12
activities: ["role-login"]     # optional; ids from activities/
---

## Explanation
80–300 words. One idea. Plain language, precise domain terms.

## Example
One worked example. If the path has variants, one fenced block per variant:

```js
await page.getByRole('button', { name: 'Log in' }).click();
```

```py
page.get_by_role("button", name="Log in").click()
```

## Watch out
One exam trick, common mistake or misconception: one or two sentences, or the three-part form **Rule.** … **Trap.** … **Check.** … used by CTFL.

## Demo
::activity{id="ep-partitions"}
````

Rules:
- Sections in this order. **Explanation**, **Example** and **Watch out** are required. **Demo** is optional and only holds `::activity{id="…"}` lines for inline activities.
- Exactly one example. With variants, one fenced block per variant, tagged with the variant id.
- Headings inside Explanation use `###`. No other `##` sections; extra material goes in the cheat sheet or an activity.
- Front matter `topic`, `title`, `objective`, `minutes` match `syllabus.json`.

---

## 8. Manifest — `course.json`

```json
{
  "id": "pw",
  "contract": "2.0",
  "version": "1.0.0",
  "title": "Playwright Path",
  "tag": "Playwright",
  "subtitle": "End-to-end testing in JavaScript and Python",
  "blurb": "End-to-end testing with Playwright in JavaScript and Python, from first test to CI.",
  "language": "en",
  "labels": { "module": "Module" },
  "levels": {
    "difficulty": ["Beginner", "Intermediate", "Advanced"],
    "question": ["Remember", "Understand", "Apply"]
  },
  "variants": [
    { "id": "js", "label": "JavaScript" },
    { "id": "py", "label": "Python" }
  ],
  "plugins": [{ "id": "labs-web", "version": "^1.0" }],
  "extensions": [],
  "exam": { "passMark": 65, "main": ["full", "quick"] },
  "readiness": { "window": 3, "bands": { "ready": 80, "nearly": 65 } },
  "status": { "window": 6, "bands": { "strong": 85, "good": 70, "average": 50 } },
  "weakAreas": { "retireAfter": 2, "unit": "sessions" },
  "theme": { "accent": "#007A87" },
  "legacy": [{ "key": "pwpath-v1", "format": "pwpath-v1" }]
}
```

CTFL differs only in values:

```json
{
  "id": "ctfl", "contract": "2.0", "version": "4.0.1",
  "title": "CTFL Prep", "tag": "ISTQB CTFL v4.0",
  "labels": { "module": "Chapter" },
  "levels": { "difficulty": [], "question": ["K1", "K2", "K3"] },
  "variants": [],
  "plugins": [{ "id": "demos", "version": "^1.0" }],
  "extensions": [{ "id": "pdf-viewer", "optional": true }, { "id": "exam-dates", "optional": true }],
  "exam": { "passMark": 65, "main": ["official-1", "official-2", "official-3", "official-4"] },
  "legacy": [{ "key": "ctfl-personal-v1", "format": "ctfl-personal-v1" },
             { "key": "ctfl-simple-v1",   "format": "ctfl-personal-v1" }]
}
```

| Field | Required | Purpose |
|---|---|---|
| `id` | yes | Permanent. Lowercase `[a-z0-9-]`, 2–16 chars. Used in routes, storage and question ids. Never renamed (§20) |
| `contract` | yes | Contract version this package follows. A host loads packages with the same major version |
| `version` | yes | Content version (semver). Bump on any content change (§21) |
| `title`, `tag`, `blurb` | yes | Course picker card and header |
| `labels.module` | no | Display name for Module (default "Module") |
| `levels.question` | yes | Scale for question levels and blueprint slots |
| `levels.difficulty` | no | Badges on modules |
| `variants` | no | Empty = no variant toggle |
| `plugins` | no | Activity plugins with a semver range. **Required** plugins: the package will not load if the host cannot provide them |
| `extensions` | no | Path-level widgets. Mark `"optional": true` so the path still loads where the extension is unavailable |
| `exam`, `readiness`, `status`, `weakAreas` | yes | Numbers for the shared formulas (§19). Formulas are fixed |
| `theme.accent` | yes | The path's base colour (§15). The only visual a path may change |
| `short` | no | Short name for the switcher, chips and phone screens (e.g. "CTFL") |
| `lessonRules` | no | `"relaxed"` for content imported from an older app: lesson-shape and question-quality findings become warnings instead of errors. New paths leave it out |
| `legacy` | no | Old storage keys this path used, so any host can migrate them (§20.1) |

---

## 9. Syllabus — `syllabus.json`

```json
{
  "modules": [
    {
      "id": "2",
      "title": "Locators",
      "difficulty": "Beginner",
      "blurb": "Finding elements the way users do.",
      "sections": [],
      "topics": [
        { "code": "2.1", "title": "Role-based locators",
          "objective": "Locate elements by ARIA role and accessible name with getByRole.",
          "level": "Understand", "minutes": 12,
          "refs": [{ "label": "Playwright docs: Locators", "url": "https://playwright.dev/docs/locators" }] }
      ]
    }
  ]
}
```

`refs` is optional and generic. CTFL uses `{"label": "Syllabus p. 25–26", "pdfPage": 25, "pdfPageTo": 26}`. With `pdf-viewer` the host opens a side panel showing only those pages of the learner's own official PDF; without it the reference is not shown.

---

## 10. Questions — one schema for every path

```json
{
  "id": "2.1-a",
  "topic": "2.1",
  "kind": "check",
  "level": "Understand",
  "concept": "role-first-locator",
  "variant": null,
  "stem": "Which locator does Playwright recommend trying first?",
  "options": ["locator() with CSS", "getByTestId()", "getByRole()", "XPath expressions"],
  "answer": 2,
  "rationale": [
    "CSS ties tests to markup structure.",
    "Test ids are a fallback when no user-facing option fits.",
    "Role plus accessible name reflects what users perceive.",
    "XPath is the least preferred option."
  ]
}
```

| Field | Rule |
|---|---|
| `id` | Unique within the package, stable forever. Hosts prefix it as `<course>:<id>` |
| `kind` | `check` (exactly 3 per topic) or `bank` |
| `options` | Exactly 4, `answer` the 0-based index. **Select-two** questions (CTFL style): 5 options and `answer` a list of 2 indexes |
| `rationale` | One per option. Never starts with "Correct" or "Incorrect" (the UI says that). The correct option's rationale may be empty when the stem already explains it |
| `concept` | Used by the randomiser so one exam never has two questions on the same idea |
| `level` | A value from `levels.question` |
| `variant` | `null` for most. Set when the question only makes sense in one variant; hosts skip it for learners on another |
| Stems and options | Inline Markdown only (code, bold) |

Packages are balanced when authored (§22); hosts show options in the stored order and never reshuffle them.

---

### 10.1 Question and task text layout (design rule for every question and lab)

Applies to Check yourself, practice, mock tests, exams, the placement test, review, official sample exams, and lab/activity briefs, tasks and hints, in every path and host.

- **One item per line.** Any enumeration (`i.`/`ii.`, `1.`/`2.`, `A.`/`B.`, `a)`, `-` bullets) puts each item on its own line. Never run items together in a sentence ("i. x ii. y …").
- **Paragraphs by blank lines.** Lead-in, each list, each table and the actual question are separate paragraphs; the question sentence comes last, in its own paragraph.
- **Matching / pairing questions** show the two lists as two separate lists (e.g. `1.–4.` then `A.–D.`), each introduced by its own line; options then read `1A, 2C, …`.
- **Sub-steps** inside a list item go on their own indented lines (two spaces), e.g. the steps of a defect report.
- **Tables** use Markdown pipe rows and render as a table.
- Hosts render this one way (bold lead-in and question, lists with a hanging marker on a light path-coloured band, tables with borders). Text that arrives flat from outside (e.g. official sample files) is split into the same shape by the host.
- `validate.py` rejects a question stem, brief, task or hint that carries two or more list markers on one line.

Example stem:
```
Consider the following factors:

i. The skills and availability of team members
ii. The time and budget available to the project

Which of these are context factors that significantly influence the test process?
```

### 10.2 Write-a-query questions (`format: "query"`)

For database paths a bank question may ask the learner to write a query instead of choosing an option:

```json
{ "id": "4.3-q1", "topic": "4.3", "kind": "bank", "level": "Apply", "concept": "4.3-q1", "variant": null,
  "format": "query", "engine": "sql", "dataset": "clinic",
  "stem": "Return the second highest doctor fee as second_fee …",
  "solution": "SELECT MAX(fee) AS second_fee FROM doctors WHERE fee < (SELECT MAX(fee) FROM doctors);",
  "starter": "", "order": false, "columns": "count",
  "rationale": ["Take the maximum of the fees below the maximum; ties at the top count once."] }
```

- `engine`: `sql` (relational, MySQL-style) or `mongo` (MongoDB shell syntax). `dataset` names a dataset shipped by a package plugin (§13.5).
- Marking: the learner's query and the `solution` run on fresh copies of the data; the **last result set** must have the same number of columns (`columns: "names"` also compares names) and the same rows (`order: true` also compares order). Numbers are compared to 2 decimals. Any correct query passes.
- Query questions appear in practice, mocks and the mock interview, never in Check yourself or the placement test. `options`, `answer` are not used; `rationale` holds one explanation shown with the model answer.

## 11. Exams — `exams/blueprints.json`

```json
{
  "full":  { "title": "Full mock test", "questions": 30, "minutes": 40, "mode": "both",
             "slots": [ { "module": "1", "count": 4 }, { "module": "2", "count": 6 } ] },
  "quick": { "title": "Quick check", "questions": 10, "minutes": 12, "mode": "both",
             "slots": [ { "module": "1", "count": 1 } ] }
}
```

- A slot targets a module, section, topic, level, or a combination: `{ "module": "4", "level": "K3", "count": 2 }`.
- Slot counts add up to `questions`.
- `exams/fixed.json` (optional) lists fixed mocks as `{ "<mock-id>": { "title": "…", "blueprint": "official-1", "questions": ["id", …] } }`.
- Every path also gets these sessions from the host, with no configuration: **Module practice**, **Topic practice**, **Weak areas**; and **Lab sprint** when it has labs.

---

## 12. Cheat sheets — `cheatsheets/<module-id>.md`

One per module. A `#` title, then `##` groups of short bullet lines. Code blocks per variant are allowed. Learners add their own lines under **My additions**, stored by the host (§20).

---

## 12a. Interview sets — `interview/cards.json` (optional, every path except exam-certification paths)

Paths that prepare for job interviews ship interview cards. One card:

```json
{ "id": "4.2-i1", "topic": "4.2", "band": "fresher", "type": "concept",
  "q": "What is the difference between WHERE and HAVING?",
  "answer": "**WHERE** filters rows before grouping …",
  "points": ["WHERE before grouping", "HAVING after grouping", "Aggregates only in HAVING"],
  "follow": "Can HAVING be used without GROUP BY?", "code": "SELECT … HAVING COUNT(*) > 10;" }
```

- `band`: experience level `fresher` (0–1 yrs), `junior` (1–3), `mid` (3–5), `senior` (5–8), `lead` (8–10+). `type`: `concept`, `scenario`, `hands-on`, `design`, `behavioural`. `topic` is optional (path-wide behavioural cards may use the last module's topic).
- Behavioural cards are answered with STAR; their `answer` is a sample outline under Situation, Task, Action, Result, and their `points` are what interviewers listen for.
- Host behaviour: an **Interview corner** at the end of each lesson shows up to four cards for the topic; an **Interview cards** tab offers decks (my level, missed, behavioural, scenarios, per module, per topic), a target-level picker, an optional text box (typed answers are saved to the Notebook on rating), the model answer, the key-points checklist (ticks suggest Got it / Partly / Missed) and self-rating. A card counts as known after "Got it" on two different days; interview readiness = known cards up to the learner's level / all cards up to that level.
- Free text is never marked automatically. Automatic marking is limited to multiple choice, MCQ-style scenarios and write-a-query questions (§10.2).
- `validate.py` checks ids, bands, types, topics, non-empty q/answer, the §10.1 layout rule, and warns when a card has fewer than 2 key points or a band has no cards.

## 13. Activities — one envelope, plugin-specific payload

### 13.1 Envelope — `activities/<id>/activity.json`

```json
{
  "id": "role-login",
  "type": "lab",
  "plugin": "labs-web",
  "topic": "2.1",
  "title": "Log in with role locators",
  "placement": "standalone",
  "minutes": 10,
  "brief": "Log in using **only role-based locators**.",
  "tasks": ["Fill **Username** …", "Click **Log in** …"],
  "hints": ["The accessible name of an input comes from its label."],
  "checks": [ { "label": "Reaches the products page", "type": "url", "match": "/inventory" } ],
  "payload": { }
}
```

| Field | Rule |
|---|---|
| `type` | `demo` or `lab` |
| `placement` | `inline` = inside the lesson at `::activity{id}`; `standalone` = own page under Hands-on |
| `brief`, `tasks`, `hints` | Shown by the host in the same layout for every plugin. Hints revealed one at a time |
| `checks` | Labs only. Declarative (§13.3). Never JavaScript functions |
| `payload` | Owned by the plugin (starter, solution, workspace, site). The host never reads it |

### 13.2 Host behaviour (same for every plugin)

- **Lesson page:** inline activities render in place; standalone activities appear as a card under Check yourself.
- **Hands-on tab:** all standalone activities by module, with New / Attempted / Solved. Hidden when the path has none.
- **Activity page:** left = brief, tasks, checks, hints, solution (behind a confirm), reset; right = the plugin's workspace. Ctrl+Enter = run.
- **Progress:** "Labs x/y" appears only when the path has labs. Demos are not counted.
- **Playground:** a plugin may offer one free workspace per path (`payload.playground: true`); it has no checks.

### 13.3 Lab results and checks (same for every lab plugin)

Every lab plugin's `run()` returns:

```json
{
  "passed": true,
  "items": [{ "name": "log in with role locators", "status": "passed", "errors": [{ "message": "…", "line": 6 }] }],
  "warnings": ["Line 4: waitForTimeout() is a fixed sleep…"],
  "facts": { },
  "panels": ["results", "trace", "console"]
}
```

`facts` is plugin-specific data the checks read. Checks are evaluated by the host using the check types the plugin registers.

Common check types (every lab plugin): `pass` (all items passed), `tests` (`min` items), `code` / `noCode` (regex per variant, comments stripped).

`labs-web` (Playwright) types — facts `{ calls, actions, asserts, api, finalUrl }`:

```json
{ "label": "Uses getByRole at least 4 times", "type": "calls",    "method": "getByRole", "min": 4 }
{ "label": "Fills the username",              "type": "acted",    "kind": "fill", "match": "standard_user" }
{ "label": "Asserts visibility",              "type": "asserted", "matcher": "toBeVisible", "min": 1 }
{ "label": "Reaches the products page",       "type": "url",      "match": "/inventory" }
{ "label": "No fixed sleeps",                 "type": "noCalls",  "method": "waitForTimeout" }
```

`labs-api` (Postman) types — facts `{ runs, env, coll, glob, tests, failed, errors }`:

```json
{ "label": "PUT /echo sent",              "type": "sent",     "method": "PUT", "path": "^/echo$", "status": 200 }
{ "label": "Body has action=create",      "type": "sentBody", "method": "POST", "path": "^/echo$", "json": { "action": "create" } }
{ "label": "Sends an auth header",        "type": "header",   "name": "^authorization$", "value": "^Bearer " }
{ "label": "Stores the token",            "type": "var",      "scope": "env", "name": "token" }
{ "label": "Tests check the status",      "type": "script",   "match": "pm\\.response\\.to\\.have\\.status", "which": "test" }
{ "label": "At least 3 tests, all pass",  "type": "allPass",  "min": 3 }
```

Full `labs-api` list: `sent`, `sentBody`, `count`, `header`, `status`, `var`, `script`, `noScript`, `allPass`, `noErrors`, `match`. Full `labs-web` list: `calls`, `noCalls`, `acted`, `asserted`, `url`, `match`. `validate.py` knows these lists; a new plugin's types are added there when the plugin is added.

**Stored form.** Packages store every check as `{ "label", "type", "args": [...] }`, where `args` are the plugin helper's arguments and a regular expression is `{ "re": "...", "flags": "" }`. Source files may use the readable named fields shown above; `build_package.py` converts them to the args form.

**`match` checks (declarative, for logic the simple types do not cover).** One generic type per lab plugin; the spec is plain JSON, so a check moves with the content and needs no lab code in the host.

`labs-api` — `{ "type": "match", "args": [spec] }`, where `spec.on` picks what is examined:

| `on` | Spec fields | Passes when |
|---|---|---|
| `runs` | `method`, `url` (regex or list of regexes, all must match), `path`, `status`, `sentBody` / `respBody` (JSON subset, nested allowed), `sentRaw` (regex), `hasTests`, `logWhere`, `after: {method}` | at least `min` (default 1) runs match; `none: true` → no run matches; `every: true` → all match |
| `items` | `name` (exact request name, optional), `field` (`url`, `body`), `re` | same quantifiers over the collection's requests |
| `collection` | `field` (`tests`, `prerequest`), `re` | the collection-level script matches |
| `var` | `scope` (`coll`, `env`, `glob`), `key`, `re`, `gte` | the variable is set and matches |
| `examples` | `method`, `path`, `names` | every named example exists for that request |

```json
{ "label": "A GET after delete returns 404", "type": "match", "args": [{ "on": "runs", "method": "GET", "url": { "re": "\\/users\\/\\d+$", "flags": "" }, "status": 404, "after": { "method": "DELETE" } }] }
{ "label": "No hard-coded /users/13",        "type": "match", "args": [{ "on": "items", "name": "Read user", "field": "url", "re": { "re": "\\/users\\/13\\b", "flags": "" }, "none": true }] }
```

`labs-web` — `spec` fields, all given ones must hold: `apiMethods` (each method used by API calls), `apiStatuses` (each status seen), `code` (regex on the stripped code, JS and Python), `asserted` (a passing assertion with that matcher).

The former `named` type (logic kept inside a plugin) is retired: `validate.py` rejects it and the host no longer carries lab code. All 36 named checks of `api` and `pw` were converted to `match` and verified to give the same result as the original code on the starter and solution runs.

Rules:
- Checks test behaviour, not exact text, so several correct solutions pass.
- The host adds "Makes at least one assertion" (`labs-web`) or "Has at least one test" (`labs-api`) to every lab, via the plugin's `defaultChecks`.
- A plugin may register new check types. They read only from `facts` and the learner's code.

### 13.4 Demo payload (plugin `demos`)

`{ "factory": "<registered name>", "props": { } }`. The factory returns the existing `{ title, steps[], build, frame }` shape and is shipped inside the `demos` plugin or the package's own `plugins/` folder.

---

### 13.5 Database labs (plugin `labs-sql`)

Host-provided. Runs **SQL** on SQLite compiled to WebAssembly (sql.js, MIT) with MySQL-style extras, and **MongoDB** shell queries on documents (mingo, MIT). Everything runs offline in the page.

- Payload: `{ "engine": "sql" | "mongo", "dataset": "clinic", "starter": "…", "solution": "…", "expectError": false }`. Datasets come from a package plugin (e.g. `courses/sql/plugins/sql-data/plugin.js`: `LP.plugin({ id: "sql-data", today, datasets: { clinic: "<SQL script>" }, documents: { clinic: { patients: [...], labOrders: [...] } } })`). Every run starts from a fresh copy; foreign keys are enforced after loading.
- MySQL compatibility layer: `NOW()`, `CURDATE()` (a fixed dataset "today"), `YEAR/MONTH/DAY`, `DATEDIFF`, `LEFT/RIGHT`, `IF`, `DATE_FORMAT` (basic), `AUTO_INCREMENT`, `TRUNCATE`, `START TRANSACTION`; plus SQL Server `TOP`, `GETDATE()`, `ISNULL`, `LEN` and Oracle `FETCH FIRST`, `NVL`, `SYSDATE`, so learners using the database switch can type their own spelling.
- Check types (declarative): `result` `{ set, order, columns }` (compare a result set with the solution's), `state` `{ query }` (run a verify query after the learner's script and after the solution's, compare), `sets` `{ min }`, `noError`, and the common `code` / `noCode` (`raw: true` keeps comments, for "explain in a comment" tasks). `expectError: true` marks negative-test labs where the statement must be rejected.
- Lab page: schema or collections on the left (click a table to preview rows), brief + editor (Ctrl+Enter runs) + result tabs in the centre, tasks, live checks, hints, solution and an optional **Interview angle** (`interview` field) on the right.
- Lessons in such paths may set `"exampleDefault": "sql"` in the manifest: the Example section has a `sql` block shown for every variant plus optional blocks tagged with variant ids (`mysql`, `mssql`, `postgres`, `oracle`) that replace it for that variant. `labels.watchOut` renames the "Watch out" label (e.g. "Interview tip").

## 14. Plugins and extensions — the contract

### 14.1 Plugin shape (framework-free)

Plugins are plain JavaScript. They never depend on React or on a host's internals, so the same file runs in every host.

```js
LP.plugin({
  id: "labs-api",
  version: "1.2.0",
  contract: "2.0",
  activityTypes: ["lab"],
  requires: [],                         // capabilities (§14.3)
  css: "…",                             // optional, scoped under .lp-plugin-labs-api
  mount(el, ctx) {                      // right-hand workspace (labs) or inline demo
    // ctx = { activity, variant, saved, save(state), onResult(result), theme, course }
    return { update(ctx) {}, destroy() {} };
  },
  async run(activity, saved, variant) { return /* LabResult §13.3 */; },
  checkTypes: { sent: (check, result, code) => true },
  defaultChecks: [{ "label": "Has at least one test", "type": "tests", "min": 1 }],
  validate(activity) { return [/* errors */]; }   // used by validate.py via Node, optional
});
```

Rules:
- A plugin never adds a top-level tab, changes navigation, or stores progress itself. It saves through `ctx.save()`, which the host stores under `courses.<id>.activities.<activity-id>`.
- A plugin needs no network unless it declares `server-proxy` and is optional.
- Styles are scoped under `.lp-plugin-<id>` and use the design tokens from `DESIGN_GUIDE.md` (CSS variables), so it matches every host and both themes.
- Same plugin id in two packages: the host keeps the highest version that satisfies every package's range. Plugins stay backward compatible within a major version.

### 14.2 Extension shape

```js
LP.extension({
  id: "exam-dates",
  version: "1.0.0",
  slots: ["mocks-hub"],                 // "mocks-hub" | "lesson-header" | "setup" | "home"
  requires: ["server-proxy"],
  mount(el, ctx) { return { destroy() {} }; }   // ctx = { course, topic? }
});
```

### 14.3 Capabilities

```
Capability = "local-files" | "server-proxy" | "service-worker" | "cloud-sync"
```

| Plugin / extension | Requires | Learning Paths (single HTML) | CTFL Prep exe | CTFL Prep PWA |
|---|---|---|---|---|
| `demos` | — | ✓ | ✓ | ✓ |
| `labs-web` (Playwright) | — | ✓ | ✓ | ✓ |
| `labs-api` (Postman) | — | ✓ | ✓ | ✓ |
| `exam-dates` | server-proxy | direct call if pstb.pk allows it, else hidden | ✓ (`/pstb-api/` proxy to api.pstb.pk) | ✓ (host proxy) |
| `pdf-viewer` + official exams | local-files | hidden | ✓ (`istqb/syllabus.pdf` → "Syllabus p. N" links; `istqb/questions.json` → ISTQB Sample Exams A–D) | ✓ |

If a capability is missing, the host hides the feature and shows nothing in its place.

---

## 15. Learner-facing consistency and path colour

Every host renders every package with:
- the tokens, type scale, components and status colours in `DESIGN_GUIDE.md`;
- the same labels (§2), screens (§18), lifecycle (§5) and metrics (§19);
- **one base colour per path** (`theme.accent`), used sparingly so the learner always knows which path they are in.

A learner switching paths sees only content and the path colour change.

### 15.1 Path colour — what it marks and what it never touches

The host sets three variables from `theme.accent` when a path is active (or per station on the home screen):

| Variable | Value | Used for |
|---|---|---|
| `--path` | `theme.accent` | Identity marks (below) |
| `--path-bg` | accent at 8 % on white | Path name chip, selected station background |
| `--path-line` | accent at 30 % on white | Lighter segment of a ring (tested-out share) |

**Identity marks (the only places `--path` appears):**
1. Home: the path's progress ring, stage tag and station name.
2. Header: a 3 px rule along the top edge, and the dot in the course switcher.
3. The path name chip next to page titles (e.g. "CTFL Prep" above a lesson title).
4. A 3 px top border on the path's cards on shared screens (home detail cards, Data & setup).
5. The current-topic marker in the study plan and syllabus tree (2 px left rule).
6. The navigation pane on desktop: a light tint of the path colour (about 11 %) as its background, so the learner always sees which path they are in. This is the one large area allowed in path colour, decided by Osama (CONTEXT.md D21).

**Never in path colour** (the same in every path):
- Primary actions: buttons, links, active tab, selected options → brand blue `--brand`.
- Status and feedback: coverage bars, Strong / Good / Average / Weak, correct / wrong, readiness verdicts → status tokens.
- Learner-owned content (notes, highlights, My additions) → cream / yellow.
- Large fills: no page, header or card backgrounds in the path colour (the navigation-pane tint in mark 6 is the only exception); no text longer than a label.

### 15.2 Choosing a path colour

- Distinct from the brand blue, every status colour and the other installed paths (RGB distance ≥ 70; `validate.py` warns below that).
- Contrast ≥ 4.5 : 1 on white, so it works as label text (`validate.py` errors below that).
- One colour, chosen once, kept for the life of the path.

| Path | Colour | Name |
|---|---|---|
| `ctfl` | `#6A3DAF` | Violet |
| `sql` | `#9C2263` | Berry |
| `api` | `#9A5B00` | Bronze (changed from magenta #B5179E on 17 Nov 2026: too close to CTFL violet by eye) |
| `pw` | `#007A87` | Teal |

---

## 16. Built package — `<id>.lpp.js` and `<id>.lpp.json`

`build_package.py` turns `courses/<id>/` into two files in `courses/<id>/dist/`:

| File | Contents | Used by |
|---|---|---|
| `<id>.lpp.json` | All content: manifest, syllabus, parsed lessons, questions, blueprints, cheat sheets, activities, assets as data URIs | Hosts that fetch data; tooling; diffs |
| `<id>.lpp.js` | The same JSON wrapped in `LP.register(…)`, preceded by any plugin code the path bundles | Script tag in any host; inlined into single HTML |

```js
/* pw.lpp.js — built 2026-11-16, contract 2.0, version 1.0.0 */
(function (g) {
  var LP = g.LP = g.LP || { q: [], register: function (p) { this.q.push(["course", p]); },
                            plugin: function (p) { this.q.push(["plugin", p]); },
                            extension: function (p) { this.q.push(["extension", p]); } };
  /* bundled plugin code, if any: LP.plugin({...}) */
  LP.register({ /* contents of pw.lpp.json */ });
})(typeof window !== "undefined" ? window : globalThis);
```

Rules:
- Load order does not matter. A package can load before the host; calls queue in `LP.q` and the host drains the queue when it starts.
- Lessons are shipped parsed: `{ front, explanation, example: { <variant>: code }, watchOut, demos: [ids] }`, plus the raw Markdown.
- A package may bundle the plugins it needs (`courses/<id>/plugins/` or `platform/plugins/`). Then attaching it to any host needs nothing else.
- No network calls at load time. No `eval` of package content.

---

## 17. Host contract

### 17.1 A conforming host must

1. **Expose `window.LP`** with `register`, `plugin`, `extension`, and drain `LP.q` on start.
2. **Load packages** from its install location (§23) and refuse a package whose `contract` major version differs or whose required plugins it cannot provide. It shows the refusal on the Data & setup screen, not as a broken page.
3. **Run one adapter** per package format: `fromPackage(pkg) → internal model`. All package-to-host mapping lives there; nothing else in the host reads package fields directly.
4. **Provide the screens and routes** in §18 and the topic lifecycle in §5, for every package.
5. **Compute metrics** with the formulas in §19, using the numbers from the manifest.
6. **Store progress** in one store (`lp-v1`, §20) and run the migrations declared in each manifest's `legacy` list.
7. **Host plugins**: mount them in the activity page and lessons, evaluate checks from their registered types, and hide anything whose capability is missing.
8. **Show a course picker** when two or more packages are loaded; skip it when only one is.
9. **Follow `DESIGN_GUIDE.md`**, applying only `theme.accent` per path.
10. **Never branch on a course id or plugin id** in screens or logic.

### 17.2 Adapter rule

Each host keeps its internal shapes; the package format is the one source of truth. Today:

| Host | Internal shape | Adapter maps |
|---|---|---|
| CTFL Prep | Generated JSON (`syllabus.json` topics with `lo`, `k`; questions with LO ids) | `level` → K-level, `refs.pdfPage` → PDF link, blueprint slots → LO/K slots |
| Learning Paths | `addCourse({ modules, topics, lessons, questions:{q,o,a,r}, labs, labKind })` | `stem/options/answer/rationale` → `q/o/a/r`; `plugin` → workspace; declarative checks → check functions |

### 17.3 Host conformance test

A host conforms when it loads `course-template` (the sample package) and the three real packages, and all of these work for each one: both study modes, a whole-path placement test (paused and resumed once) → study plan, a mock moving a tested-out topic back to Review; lesson → understood → check (with a wrong answer and replacement) → passed; a lab run with checks (if any); a full mock in exam mode → results by topic → review; weak areas; progress metrics; backup and restore; a missing-capability feature hidden cleanly; desktop and phone layouts.

---

## 18. Screens, routes and navigation (identical in every host)

| Route | Screen |
|---|---|
| `#/` | Course picker (skipped when one package is loaded) |
| `#/c/:course/learn/:topic` | Lesson → Check yourself |
| `#/c/:course/hands-on` | Activities hub (only if the path has standalone activities) |
| `#/c/:course/activity/:id` | Activity page |
| `#/c/:course/cheatsheets/:module` | Cheat sheet + My additions |
| `#/c/:course/mocks` | Mock tests hub |
| `#/c/:course/exam/:session` | Exam mode (no app chrome) |
| `#/c/:course/practice/:session` | Practice mode |
| `#/c/:course/results/:id` · `/review/:id` | Results and review |
| `#/c/:course/sprint` | Lab sprint (only if the path has labs) |
| `#/c/:course/assess` | Placement test (whole path, resumable) |
| `#/c/:course/plan` | Study plan (default Learn view in Assess-first mode) |
| `#/c/:course/progress` | Progress |
| `#/setup` | Data & setup (all paths: backup, restore, install, official files, loaded packages) |

Old routes (`#/learn/…`, `#/labs`, `#/lab/…`, `#/cheats`) redirect to the current course's new route.

Page frame (same on every in-path screen). On desktop the three columns are separate panes, each with its own scroll and thin scrollbar; the page itself does not scroll. Navigation pane: light path-colour tint; roomy rows (14 px text, ~7 px row padding, number column wide enough that codes never touch titles), a divider between chapters, and only the chapter holding the current topic expanded — other chapters show one line (title, size, minutes, %) and open on click or Enter (D22). Choosing a topic keeps the navigation pane where it is (it scrolls only if the current topic would be hidden); the centre and context panes start at the top. Choosing the topic already open does nothing (D28). Centre: grey reading area with white content cards. Context pane: white (cream for the Notebook). On Learn, the lesson's exam trick sits at the top of the context pane, above the Notebook, and the lesson card (text, tables, demos) uses the full centre width; below 1100 px the exam trick returns to the end of the lesson card (D23). On desktop the divider between centre and context pane can be dragged (or focused and moved with ←/→, double-click resets): the context pane takes width from the centre, never below 280 px, and the centre never below 420 px; the width is remembered per browser and applies to every path and screen that has a context pane (D24).
Columns: left column = navigation (syllabus tree; chapter list on Cheat sheets), centre = the screen's content with its label and title at the top, right column = context (Notebook on Learn, My additions on Cheat sheets, readiness and history on Mock tests). Below 1100 px the left column folds into the ☰ drawer and the right column moves under the content. Exam mode and the home screen are the only screens without the frame.

Navigation:
- Desktop top bar: course switcher · Learn · Hands-on (if any) · Cheat sheets · Mock tests · Progress · Data.
- Phone (≤ 760 px): bottom tab bar with the same items; drawer for syllabus and course switcher.
- Variant toggle in the header only when the path declares variants.

---

## 19. Shared metrics (formulas fixed, numbers from the manifest)

| Metric | Formula |
|---|---|
| Coverage | (passed + tested-out topics) ÷ topics, shown split. Drops only when a mock moves a tested-out topic back to Review |
| Placement | per topic: ✓✓ Tested out · ✓✗ Review · ✗ Learn (adaptive, §5.1) |
| Time saved | sum of `minutes` of tested-out topics |
| Readiness | the last `readiness.window` (3) exam-mode mock results, newest weighted 3, then 2, then 1; ≥ 75 Ready, ≥ 65 Borderline, else Not ready |
| Topic status | recency-weighted last `status.window` answers → Strong / Good / Average / Weak by `status.bands` |
| Weak areas | wrong answers collect; a question retires after `weakAreas.retireAfter` consecutive correct `sessions` |
| Question pools | `check` questions are used only in Check yourself. Everything else (`bank`, incl. questions of fixed mocks) feeds practice, replacements, weak areas and randomised mocks |
| Randomiser | Exam-pattern mock: one of the path's topic + level blueprints at random; each slot draws from a per-topic deck; one question per `concept` per exam; decks persist so a question does not repeat until its topic's pool is used; the previous mock's questions go to the back of a new deck. Paths with module blueprints draw by module. Practice picks unseen first, then least recently seen, retired questions last |
| Retired questions | A weak-area question answered correctly in 2 separate sessions leaves Weak areas and is marked retired; retired questions are shown last, never removed |
| Study minutes | sum of `minutes` for passed topics; module = sum of its topics |
| Labs | solved ÷ labs (only if the path has labs) |
| Lab sprint | 3 labs (unsolved first), 25 min, score = solved ÷ 3 |

Coverage and readiness are always shown separately and never merged.

---

## 20. Progress — one store for every path

Key **`lp-v1`** (browser storage), same JSON for backup, restore and optional cloud sync.

```json
{
  "v": 1,
  "prefs": { "theme": "auto", "lastCourse": "pw" },
  "notebook": [{ "id": "…", "course": "ctfl", "topic": "1.2.2", "kind": "note", "text": "…", "onSheet": false, "t": 0 }],
  "courses": {
    "ctfl": {
      "contentVersion": "4.0.1",
      "variant": null,
      "mode":       "assess",
      "topics":     { "2.1.1": { "understood": true, "passed": false, "testedOut": false, "plan": "review", "chain": [{ "q": "ctfl:2.1.1-a", "c": 1 }] } },
      "placement":  { "started": 0, "finished": null, "answers": { "ctfl:B-2.1.1-04": true }, "queue": ["ctfl:B-2.1.2-02"] },
      "answers":    [{ "q": "ctfl:2.1.1-a", "ok": false, "t": 1792066385081, "src": "check" }],
      "activities": { "role-login": { "solved": false, "attempts": 0, "state": {} } },
      "mocks":      [{ "id": "…", "blueprint": "full", "mode": "exam", "pct": 72, "answers": {} }],
      "weak":       { "ctfl:2.1.1-a": 0 },
      "seen":       { "ctfl:2.1.1-a": 1792066385081 },
      "decks":      { "concept-id": ["q-ids"] },
      "additions":  { "1": ["my line"] },
      "session":    null,
      "sprint":     null
    }
  },
  "updatedAt": 0
}
```

Rules:
- Everything a path stores lives under `courses.<id>`. Plugins write only through `ctx.save()` → `activities.<activity-id>.state`.
- Question ids are stored with the course prefix (`<course>:<id>`), so paths never collide.
- **Course ids are permanent.** Existing ids: `ctfl` (CTFL Prep), `pw` (Playwright Path), `api` (Postman Path). A new path picks a new id once and keeps it.
- One backup file holds every path. Restore can be per path. Restoring a path that is not loaded keeps its data untouched for later.

### 20.1 Migration of existing stores

| Old key | Source app | New location |
|---|---|---|
| `ctfl-personal-v1` | CTFL Prep (full) | `courses.ctfl` (`notes` → `notebook`, `cheatAdds` → `additions`) |
| `ctfl-simple-v1` | CTFL Prep (simple file) | `courses.ctfl`, merged by latest timestamp |
| `pwpath-v1` | Playwright Path (single file) | `courses.pw` (`labs` → `activities`, `adds` → `additions`) |
| `pmpath-v1` | Postman Path (single file) | `courses.api` (same renames) |
| `learnpaths-v1` | Learning Paths hub | `c.pw` → `courses.pw`, `c.api` → `courses.api`, `nb` → `notebook` |
| `ctfl-pstb-dates` | CTFL Prep | `exam-dates` extension cache, unchanged |

The host runs migration once on first start, keeps old keys untouched, and records `migratedFrom` so it never runs twice. The exe keeps serving on `127.0.0.1:47321` so browser storage from earlier versions stays reachable.

---

## 21. Versioning and compatibility

| What | Rule |
|---|---|
| Contract (`contract`) | `2.x` hosts load `2.x` packages. Minor = additive only. Major = new file, migration notes here |
| Package (`version`) | Semver. Patch = wording fixes. Minor = new topics, questions, labs. Major = removed or renumbered topics |
| Question ids | Never reused. Deleted questions are listed in `courses/<id>/retired.json`; the host drops their answers on load |
| Topic codes | Renamed codes are mapped in `courses/<id>/renames.json` (`{"old": "new"}`); the host moves progress across |
| Plugins | Semver range in the manifest; backward compatible within a major version |

---

## 22. Validation — `scripts/validate.py`

Run before every build. A package is not published unless it passes.

Common rules:
- **Manifest:** required fields; `id` format; `contract` is `2.x`; levels, variants, plugins and extensions well-formed; `theme.accent` is a 6-digit hex.
- **Hierarchy:** modules hold sections or topics, not both; topic codes unique; every topic has objective, minutes, level, a lesson file and exactly 3 check questions; no orphan lessons, questions or activities.
- **Lessons:** front matter matches the syllabus; `##` sections exactly Explanation, Example, Watch out (+ optional Demo) in order; Explanation 80–300 words; exactly one example (one block per variant); Watch out 1–2 sentences or Rule / Trap / Check; activity references exist.
- **Questions:** unique ids; 4 options (5 for select-two); valid answer; one rationale per option; rationale never starts with "Correct" / "Incorrect"; level in the scale; no duplicate question (same stem and same options); from 40 questions upward, each answer letter 20–30 % and the correct option the longest in ≤ 40 %.
- **Exams:** slot counts add up to `questions`; each blueprint can be filled from the bank without repeating a concept; fixed mocks reference existing questions.
- **Placement:** every topic has at least 2 bank questions (2 different concepts preferred) so the placement test can be built; fewer is a warning.
- **Cheat sheets:** one per module.
- **Activities:** envelope fields; topic exists; plugin listed in the manifest; labs have checks; check types known to the plugin.

Plugin rules (run by the plugin's own validator in Node, e.g. `labs-web`, `labs-api`): every lab has a starter and solution for every variant; the solution passes every check; the starter fails at least one.

```
python3 scripts/validate.py courses/<id>
python3 scripts/build_package.py courses/<id>
```

---

## 23. Delivery and install locations

| Host | Where packages live | How a path is attached |
|---|---|---|
| CTFL Prep **exe** | Built-in packages inside the exe, plus a `courses/` folder next to the exe | Drop `<id>.lpp.js` into `courses/` and reload. The launcher lists the folder at `/__lp/courses` |
| CTFL Prep **PWA** | Packages copied into `public/courses/` at build, listed in `courses/index.json`; cached by the service worker | Rebuild with the package added; or import a `.lpp.js` on Data & setup (stored in IndexedDB) |
| Learning Paths **single HTML** | Packages inlined as `<script>` blocks by the single-file build | `build_single.py --courses ctfl,pw,api`; or import a `.lpp.js` on Data & setup (stored locally) |

The exe keeps its current behaviour: double-click, opens the browser at `127.0.0.1:47321`, closes any older copy, keeps progress.

### 23.1 Release folder and updates (D27)

`release.sh` (Learning Platform root) validates and builds every package, builds the host and exe, and refreshes **`release/`** — always the same names, updated in place, never new copies:

| `release/` item | What it is |
|---|---|
| `QA-Pathways/` | The runnable app, already unzipped: `QA-Pathways.exe` + `app/` (the app files) + `courses/` (extra paths) + `istqb/` (official files) + `HOW-TO-RUN.txt` |
| `QA-Pathways-Windows.zip` | The same `QA-Pathways/` folder zipped, for sharing or another PC |
| `QA-Pathways-PWA.zip` | The static PWA build |
| `courses.zip` | Package sources (`courses/`) |

Update flow:
- The launcher serves the `app/` folder next to the exe when it exists (the copy built into the exe is the fallback), with `no-cache`, so new files in `app/` are what the next page load gets.
- Every build has an id (`window.QAP_BUILD`, also in `app/version.json`). The open page checks `version.json` on load, when the tab regains focus and every 2 minutes; when the id differs it shows **"QA Pathways was updated — Reload now"** (Later hides it for 30 min). Reload keeps the route and progress. The service worker is network-first, so one reload is enough.
- An update usually only rewrites `app/` and the zips. When the launcher itself changes (`app/launcher.txt` holds its source hash), the new exe is delivered as `QA-Pathways.new.exe`; on its next start the running exe renames itself to `.old`, moves the new one into place, restarts, and the `.old` file is removed on the start after.
- Learner data (browser storage), `courses/` and `istqb/` are never touched by an update.

---

## 24. Attaching a path — step by step

**Any path to any host:**
1. Build and validate the path (§22) → `courses/<id>/dist/<id>.lpp.js`.
2. Check its manifest: `contract` major matches the host; every required plugin is available in the host or bundled in the package.
3. Install it in the host's location (§23).
4. Open the host. The course picker lists the new path; old progress for it migrates automatically from any `legacy` key.
5. Run the host conformance test (§17.3) for that path.

**CTFL Prep as the base (default):** attach `pw.lpp.js` and `api.lpp.js`. The exe and PWA now carry all three; CTFL's PDF viewer and exam dates still work.

**Learning Paths as the base:** attach `ctfl.lpp.js`. CTFL's lessons, demos, checks, mocks and progress work; `pdf-viewer` and `exam-dates` hide because a single HTML file has no local files or server proxy.

---

## 25. Authoring workflow for a new path

1. Copy `course-template/` to `courses/<id>/`. Set `id` (permanent), title, levels, variants, plugins.
2. Write `syllabus.json`: modules → topics, one objective, level and minutes each.
3. Write lessons from `briefs/LESSON_BRIEF.md`.
4. Write 3 check questions per topic, then the bank (about 5 × the times each topic appears across blueprints), from `briefs/QUESTION_BRIEF.md`.
5. Write `exams/blueprints.json` to match the real exam or a sensible module mix.
6. Write one cheat sheet per module.
7. Add activities only where doing beats reading. Use an existing plugin; write a new one only against §14, as its own folder under `platform/plugins/`.
8. Validate, build, attach to a host, and run the conformance test on desktop and phone.

---

## 25a. UI preview gate (before any screen is built)

No host screen, plugin workspace or new page layout is built until Osama has seen and approved a preview of it.

1. Show a static preview first: a clickable HTML mockup (desktop and phone width) using `DESIGN_GUIDE.md` tokens and real sample content from `course-template` or the path being built.
2. Cover every state that matters: empty, in progress, passed/solved, error, and capability hidden.
3. Wait for explicit approval. Changes requested → revise the preview, not the code.
4. Build only the approved design. Any later layout change goes through a new preview.

Content-only work (lessons, questions, cheat sheets, activities on an existing plugin) needs no preview, because existing approved screens render it.

---

## 25b. Original files are never changed

All platform work happens in its own folder, `Learning Platform/`, inside the Learning Paths folder. The existing apps, docs and data (CTFL exe folders, the HTML apps, `postman-path-source/`, `APP_STRUCTURE.md`, `DESIGN_GUIDE.md`, the original `PLATFORM.md`, progress backups, official ISTQB files) are read-only inputs. They are read or copied, never edited, moved or deleted. Anything derived from them is written as a new file under `Learning Platform/`.

---

## 26. Current state and order of work

State on 17 Nov 2026 (details and reasons in `CONTEXT.md`, build log):

| Item | State |
|---|---|
| Packages `ctfl`, `api`, `pw` | Built from the existing apps into `courses/<id>/` and `dist/<id>.lpp.js`. Validate with 0 errors and 0 warnings (strict lesson rules, answer-letter balance, correct option longest in ≤ 40%, all lab checks declarative) |
| `demos` | Packaged inside the `ctfl` path (`courses/ctfl/plugins/demos/`), from the readable demo source in `ctfl-prep-simple_3.html`. All 20 demos mount and step through in the host |
| Extensions | `exam-dates` (PSTB, same source, parsing and cache as CTFL Prep v1.9), `pdf-viewer` (syllabus page links) and official Sample Exams A–D from the learner's `istqb` folder. Fixed Mocks 1–10 from the `ctfl` package |
| `labs-api`, `labs-web` | Provided by the host from the existing Postman and Playwright engines. All 25 Postman labs and all 18 Playwright labs (JavaScript and Python) pass with their solution and fail with their starter |
| Host **QA Pathways** (`hosts/qa-pathways/`) | Built from the Learning Paths code: loads any package through `window.LP`, home (mockup 03), path colour, path switcher, `/c/:course/` routes, both study modes with the whole-path placement test and study plan, select-two questions, CTFL Prep progress migration, single HTML + PWA + Windows exe (`courses/` folder for extra paths) |
| CTFL Prep React host | Not converted: its source is not in the folder. CTFL runs as a package in QA Pathways instead |

Open, in order:
1. Host refactor: remove internal branching on lab kind; store in the §20 shape (today `lp-v1` keeps the Learning Paths internal shape).
2. CTFL Prep React host: the source provided (`ctfl-prep_2.zip`, 9 Oct) is older than v1.9 (no PWA, exam dates or demo sets A–C). Converting it would lose v1.9 features; revisit only if the v1.9 source turns up.

## 27. Checklists

**Package**
- [ ] `course.json` valid; `contract` 2.x; `id` permanent and unused by another path
- [ ] Hierarchy follows §4; every topic has objective, level, minutes, lesson, 3 checks
- [ ] Lessons follow §7 exactly
- [ ] Questions follow §10; balanced letters; correct option not usually longest
- [ ] Blueprints fill without repeating concepts
- [ ] At least 2 bank questions per topic for the placement test
- [ ] One cheat sheet per module
- [ ] Activities use §13; checks declarative; labs pass both-direction validation
- [ ] `legacy` lists any old storage keys
- [ ] `validate.py` passes; `build_package.py` produced `.lpp.js` and `.lpp.json`

**Host**
- [ ] Every item in §17.1
- [ ] Conformance test (§17.3) passes with `course-template` and every real package
- [ ] Works as base with the others attached

**Plugin**
- [ ] Framework-free, registered with `LP.plugin`, scoped styles using design tokens
- [ ] Declares `requires`; works or hides cleanly in every host
- [ ] Stores state only through `ctx.save()`
- [ ] Registers every check type its labs use; validator runs in Node
