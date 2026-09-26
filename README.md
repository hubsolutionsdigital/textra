# Design Review Portal

A guided feedback portal for UI/UX designs, similar to Frame.io but for PDFs. The agency uploads
PDF designs, sends the client **one link**, and the portal walks the client through reviewing each
page, leaving pinned comments, and submitting a fixed number of revision rounds. It ends with final
approval and a "development has started" hand-off.

## What it does

**Agency (signed-in)**
- Create a project, set how many revision rounds are included (default **3**), and add a welcome message.
- Upload one PDF per page ("Home", "About"…). Drag & drop several at once, then reorder or rename them, and add a note per page.
- Copy the client link. The same link works for every round.
- See feedback live, mark comments **Done** or **Discussed**, and reply. Replies show to the client in the next round.
- When the client submits a round, upload updated PDFs, then click **Open round N+1**. After the last round, upload the finals and click **Send final for approval**.
- Add the live-site URL once it's up, and the client sees a **View your live site** button.
- The activity log records every step (who joined, submissions, uploads, approvals).

**Client (no account, name only)**
- Opens the link and enters their name. That's all.
- A short guided tour covers what to review, how to comment, and **this round's focus**.
  Round 1 focuses on *Layout & structure*, round 2 on *Content & visual style*, and the last round on *Final details*.
- A checklist of pages, a progress bar, and **Done with this page → next page** keep them moving.
- Click anywhere on the design to comment. The comment popup leads with positive presets
  (❤️ Love it · 👍 Like this · 🎉 This is great) before ✏️ *Suggest a change* / ❓ *Ask a question*.
  Screenshots can be pasted with Ctrl/⌘+V or attached.
- After 10 minutes of review time with unsent comments, the portal asks whether they'd like to submit this batch.
- Submitting locks the round with a confetti celebration. When the next round opens, the client uses the same link.
  Earlier comments show as faint dots on the design, and hovering one reveals what was said, plus the agency's status and reply.
  A **Feedback log** lists every round.
- After the last round, a "that's a wrap" celebration shows. When the final design arrives, there's an **Approve design** button,
  and approving triggers the "Development has started 🚀" screen with the live URL once shared.

## Stack

- **Server:** Node ≥ 22.5, Express 5, built-in `node:sqlite`, and multer for uploads. Files are stored on disk in `data/`.
- **Web:** React 19 + Vite, with `pdfjs-dist` for rendering PDFs to canvas and `canvas-confetti`.

## Running it

```bash
npm install
npm run dev          # API on :3001, web app on http://localhost:5173
```

Production:

```bash
npm run build
PORT=3000 npm start  # serves the built app and API from one process
```

Environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3001` | HTTP port |
| `DATA_DIR` | `./data` | SQLite database and uploaded files. Put this on a persistent volume. |
| `INSECURE_COOKIES` | unset | Set to `1` to allow login over plain HTTP when `NODE_ENV=production` (e.g. local testing). |

Run the API tests with `npm test`.

## Notes and limits

- Clients are identified only by the name they type. That's intentional to keep things frictionless, but it means
  anyone with the link can comment, so treat the link like a password.
- Pins are stored as relative (0–1) positions on a PDF page, so they stay in place at any zoom level. Pins from earlier
  rounds are shown on the newest version at the same spot.
