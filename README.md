# Personal site

Astro 7 + TypeScript + Tailwind, deployed to Vercel with server-side rendering. Site content (projects, blog posts, short links, and the whole About page) lives in a **Neon Postgres** database and is managed through an **admin portal** at `/admin`, secured with [Better Auth](https://better-auth.com). Uses Bun as the package manager.

## Quick start

```bash
bun install
cp .env.example .env   # fill in DATABASE_URL and BETTER_AUTH_SECRET
bun dev
```

Then open <http://localhost:4321>. The admin portal is at <http://localhost:4321/admin>.

## Database

Content and admin accounts both live in a [Neon](https://console.neon.tech) Postgres database. Put its **connection string** in `DATABASE_URL` (locally in `.env`, and on Vercel under _Settings → Environment Variables_), and set `BETTER_AUTH_SECRET` to a long random value (`openssl rand -base64 32`) in the same places.

The database holds these tables: `projects`, `blog_posts`, `banners`, `redirects`, and `site_content` (a key/value row per editable field, such as `about.heading`) for site content, plus `user`, `session`, `account`, and `verification` for Better Auth, plus `login_attempts` for login throttling.

`login_attempts` is created automatically on the first login attempt (`create table if not exists`), so there is nothing to run by hand — but the database role in `DATABASE_URL` needs permission to create tables. If it doesn't have that, logins will fail closed rather than fall back to being unthrottled.

## Environment variables

| Variable             | Required   | Purpose                                                                                                              |
| -------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`       | yes        | Neon Postgres connection string                                                                                      |
| `BETTER_AUTH_SECRET` | yes        | Signs admin sessions; changing it logs every device out. Must be 32+ characters, and placeholder values are rejected |
| `BETTER_AUTH_URL`    | production | Pins the canonical origin. Set it in the Vercel **production** environment and leave it unset for previews           |
| `UPLOADTHING_TOKEN`  | no         | Enables image uploads from the admin editor (UploadThing → API Keys)                                                 |

Setting `BETTER_AUTH_URL` in production matters for more than tidiness: when it is unset, the origin the admin portal checks requests against is derived from the `Host` header, which anyone can set on the `*.vercel.app` deployment URL.

## Admin portal

Sign in at `/admin` with your email and password. From there you can:

- **Projects** — create, edit, publish/unpublish, and delete projects. Page content is written in Markdown; links placed above a `---` divider become the button row at the top of the project page.
- **Blog** — write posts in Markdown with live preview, tags, publish dates, and an optional featured project.
- **Redirects** — manage `paulsavvas.com/redirect/<slug>` short links.
- **Banners** — full-width announcements above the navigation, written in Markdown with a colour, an on/off switch, and a stacking order. Choose where each one shows (all pages, home only, or a hand-picked set of pages including individual projects and blog posts); several can be active at once. Anything longer than two lines gets a "Learn more" button that expands it.
- **About page** — edit every section of `/about`: the label, headline, and intro, both cards, the "Now" blurb, and the buttons under it. Clearing a field restores that section's built-in copy, so the page can never come out blank.
- **Account** — change your password (which signs other devices out).

Markdown extras: `![alt](url)` images are laid out automatically (pairs become a two-column grid), and YouTube/Vimeo links become embedded players.

With `UPLOADTHING_TOKEN` set, the Markdown editor gets an **Insert image** button, and you can also paste or drag & drop images directly into the editor — they upload to UploadThing and the Markdown is inserted at the cursor.

Projects have a **Created entirely with AI** checkbox for fully AI-generated ("vibe-coded") work — it adds a small click-to-expand disclosure on the project page.

### Authentication

Better Auth stores the owner account, its password hash, and active sessions in the same Neon database (`user`, `session`, `account`, and `verification` tables).

The portal is deliberately single-account and closed. Three separate things enforce that: `emailAndPassword.disableSignUp` turns registration off in Better Auth itself, Better Auth's HTTP handler isn't mounted at all (the site calls `auth.api.*` server-side, so no `/api/auth/*` routes exist to reach), and a database hook rejects the creation of a second user.

How the portal is protected:

- **Session gate** — `src/middleware.ts` requires a session for everything under `/admin` except the login page, and every admin page and API route re-checks it, so no route depends on that one gate alone.
- **Login throttling** — `src/lib/login-throttle.ts` allows 10 failures per email address and 20 per IP in a rolling 15-minute window, then locks that identifier out for 15 minutes. Better Auth's own rate limiter is router middleware and doesn't run on the server-side `auth.api.signInEmail()` call the login page uses, so this covers it instead. Counters live in Postgres because each serverless invocation gets its own memory.
- **Cross-origin rejection** — state-changing `/admin` requests must carry an `Origin` header matching the site. The admin forms write to the database directly and never pass through Better Auth's own origin check, so without this the only defence would be the session cookie's `SameSite` default.

One trade-off worth knowing: because the throttle keys on the email address, someone who knows the owner's address can deliberately trigger a 15-minute lockout. That is the accepted cost of bounding password guessing on a single-account portal.

Everything saves straight to Postgres and appears on the live site immediately — no rebuild needed. New items start as **drafts**; flip visibility to **published** when ready.

## Scripts

- `bun dev` — start the dev server
- `bun run build` — build for production
- `bun preview` — preview the production build locally
- `bun format` / `bun format:check` — Prettier

## Deployment

Optimized for Vercel with the `@astrojs/vercel` adapter. Connect the repo to Vercel, add the environment variables above, and deploy.
