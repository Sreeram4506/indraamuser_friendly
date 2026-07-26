# Indraam — landing page

Production implementation of `Indraam Landing.dc.html` (Claude Design handoff bundle).
Static site, no build step, no dependencies. Open `index.html` or serve the folder.

```
index.html              all markup for the 9 sections
css/design-system.css   the "Industry" design system — tokens + components (unmodified)
css/site.css            page styles, keyframes, section layout
js/app.js               behaviour + content data
assets/logo.png         brand mark

api/agent.js            POST /api/agent   — hero chat  ┐
api/gaps.js             POST /api/gaps    — gap finder ├ Vercel handlers
api/contact.js          POST /api/contact — order desk ┘
api/_lib/openai.js      OpenAI call — the only file that touches the API key
api/_lib/core.js        endpoint logic + prompts, host-agnostic
api/_lib/guard.js       origin allowlist, rate limit, body parsing
api/_lib/netlify.js     Netlify request/response adapter
netlify/functions/*.mjs Netlify entry points (ignore these if you deploy to Vercel)

.env.example            every environment variable, documented
```

The prototype ran on React via the design tool's runtime. This rebuild keeps the exact
visual output — tokens, spacing, timings, easing curves, copy — but ships as plain
HTML/CSS/JS so it drops into any host.

## Design system

`css/design-system.css` is the source of truth for colour, type and component look and is
copied over untouched. The page then runs a **dark inversion** of it in `css/site.css`:
`--color-neutral-900` becomes the ground and `--color-bg` (#f2f2f3) becomes the text
colour. The Process band flips back to the light ground by re-declaring `--color-text`
and `--color-divider` locally.

Retune the brand in `design-system.css`, not in `site.css`.

## The AI endpoints

The hero agent and the gap finder called the design tool's `window.claude.complete`, which
doesn't exist outside the prototype. They now call `/api/agent` and `/api/gaps` on your own
origin, which call OpenAI (`gpt-4o-mini`) server-side.

### Where the key goes

**In an environment variable on the server. Nowhere else.**

`api/_lib/openai.js` is the only file that reads `OPENAI_API_KEY`. It runs in the serverless
function, never in the browser. Do not put the key in `index.html`, `js/app.js`, or
`INDRAAM_CONFIG` — anything the browser downloads is public, and keys committed to a repo or
shipped in a bundle get scraped and billed within hours. If a key is ever exposed, revoke it
at platform.openai.com immediately rather than trying to rotate around it.

Set a **spend limit** on the OpenAI project before launch (Settings → Limits). These are
unauthenticated endpoints; a hard cap is the backstop the rate limiter can't be.

### Setup

1. `cp .env.example .env.local` and paste your key into `OPENAI_API_KEY`.
2. `npx vercel dev` — serves the page and the functions together on localhost.
3. Deploying: push the repo, then add the same variables in **Vercel → Project → Settings →
   Environment Variables** (or **Netlify → Site configuration → Environment variables**).
   `.env.local` is gitignored and never leaves your machine.

Set `ALLOWED_ORIGINS` to your real domains before going live. Unset, the endpoints answer
anyone — including someone pointing their own site at your API and spending your credit.

### Contract

| Route | Request | Response |
|---|---|---|
| `POST /api/agent` | `{ "messages": [{ "role": "user", "content": "…" }] }` (last 12 turns) | `{ "reply": "…" }` |
| `POST /api/gaps` | `{ "description": "A 6-person ops team…" }` | `{ "gaps": [{ "saving", "title", "how" }] }` (≤3) |
| `POST /api/contact` | `{ "name", "email", "note" }` | `{ "ok": true, "delivered": bool }` |

Any non-2xx and the client falls back to exactly the copy the prototype shows on failure —
the agent replies "I'm offline right now — but a human isn't…", the gap finder shows
"Couldn't map that one automatically…". The rest of the page is unaffected, so a key
problem or an OpenAI outage degrades quietly instead of breaking the site.

`/api/contact` writes to the function log unless you set `CONTACT_WEBHOOK_URL` to something
that accepts a JSON POST (Zapier, Make, a Slack incoming webhook, your CRM). Wire that
before launch or submissions only exist in logs.

### Limits already in place

Origin allowlist, per-IP rate limit (12 requests/minute, tunable), 1200 characters per
message, 12-turn conversation window, 600-character gap description, and a hard `max_tokens`
on both routes.

One caveat worth knowing: the rate limiter counts in the function instance's memory, so on
serverless it resets on cold start and isn't shared across concurrent instances. It stops
casual hammering, not a determined attacker. If the page gets real traffic, swap the `hit()`
function in `api/_lib/guard.js` for Vercel KV or Upstash Redis — same signature, ~10 lines.

## The admin dashboard

`/admin` shows everything the site collects: every question asked of the AI and the answer
it gave, every gap-finder run, and every form submission.

### Setup

1. **Atlas** → create a cluster → **Connect → Drivers** → copy the connection string into
   `MONGODB_URI`. It contains a password, so it lives in `.env.local` and the host's
   dashboard, nowhere else.
2. **Atlas → Database Access** — create a dedicated user with `readWrite` on one database.
   Don't reuse an admin/root user for this.
3. **Atlas → Network Access** — serverless functions don't have stable IPs, so this needs
   `0.0.0.0/0`. That makes the database password the only thing guarding your data; make it
   long and random.
4. `npm run secret` twice — one value for `ADMIN_PASSWORD`, one for `SESSION_SECRET`.
5. `npm install && npx vercel dev`, then open `/admin`.

Collections (`chats`, `gap_runs`, `contacts`) and their indexes are created on first write.

### How auth works

The password is exchanged for a cookie that's `HttpOnly` (JavaScript can't read it, so an
XSS bug can't steal the session), `SameSite=Strict` (not sent cross-site, which blunts
CSRF), `Secure` in production, and signed with `SESSION_SECRET` — the cookie holds only an
expiry and an HMAC over it, so it can't be forged or extended. Sessions last 7 days.
Login is limited to 8 attempts per 15 minutes per IP, on its own budget so tuning the
public `RATE_MAX` can't weaken it.

