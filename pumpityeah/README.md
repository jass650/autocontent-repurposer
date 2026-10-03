# PumpitYeah

A working rebuild of a Notion-style AI workspace: block editor, nested pages, databases, publishing, and a real Claude-powered AI. It has no dependencies and needs only Node 18+.

## Run it

```bash
cd pumpityeah
cp .env.example .env        # then paste your ANTHROPIC_API_KEY into .env
npm start                   # http://localhost:3000
```

- **Demo account:** `demo@pumpityeah.com` / `demo1234`, or click **Try the live demo** on the landing page.
- Every new account starts with a seeded workspace: a welcome guide, a Q4 launch tracker (table and board), meeting notes, a team wiki, a reading list, a trip plan and a journal.
- Without an API key, everything still works except AI. AI surfaces a clear message telling you how to turn it on.

Environment variables:

| Var | Default | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | (none) | Turns on PumpitYeah AI |
| `PUMPIT_AI_MODEL` | `claude-sonnet-5-5` | Model used for all AI calls |
| `PORT` | `3000` | HTTP port |
| `PUMPIT_DATA_DIR` | `./data` | Where `db.json` lives |
| `ANTHROPIC_BASE_URL` | `https://api.anthropic.com` | API endpoint override (proxies, tests) |

## What's in it

**Pages:** `/` landing, `/login` and `/signup`, `/app` home, `/app/p/:id` page, `/app/ai` AI chat, and `/p/:id` for published (public) pages.

**Editor (the core):**
- Text, H1–H3, to-do, bulleted and numbered lists, toggle, quote, callout, divider, code (with language and copy), image (upload, paste or link), and sub-page links.
- `/` slash menu with fuzzy filtering and keyboard navigation.
- Markdown shortcuts: `#`, `-`, `1.`, `[]`, `>`, `"`, `` ``` ``, `---`.
- Enter splits a block, Backspace merges, and arrow keys move between blocks.
- Drag handle to reorder. The block menu has Turn into, Duplicate and Delete.
- Selection toolbar: bold, italic, underline, strike, code, highlight, link and **Ask AI**.
- Pasting multi-line text or markdown becomes real blocks. Pasted images become image blocks.
- Changes save automatically (debounced), and pending edits are flushed when you leave the page.

**PumpitYeah AI** (real Claude calls, streamed):
- **Inline:** press `Space` on an empty line, use `/ai` commands, or highlight text and click Ask AI.
  - Actions: continue writing, summarize, find action items, brainstorm, outline, improve, fix grammar, shorter or longer, change tone, simplify, explain, translate.
  - Results stream in. You can **Insert below**, **Replace selection**, refine with a follow-up, try again or discard. Output is converted into native blocks.
- **Workspace chat (`/app/ai`):** answers questions using every page in your workspace, cites pages as clickable `[[links]]`, and can save any answer as a new page.

**Databases:**
- Table and Board views.
- Property types: text, number, select, multi-select, status, date, person and checkbox.
- Inline cell editors, creating new options on the fly, adding, renaming, retyping and deleting properties, sorting, and search.
- Drag cards between board columns.
- Each row opens as a full page with a property panel.

**Workspace:**
- Sidebar page tree with expand/collapse, favorites, and per-page menu (favorite, copy link, duplicate, rename, trash).
- `Ctrl/⌘+K` search across titles and content, with "Ask AI" as the first result.
- Template gallery (8 templates), Trash with restore and permanent delete, and Publish to web.
- Page styles: serif or mono font, small text, full width. Export to Markdown.
- Dark mode, and a responsive layout down to phone width.

## Architecture

```
server.js        HTTP server: static files, cookie sessions (scrypt), pages API, AI proxy (SSE → text stream)
seed.js          Sample workspace for new accounts
public/
  index.html     Landing page          auth.html  Login/signup     share.html  Published page
  app.html       App shell
  js/app.js      Routing, sidebar, top bar, page view, home, search, templates, settings, trash
  js/editor.js   Block editor
  js/database.js Table/board views and property editors
  js/ai.js       Inline AI panel and workspace chat
  js/store.js    Client state and debounced saving
  js/common.js   API client, sanitizer, markdown↔blocks, icons, popovers
test/            Headless-Chrome smoke tests (CDP, no deps) + mock Anthropic SSE server
```

Data is stored in a single JSON file (`data/db.json`), written atomically. Rich text is stored as sanitized inline HTML, and every render passes through a whitelist sanitizer.

## Tests

```bash
PORT=3456 node server.js &                                     # app
node test/ui-smoke.mjs                                          # editor, databases, search, templates, theme
node test/mobile-smoke.mjs                                      # 390px viewport, overflow checks
node test/mock-anthropic.mjs 4010 &                             # fake streaming API
PORT=3457 ANTHROPIC_API_KEY=x ANTHROPIC_BASE_URL=http://localhost:4010 node server.js &
node test/ai-smoke.mjs                                          # inline AI insert/replace, chat + citations
```

Screenshots are written to `test/shots/`. The tests use Chrome at the default Windows path; set `CHROME_PATH` to use a different browser.
