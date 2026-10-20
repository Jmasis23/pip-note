# Launch candidate: original layout, clipboard, capture-only Jev

Original bottom dock retained. F01-F05 preserved from 91b904e, combined with the
local opt-in clipboard history from f2cb4f2. General Ask, note-editor AI, BYOK
settings and AI initialization removed. Native inference/configuration/model
selection commands removed. Existing Google/ChatGPT account sign-in and Supabase
note sync remain. ChatGPT login no longer fetches a model list. Model-request core
code is parked behind the disabled-by-default `ai` Cargo feature for later work.

## Capture
- Visible folder dropdown, including Inbox. Explicit selected folder or resumed
  draft wins over model routing. User dropdown choice always wins.
- First-line title/rest-body is immediate fallback. Save never waits on inference.
- Prepared Jev choice of existing source line/title and existing folder/Inbox.
  Unknown/low-confidence outputs fall back locally. Thresholds 0.7 title/0.8
  folder are provisional, not calibrated against live outcomes.
- If the title changes to a later line, preserve the entire captured text in body
  so no original first-line content is lost. Existing notes untouched.
- Debounce 650ms, client timeout 2200ms; stale requests aborted and ignored.
- Visible disclosure in enabled capture: text and folder names go to TypeSafe.

## Server path, not activated
Prepared Supabase capture-arrange endpoint: JWT/user verification, strict request
bounds, service-only atomic 100/day/account quota, TypeSafe secret server-side,
1.8s provider timeout, no note/body logging. Quota SQL migration is source only.
No database migration applied, secret set or endpoint deployed. Frontend default
VITE_CAPTURE_JEV unset/off; server CAPTURE_JEV_ENABLED unset/off. Both flags must be
reviewed and turned on for production activation.

Existing vault key confirmed by metadata: TypeSafe AI API key - Joe work org.
Not extracted into shell. Intended secure route: fill directly into Supabase
server-secret form when deployment is approved. Existing Cloudflare Jev router
unchanged. No TypeSafe API calls or real notes sent in this work.

## Checks
57 web tests, TypeScript/build, 36 default Rust core tests passed. Parked ai feature
48 Rust tests passed. Deno endpoint typecheck passed. Local endpoint gate tests
run separately. Browser original-layout folder/draft/title/focus smoke passed.
Synthetic Jev UI test intercepted all model requests locally: two typed picks,
folder override, full text retained, exactly one request. Screenshot inspected.
This validates composition/UI, not model accuracy, provider uptime or latency.

## Pending before activation
Live synthetic Jev latency/selection tests using approved secure route; confirm
quota and provisional confidence thresholds against a representative synthetic
suite. Apply migration, set existing vault key as server secret, deploy endpoint,
then activate client flag only with approval. Full Windows build/runtime remains
unverified here; Linux Tauri needs glib dev packages. No push, merge or public
preview update was performed.