**Changing `SESSION_SECRET` signs every session out immediately.** That's your panic button
if a laptop goes missing.

This is one shared password, so there's no per-person audit trail. Fine for a single
operator; if the team grows, that's the point to move to real accounts.

### What's stored

Full transcripts with timestamps, a per-tab session ID, and coarse metadata (country from
the edge header, referrer, user agent). **No IP addresses.** The session ID lives in
`sessionStorage`, so it identifies a browser tab and dies when the tab closes — it doesn't
follow anyone between visits.

Two things this implies for you: visitors are typing into a box that records what they
write, so your privacy policy should say so; and once real submissions accumulate, the
database holds personal data (names, emails, whatever people paste into the chat) and is
subject to deletion requests. There's no retention cutoff built in — add a TTL index on
`createdAt` if you want records to expire automatically.

### Using it

Three tabs — Leads, Conversations, Gap runs — each with search and pagination. Leads can be
marked new/read/replied/archived, and the unread count drives the dashboard's alert card.
Every tab exports to CSV (formula-injection safe, so a malicious note can't execute when
you open it in Excel).

### Reliability

Logging is fire-and-forget: writes go through a wrapper that swallows its own errors. If
Atlas is unreachable, paused (the free tier auto-pauses after inactivity), or the URI is
wrong, visitors still get their AI answer and the form still accepts submissions — you just
lose that log line. The public site never depends on the database being up.

Contact submissions are persisted whether or not `CONTACT_WEBHOOK_URL` fires, so a broken
webhook costs you a notification, never a lead.

## Deploying to Netlify instead

`netlify.toml` and `netlify/functions/*.mjs` cover the three public routes — same `/api/*`
paths, same core logic, nothing else to change.

**The admin routes are Vercel-shaped only.** `api/admin/*` use Node's `(req, res)` with
`req.query` and `res.setHeader`, which Netlify's Web-API function signature doesn't provide.
Porting them means writing a `(req,res)`-to-`Response` shim for cookies, query strings and
`res.send` — straightforward, but I haven't written or tested it, so don't assume `/admin`
works on Netlify as-is. Deploy to Vercel and it all works together.

If you're on Vercel, delete the `netlify/` folder and `netlify.toml`.

## Behaviour notes

- **Boot curtain** wipes at 2s. **Scroll progress** rides the nav's bottom edge.
- **Hero** has a drifting grid, a parallax arc (0.14× scroll), a crosshair readout on
  fine pointers only, and stat counters that ease to 6 / 2 wks / 100% over 1.1s.
- **Agent panel** loops a three-turn scripted demo; the first focus, keystroke or click on
  the takeover bar hands control to the visitor and the loop stops for good.
- **Services** auto-advance every 6s until the visitor taps a chip, then stop permanently.
- Everything respects `prefers-reduced-motion`: animations collapse, the boot curtain is
  removed, reveals start visible, and the chat renders its full transcript at once.

## Accessibility

Chips are `role="tab"` with `aria-pressed`/`aria-selected`, the chat log is an
`aria-live="polite"` region, the FAQ uses `aria-expanded`, form errors are `role="alert"`,
and every interactive target clears 44px. Focus rings come from the design system's
`:focus-visible` rule.

Two things to check before launch: `--color-accent` (#5980a6) on the dark ground passes AA
for large text but not for small body copy — the page uses `--color-accent-300` for small
accent text, keep it that way. And the marquee is `aria-hidden`, so its content is
duplicated in the Services section.
