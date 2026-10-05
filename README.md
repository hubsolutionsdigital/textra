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
- The first time they open a page, a **step-by-step walkthrough** highlights each control in turn: screen sizes,
  Comment vs Interact, how to comment, the comment list, this round's focus, "Done with this page" and Submit.
  A floating **?** button (bottom-left) brings it back any time, and on the pages overview it reopens the welcome
  guide. On a phone or tablet, the design opens at that size.
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

## Quiz Arena (live quizzes)

A Kahoot-style quiz game built into the portal, aimed at UI/UX and SEO training. Open **🎮 Quiz Arena** in the
header.

**Building a quiz** (signed in): start from **UI/UX Design Showdown**, **SEO Speedrun**, **Sales Objection Dojo** or a
blank quiz. Slides sit on
the left (drag to reorder), the question in the middle, settings on the right. Everything saves automatically, and a
**⚠ to finish** list shows what's still missing before you can host. Each question has a time limit (10 s–2 min),
points (standard, double or none), an optional explanation shown after the answer, and an **animated graphic**:
12 built-in looping scenes (page building, search results, mobile app, colour palette, typography, page-speed gauge,
rank growth, layout grid, conversion funnel, crawler bot, link network, click & CTA), 8 cartoon 3D-style character
scenes for sales training (a sales call, "too expensive" with a swinging price tag, "not right now" with a ringing alarm
clock, "we use a competitor", "I'll ask my boss", "who are you?" with a trust shield, "I'll think about it" with
turning gears, and a deal-won celebration), or your own image/GIF.

Question types:

| Type | How players answer | Scoring |
| --- | --- | --- |
| 🔘 Quiz | Tap one of up to 6 coloured answers (or several, if more than one is correct) | all or nothing; multi-answer loses credit for wrong picks |
| ⚖️ True or false | Tap True or False | all or nothing |
| ↕️ Drag to order | Drag items into sequence (or use ▲▼) | per item in the right place |
| 🗂️ Sort into groups | Drag cards into 2–4 buckets | per card |
| 🔗 Match pairs | Drag answers onto their partners | per pair |
| 📍 Pin the spot | Drop a pin on a design: built-in landing page, search result, dashboard or checkout mockups, or your own screenshot. You draw the correct area in the editor. | in the area or not |
| 🎚️ Slider guess | Slide to a number | full points within ±tolerance, half within twice that |
| 🧩 Fill the gaps | Drag words (plus decoys) into the blanks | per gap |

Every drag also works as **tap, then tap** (mouse, touch, pen and keyboard), and the page auto-scrolls when you drag
near the edge of a phone screen.

**Hosting**: click **▶ Host live** and put the big screen on a projector. Players go to `/play` (or scan the QR code),
enter the 6-digit PIN, pick a nickname and avatar. Click a player in the lobby to remove them. Space or → moves the
game on: a 4-second "get ready" for each question, the question with a timer, then the reveal (answer counts, a
heat map of pins, slider guesses or an accuracy ring), the leaderboard (rows glide to their new rank) and finally an
animated podium. Players see whether they were right, points earned, streak bonuses and how far behind the next
player they are, and can send emoji reactions that float up the big screen.

Points: up to 1000 per question (2000 for double), losing up to half for answering slowly, times how right the answer
was. Fully correct answers in a row add a streak bonus (+100 for two in a row, up to +500). Answers are checked on the
server, and players never receive the correct answers until time is up. Final standings are saved under **🏆 Results**.

**Practice link**: each quiz has a 🔗 practice link for solo, self-paced play (optionally against the clock), handy for
sharing as homework. It's checked on the server too.

Live games are kept in memory, so restarting the server ends any game in progress (quizzes and results are stored).

## HTML prototypes

- Clients switch between **Desktop (1440×900), Laptop (1280×800), Tablet (768×950) and Mobile (390×750)**. Tablet
  and Mobile heights are what Safari actually gives a page on those devices (screen minus browser bars), so layouts
  sized from `vh`/`svh` match real phones. The whole screen is always shown, scaled down to fit when needed, and
  Tablet/Mobile hide desktop scrollbars like real touch devices.
- Switching screen size reloads the prototype at that size, because many pages size their layout once when they load.
  On Tablet and Mobile the page sees a matching device: screen size, touch support, a mobile user agent, and
  `(pointer: coarse)` / `(hover: none)` in `matchMedia`. CSS media queries on hover/pointer still follow your computer.
- **Comment / Interact** switch: in Comment mode, a click pins a comment to the exact element. In Interact mode, menus,
  sliders, links and forms work normally.
