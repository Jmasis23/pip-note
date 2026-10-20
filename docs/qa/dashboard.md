# Personal dashboard

Home is the initial app view after sign-in. It uses the first name from the current
account's display name, or “Hi there” when no name is available. It shows active
notes across every folder, independently of the board's current filters:

- Three recently edited pinned notes and four recent notes.
- Counts for notes kept, notes created or edited on the local calendar day, and
  individual unfinished checklist items.
- Up to three notes with unfinished checklists; selecting one opens its editor.
- The most recently edited draft, with a Resume draft action.
- An empty state with a first-capture action when there are no active notes.

The dock's Home button returns here. Search switches to All notes; the existing
board tabs, card positions, Auto arrange, capture shortcuts, and editors still work.
The dashboard adds no network requests. Note data comes from the repository snapshot
already loaded by `useNotes`; account metadata comes from the stored sign-in session.

## Checks

```bash
npm test
npm run build
# Optional browser driver; not needed by the app:
npm install --no-save --package-lock=false playwright
node docs/qa/dashboard.browser.mjs
node docs/qa/card-drag.browser.mjs
```

The dashboard browser check uses synthetic account and note fixtures and intercepts
all remote requests. It covers greeting, empty and missing-name states, pin and
checklist updates, draft restoration, navigation/search, keyboard capture, dark
appearance, reduced motion, and phone layout. Screenshots go to
`/tmp/pip-dashboard-qa` by default; override with `QA_ARTIFACTS`.
Set `CHROME_PATH` if Chromium is installed elsewhere.

These checks verify browser behavior. Windows window focus, tray, native shortcut,
and installer behavior still require a Windows smoke test.
