# QA Pathways — the one folder

| Where | What |
|---|---|
| `QA-Pathways.exe` | Double-click to run (keep the black window open). Make a Desktop shortcut and always start from it. |
| `app/` | The app itself (the exe serves this; updates land here, app shows "Reload now"). Icons are in `app/icons/`. |
| `istqb/` | Your own `syllabus.pdf` and `questions.json` (official ISTQB files, never share). |
| `PLATFORM.md` | The rules (content format, host behaviour, design rules). **Carry into new chats.** |
| `CONTEXT.md` | Decisions and build log. **Carry into new chats.** |
| `share/` | Zips to give others (Windows app, installable web version). Never include `istqb/`. |
| `build-source.zip` | Unzip only when building the next release (kept as one file; Claude reads it in new chats). Contains `build/`: `courses/` (ctfl, api, pw, sql), `course-template/`, `scripts/`, `hosts/qa-pathways/` (app source + exe source), `source/` (engines), `mockups/` (approved designs, new icon in 17), `release.sh`. |

Next release: unzip `build-source.zip` here, then `sh build/release.sh` (needs Python 3 and Go). It refreshes the exe, `app/` and `share/` in place.
New chat: attach PLATFORM.md + CONTEXT.md (and README.md).
