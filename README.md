# Design Review Portal

A guided feedback portal for UI/UX designs, similar to Frame.io but for PDFs. The agency uploads
PDF designs, sends the client **one link**, and the portal walks the client through reviewing each
page, leaving pinned comments, and submitting a fixed number of revision rounds. It ends with final
approval and a "development has started" hand-off.

## What it does

**Agency (signed-in)**
- Create a project, set how many revision rounds are included (default **3**), add a welcome message, and list the
  **emails to notify** (required).
- Every time the client submits a round, those addresses get an email summarising the comments. It includes a
  **team link** (`/t/…`) where anyone on the team can open the comments, see them pinned on the design, and mark
  them **Done** or **Discussed** or reply, without signing in.
- Upload one design per page: a **PDF**, a single **.html** file, or a **.zip** of an HTML prototype (HTML + CSS,
  JS, images and fonts) so animations, scroll effects and interactions work as built.
  Drag & drop several at once, then reorder or rename them, and add a note per page.
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
- **Submit round** stays greyed out (showing e.g. "1/3 pages") until the reviewer has clicked **Done with this page** on every page. The server enforces this too.
- After 10 minutes of review time with unsent comments, the portal asks whether they'd like to submit this batch.
- Submitting locks the round with a confetti celebration. When the next round opens, the client uses the same link.
  Earlier comments show as faint dots on the design, and hovering one reveals what was said, plus the agency's status and reply.
  While the team works, the client sees live progress ("2 of 3 done") and each change request marked
  ✅ Done, 💬 Discussed or ⏳ Working on it. When the next round opens, they see "What we changed from your round 1 feedback".
  Positive reactions (❤️ 👍 🎉) never count as work to do.
  A **Feedback log** lists every round.
- After the last round, a "that's a wrap" celebration shows. When the final design arrives, there's an **Approve design** button,
  and approving triggers the "Development has started 🚀" screen with the live URL once shared.

## HTML prototypes

- Clients switch between **Desktop (1440px), Laptop (1280px), Tablet (768px) and Mobile (390px)**, and the live page
  re-flows at that width.
- **Comment / Interact** switch: in Comment mode, a click pins a comment to the exact element. In Interact mode, menus,
  sliders, links and forms work normally.
- Pins are anchored to the element (plus the click position inside it), so they follow scrolling, sticky headers and
  animations, and still land in the right place at other screen sizes. Each comment records the screen size it was left
  on. If its element isn't visible at the current size, the sidebar says so, and clicking it jumps to that size.
- Multi-page zips work: links between pages navigate inside the viewer, and pins only show on their own page.
- Safety: prototypes are served from `/sites/<random token>/` with a `Content-Security-Policy: sandbox` header and a
  sandboxed iframe (no same-origin), so their scripts can't read the portal, its cookies or other projects. Root-relative
  URLs (`/css/app.css`) are rewritten to the prototype's folder. Zips with `..` or absolute paths are rejected.
- Limitations: prototypes must be static files (no server code). Scripts in the prototype can't use cookies or
  `localStorage`, because of the sandbox.

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
| `APP_URL` | request host | Public URL used for links in emails, e.g. `https://review.yourstudio.com`. **Set this in production.** |
| `SMTP_URL` | unset | SMTP connection, e.g. `smtps://user:pass@smtp.example.com`. Or use `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` (`SMTP_SECURE=true` for implicit TLS). |
| `MAIL_FROM` | `Design Review Portal <no-reply@localhost>` | Sender address for notification emails. |
| `SECRET_KEY` | auto-generated file | Key used to encrypt saved mailbox passwords. If you set it, keep it stable. |
| `TRUST_PROXY` | unset | Express `trust proxy` setting when running behind a reverse proxy. |
| `INSECURE_COOKIES` | unset | Set to `1` to allow login over plain HTTP when `NODE_ENV=production` (e.g. local testing). |

Run the API tests with `npm test`.

**Forgot a password?** In the project folder, run:

```bash
npm run reset-password -- you@studio.com              # prints a new random password
npm run reset-password -- you@studio.com NewPass123   # or set one yourself
npm run reset-password                                # lists all accounts
```

This signs the account out everywhere, and it works while the portal is running.

### Sending email (Zoho Mail or Gmail)

Sign in, then open **✉️ Email settings** (top right). Pick **Zoho Mail**, **Gmail / Google Workspace** or
**Other (SMTP)**, and enter the address and app password. The portal logs in and sends you a test email before
saving, so you know right away if it works. You can switch accounts anytime. Passwords are encrypted at rest with
`SECRET_KEY`, or an auto-generated `DATA_DIR/secret.key` if that isn't set.

- **Zoho Mail:** choose the data centre you log in at (mail.zoho.com / .eu / .in / .com.au / .jp / zohocloud.ca /
  .sa), and *Business* for your own domain (uses `smtppro.zoho.*`) or *Personal* for @zoho.com (uses `smtp.zoho.*`).
  With two-factor on, create an app password under accounts.zoho.com → Security → App Passwords.
- **Gmail:** turn on 2-Step Verification, then create an app password at myaccount.google.com/apppasswords.

The `SMTP_*` environment variables are an optional server-wide fallback, used when an agency hasn't connected a mailbox.
When neither is set, emails aren't sent. They're saved as `.eml` files in `DATA_DIR/outbox/` so you can open and
check them. The project's activity log records every email sent, or the error if sending failed.

## Notes and limits
- The team link in notification emails works without signing in, so anyone who has it can change comment statuses.
  Only send it to your team.

- Clients are identified only by the name they type. That's intentional to keep things frictionless, but it means
  anyone with the link can comment, so treat the link like a password.
- Pins are stored as relative (0–1) positions on a PDF page, so they stay in place at any zoom level. Pins from earlier
  rounds are shown on the newest version at the same spot.