- Pins are anchored to the element (plus the click position inside it), so they follow scrolling, sticky headers and
  animations, and still land in the right place at other screen sizes. Each comment records the screen size it was left
  on. If its element isn't visible at the current size, the sidebar says so, and clicking it jumps to that size.
- **Multi-page zips become one review page per HTML file.** Top-level pages are ordered by the home page's menu,
  and `index.html` is named "Home". All of them share the one upload, so images aren't duplicated. Uploading a new
  version of the zip on any of those pages updates them all, and any new HTML page becomes a new review page. Links
  between pages still work inside the viewer, and pins only show on their own page.
- Safety: prototypes are served from `/sites/<random token>/` with a `Content-Security-Policy: sandbox` header and a
  sandboxed iframe (no same-origin), so their scripts can't read the portal, its cookies or other projects. Root-relative
  URLs (`/css/app.css`) are rewritten to the prototype's folder. Zips with `..` or absolute paths are rejected.
- Limitations: prototypes must be static files (no server code). Scripts in the prototype can't use cookies or
  `localStorage`, because of the sandbox.

## Stack

- **Server:** Node ≥ 22.5, Express 5, built-in `node:sqlite`, and multer for uploads. Files are stored on disk in `data/`.
- **Web:** React 19 + Vite, with `pdfjs-dist` for rendering PDFs to canvas, `canvas-confetti`, and `qrcode` for the
  quiz lobby. Live quizzes use Server-Sent Events (no extra server dependency).

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

## Deploying

The portal is one Node server that keeps its database and uploaded files on disk (`DATA_DIR`). It needs a host
that runs a long-lived server with a **persistent volume**. Serverless hosts such as Vercel won't work: they have no
lasting disk (projects and uploads would vanish), and they cap request size at a few MB (PDF and zip uploads would fail).

The included `Dockerfile` runs anywhere containers do. Railway (`railway.json` is included), Render and Fly.io all
work. Steps for Railway:

1. **New Project → Deploy from GitHub repo**, and pick this repository and the branch to deploy.
2. Add a **Volume** to the service, mounted at **`/data`**.
3. Under **Variables**, set:
   - `APP_URL` = `https://review.yourdomain.com`
   - `SECRET_KEY` = a long random string (e.g. from `openssl rand -base64 32`). Keep it, and never change it.
   - `TRUST_PROXY` = `true`
   - `SIGNUP_EMAIL_DOMAINS` = `yourdomain.com` (lets teammates with that email domain create accounts)
4. **Settings → Networking → Custom Domain**: add `review.yourdomain.com`, then create the CNAME record it shows you
   at your domain's DNS provider. HTTPS is set up automatically.
5. Open the site and create the first account. That one is always allowed, and sign-ups are then limited by
   `SIGNUP_EMAIL_DOMAINS`.
6. Connect Zoho Mail or Gmail under **Email settings**. The test email confirms that your host allows outgoing mail;
   some hosts block email ports on cheaper plans.

Run a **single instance** (SQLite and uploads live on one volume) and back up the volume regularly.
`npm run reset-password` works from the host's shell or console.

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
| `SIGNUP_EMAIL_DOMAINS` | unset | After the first account, only emails on these domains can sign up, e.g. `yourstudio.com`. |
| `ALLOW_SIGNUPS` | unset | Set to `true` to let anyone create an agency account. |
| `INSECURE_COOKIES` | unset | Set to `1` to allow login over plain HTTP when `NODE_ENV=production` (e.g. local testing). |

Run the API tests with `npm test`.

**Forgot a password?** In the project folder, run:

```bash
npm run reset-password -- you@studio.com              # prints a new random password
npm run reset-password -- you@studio.com NewPass123   # or set one yourself
npm run reset-password                                # lists all accounts
```

This signs the account out everywhere, and it works while the portal is running.

### Sending email

**On Railway's Trial or Hobby plan, use ZeptoMail (by Zoho) or Resend.** Railway blocks outgoing SMTP (ports
465/587) below the Pro plan, so Zoho Mail and Gmail can't connect there. ZeptoMail and Resend send over HTTPS, which
always works:

- **ZeptoMail:** at zeptomail.zoho.com, add and verify your domain (DNS records), then copy the agent's
  *Send Mail token* (Mail Agents → SMTP/API → API). In the portal, choose ZeptoMail, pick the same data centre as your
  Zoho account, send from an address on that domain, and paste the token.
- **Resend:** at resend.com, verify your domain, then create an API key and paste it.

Zoho Mail / Gmail over SMTP:

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
