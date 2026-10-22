# GTHubX — Build Log

*The living checklist. Updated as work progresses (master prompt §3).*

## Phase status

| Phase | Scope | Status |
|---|---|---|
| **0. Audit + plan** | BRIEF · AUDIT · ARCHITECTURE · PLAN | ✅ 2026-10-11 |
| **1. Scaffold + design system** | Next 16 app · brand tokens · primitives · public shell | ✅ 2026-10-11 |
| **2. Database + engine** | Prisma schema · migration · seed · port Aglotrends engine · integer-cents money | ✅ 2026-10-14 |
| **3. Auth + RBAC** | Sessions · register/login/reset · RBAC matrix (6 roles) · rate limiting · MFA | ✅ 2026-10-14 |
| **4. Client portal** | dashboard · copy · packages · network · wallet · community · KYC · support | 🟡 2026-10-14 — portal core landed; wallet/network/packages/copy gated |
| **5. Admin + Superadmin** | ops admin + superadmin (roles · settings · integrations · audit · reports) | 🟡 2026-10-14 — auth, RBAC gate, dashboard/users/audit/team/role editor/site settings/community moderation/reports landed; KYC (needs Henry), content, finance pending |
| **6. Engine integration** | referral tree · commissions · ranks · pools · payouts · immutable ledger | ✅ 2026-10-18 — **6a** money-write spine · **6b** rank milestones · **6c** payouts · **6d** flagged-award admin flow; closed, all four smoke-proven |
| **7. Integrations** | payments · email · WhatsApp/Telegram · KYC adapters + webhooks | 🟡 2026-10-18 — **7a** Pay2Crypto rail · **7b** Resend mail layer · **7c** KYC pipeline + the withdrawal gate it enforces · **7d** identity minimisation + read-access audit + retention. WhatsApp/Telegram deferred pending the Notification writer. |
| **8. Hardening + deploy** | OWASP · a11y (WCAG 2.2 AA) · responsive · SEO · perf · aaPanel · backups | ⬜ |

## Phase 1 — done (2026-10-11)

**Stack:** Next.js 16.4.0 · React 19.3.0 · TypeScript strict · Tailwind 4 · Zod 4 ·
Vitest 5 · pnpm 11.12.0. Dev/start port **3500**. Git repo `main` (uncommitted).

**Brand tokens** (`app/globals.css`, single re-skin point): background `#0b1220`,
gold `#d4a72c` (brand), emerald `#18a66a`, surfaces/borders/text/motion.
**Fonts:** Sora (display) · Manrope (body) · JetBrains Mono.

**Files created**
```
package.json tsconfig.json next.config.ts eslint.config.mjs vitest.config.mts
pnpm-workspace.yaml .gitignore .env.example next-env.d.ts
app/globals.css app/layout.tsx app/page.tsx app/not-found.tsx app/robots.ts app/sitemap.ts
components/ui/{button,card,badge}.tsx
components/site/{logo,navbar,footer,reveal}.tsx
components/home/{hero,pillars,final-cta}.tsx
lib/utils.ts
tests/utils.test.ts
```

**Verification**
| Gate | Result |
|---|---|
| `pnpm install` | ✅ 380 packages |
| `pnpm typecheck` | ✅ clean |
| `pnpm test` | ✅ **6/6 green** (utils: cn, slugify, truncate, formatPrice) |
| `pnpm build` | ✅ clean — 4 routes (`/`, `/_not-found`, `/robots.txt`, `/sitemap.xml`) |
| Live smoke (`next start` :3500) | ✅ `/` 200 (60KB, brand + slogan present) · `/robots.txt` 200 · `/sitemap.xml` 200 · unknown → 404 |

**Bug found + fixed:** reused `slugify` had dead alternation — the first `replace`
stripped `_` before the later `[\s_-]+` could convert it, so `"A_B"` → `"ab"`.
Fixed to keep `_` through the first pass.

**Known limitations:** no DB/auth/money yet (Phase 2+). Public nav links to routes that
do not exist yet (copy-trading, packages, traders, community, network, education, about,
contact, faq, blog, login, register) — they will 404 until built. **Nothing committed.**

## Brand rename — done (2026-10-14)

Company name corrected **Global Trade Hub → Global Traders HubX** across **13 files /
29 occurrences** (code, docs, env). The two deliberate ALL-CAPS wordmarks in
`docs/BRAND.md` (hero + brand summary) restored as `GLOBAL TRADERS HUBX`; logo
monogram updated **GTH → GTHX** (`BRAND.md` §13). Slug test updated on **both** sides:
`slugify("Global Traders HubX!")` → `global-traders-hubx`.

Repo/package name `gthubx` and domain `gthubx.com` unchanged — still the acronym.

| Gate | Result |
|---|---|
| `pnpm typecheck` | ✅ clean |
| `pnpm test` | ✅ 6/6 green |
| Live smoke (`next dev` :3500) | ✅ title / footer / meta updated, old name absent |

## Phase 2 — done (2026-10-14)

**Decisions locked.** Decision A = **no-custody** — the platform never holds client funds;
packages are non-custodial participation tiers; referral rewards derive from product revenue,
never recruitment. Henry authorised a scoped reference to **COPINEX** + **Aglotrends** for reuse.

**Engine ported** — Aglotrends `packages/engine` → `lib/engine` (11 modules: `constants`,
`types`, `money`, `allocation`, `network`, `compression`, `bonuses`, `matrix`, `ranks`,
`pools`, `index`), adapted to GTHubX conventions (double quotes, extensionless relative
imports). Tests → `tests/engine` (10 files, importing `@/lib/engine`) plus a new
`tests/money.test.ts`.

**Money model:** integer **cents** (`Int`) throughout — no `Float`, no `Decimal`.
`Package` / `PackageSubscription` deliberately carry **no return/APY fields**.

**Business model (set 2026-10-14):** registration fee **$50** + platform fee **$5**
(gross **$55**). These are GTHubX's own numbers — `REGISTRATION_FEE_CENTS=5000`,
`PLATFORM_FEE_CENTS=500`, `REGISTRATION_GROSS_CENTS=5500`. The **$5 is per gateway
payment** (registration, deposits, package payments), not per-registration. The
**agreed sharing formula** (45/55 top split; community 30/10/8/7; generation
4/2/1.5/1.5/1) is applied to the $50 base. Derived figures: reserve 45% = $22.50,
community pool 55% = $27.50 (direct referral $15.00 / generation $5.00 / rank $4.00 /
leadership $3.50); generation bonuses $2.00 / $1.00 / $0.75 / $0.75 / $0.50. Rank
milestone rewards are **absolute amounts, not fee-derived** — unchanged.

**Files created**
```
prisma/schema.prisma        # Decision A, ~45 models, integer cents
prisma.config.ts            # Prisma 7 — datasource URL lives here, not in schema
lib/prisma.ts               # PrismaClient + PrismaPg adapter singleton
lib/money.ts                # cents <-> display bridge
lib/engine/*.ts             # 11 modules
tests/engine/*.test.ts      # 10 files
tests/money.test.ts         # 11 tests
.env                        # gitignored
```
Modified: `package.json` (`db:*` scripts, `dotenv` + `tsx` devDeps), `.gitignore` (`/lib/generated/`).

**Verification**
| Gate | Result |
|---|---|
| `pnpm typecheck` | ✅ clean |
| `pnpm test` | ✅ **88/88 green** (12 files) |
| `prisma validate` | ✅ valid — 2 relation errors found + fixed |
| `prisma generate` | ✅ client → `lib/generated/prisma` |

**Gate 1 cleared (2026-10-14).** `gthubx` role + `gthubx` / `gthubx_test` DBs created on
PG16 `:5433`; `CREATEDB` granted (needed for the migrate shadow DB); `.env` filled.

| Gate | Result |
|---|---|
| `prisma migrate dev --name init --create-only` | ✅ `20261014101705_init` (45 KB) |
| migration audit | ✅ 50 tables · 36 enums · 121 indexes · **all money `INTEGER`** |
| `prisma migrate deploy` | ✅ applied · recorded in `_prisma_migrations` |
| live schema | ✅ 51 tables (50 + `_prisma_migrations`) · 36 enums |
| `pnpm db:seed` | ✅ 2 pools · 4 settings · 15 nav items — **idempotent** (re-run = same counts) |

**Seed scope:** authoritative data only — bonus pools (RANK/LEADERSHIP), site settings
(identity / contact / compliance / social), navigation (PLAN §2 inventory). **Not seeded**
(needs Henry's business input, not invention): Packages, Brokers, Traders, Testimonials,
FAQ / blog content. Admin / User accounts deferred to Phase 3 (auth + hashing).

## Phase 3 — done (2026-10-14)

**Scope:** user + admin sessions, register / login / logout / verify-email / forgot-password /
reset-password, RBAC matrix (6 admin roles), rate limiting, audit trail, email stub.
**MFA scaffold deferred to Phase 8** (hardening) — not needed to unblock Phase 4.

**Auth model.** Two independent session tables — `UserSession` (cookie `gthubx_session`) and
`AdminSession` (cookie `gthubx_admin`). Tokens are 32-byte base64url random, stored **hashed**
(SHA-256); the raw token exists only in the cookie / email link. Sessions: 7-day TTL,
httpOnly + sameSite=lax, revocable. Passwords: **bcrypt cost 12**, capped at 72 bytes
(bcrypt silently truncates past that — the validator enforces the cap).

**RBAC.** 20 permissions across 6 `AdminRole`s; `permissionForAdminPath` **fails closed**
(unknown path → `null` → denied). Tests assert no non-super role reaches `team` / `settings` / `audit`.

**Files created**
```
lib/auth.ts lib/rbac.ts lib/password.ts lib/tokens.ts
lib/validators.ts lib/rate-limit.ts lib/audit.ts lib/http.ts
lib/notifications/email.ts
app/api/auth/{register,login,logout,verify-email,forgot-password,reset-password}/route.ts
app/(auth)/layout.tsx
app/(auth)/{login,register,forgot-password,reset-password,verify-email}/page.tsx
app/dashboard/page.tsx              # Phase 3 placeholder — Phase 4 replaces
components/auth/{form-field,login-form,register-form,forgot-password-form,
                 reset-password-form,verify-email-panel}.tsx
tests/auth/{rbac,password,tokens,validators}.test.ts
```
Modified: `package.json`, `pnpm-lock.yaml` (`sonner`).

**Design notes**
- **Register:** rate-limit → validate → 409 on duplicate → `referralCode` resolves to the
  **sponsor's user id** (`User` has no code column) → user created `status=PENDING` →
  `UserSession` purpose `EMAIL_VERIFY`, 24 h TTL. `Referral` / `MatrixPosition` rows are
  **engine-owned — created in Phase 6**, not here.
- **Login:** timing-equalised (dummy bcrypt compare when the email is unknown, so response
  time does not leak existence); `SUSPENDED` → 403; `PENDING` may still sign in (they need a
  session to reach the verify screen).
- **Forgot-password:** always returns the same ok response — no account enumeration.
- **Reset-password:** revokes **all** of the user's sessions in the same transaction.
- **Email stub:** logs the link in dev; in prod returns `{delivered:false, reason}` rather than
  faking success. Real SMTP lands in Phase 7.
- **Rate limits** (in-memory fixed window, single-process — swap for Redis behind the same
  signature if horizontally scaled): login 10/15 m · register 5/1 h · forgot 5/1 h ·
  reset 10/1 h · verify 10/1 h.
- **Audit** (`recordAudit`) **throws on failure by design** — a trail that silently drops
  entries looks complete while lying.

**Verification**
| Gate | Result |
|---|---|
| `pnpm typecheck` | ✅ clean |
| `pnpm test` | ✅ **121/121 green** (88 engine + 33 auth) |
| Live E2E smoke (`next dev` :3500, real PG) | ✅ **13/13** — see below |

Live smoke — real HTTP, real Postgres, real cookies, real bcrypt (no mocks):
```
POST /api/auth/register        201   POST /api/auth/login           200  (pre-verify)
[email:dev] verify-email?token=…     POST /api/auth/verify-email    200
POST /api/auth/login           200   GET  /dashboard                200  (session)
POST /api/auth/logout          200   GET  /dashboard                307 → /login 200
POST /api/auth/register        409   (duplicate email)
POST /api/auth/login           401   (wrong password)
POST /api/auth/forgot-password 200   (ghost email — non-enumerating)
POST /api/auth/register        400   (weak password)
```

## Phase 4 — portal core done (2026-10-14), gated remainder

**Landed.** Member portal chrome + six working surfaces. Two commits: `0676241` (shell,
overview, settings, verification, notifications) and `c1e404e` (transactions, support,
community).

**Guard placement.** `requireUser()` sits in `app/dashboard/layout.tsx`, not in each page —
so no future child route can forget it. Same reasoning as `requireAdminPermission` on the
admin side: *an action is an entry point, not a helper.*

**Surfaces**

| Route | Reads | Writes |
|---|---|---|
| `/dashboard` | wallet, sponsor, downline count, unread, ledger tail, open tickets | — |
| `/dashboard/transactions` | `LedgerEntry` paginated (25/page) | — |
| `/dashboard/support` · `/new` · `/[id]` | `SupportTicket` + `SupportMessage` | `POST /api/support`, `POST /api/support/[id]/messages` |
| `/dashboard/community` | `CommunityPost` + `CommunityComment` | `POST /api/community/posts`, `POST …/[id]/comments` |
| `/dashboard/verification` | `User.kycStatus` | — |
| `/dashboard/notifications` | `Notification` | `POST /api/account/notifications/read-all` |
| `/dashboard/settings` | full `User` row | `PATCH /api/account/profile` (name/phone/country only) |

**Deliberate absences — nothing renders that does nothing:**
- No wallet / network / packages / copy nav entries until those routes exist (PLAN §3
  forbids decorative dead links).
- No like, edit, delete or moderation controls on community posts — those are Phase 5.
- Verification page states out loud that document upload arrives in Phase 7 rather than
  shipping a form that posts nowhere.
- Overview wallet card says *"No wallet has been opened on this account yet"* instead of
  inventing a balance.

**Security posture**
- Another member's ticket id is **404, not 403** — a permission error would confirm the id
  is real.
- Comments cannot thread onto `HIDDEN`/`REMOVED` posts; moderated content is not reachable
  through the back door.
- `PATCH /api/account/profile` cannot touch email, role, status, kyc or sponsor.
- Rate limits: profile 20/15m · tickets 10/h · replies 30/h · posts 10/h · comments 30/h.

**Bug found live that unit tests could not see:**
`toLocaleDateString` rejects `dateStyle` + `timeStyle` (and silently drops `hour`/`minute`).
The ticket thread 500'd on a real request while all 121 tests were green — the list branch
was never executed because no notifications or messages existed. Both date-time renderers
moved to `toLocaleString`. Smoke test now seeds a notification row via `psql` specifically so
that branch runs.

**Verification**
| Gate | Result |
|---|---|
| `pnpm typecheck` | ✅ clean |
| `pnpm test` | ✅ **121/121 green** |
| Live smoke (part 1, `0676241`) | ✅ **15/15** |
| Live smoke (part 2, `c1e404e`) | ✅ **23/23** — incl. cross-member 404s and the seeded-notification branch |

**Gated — needs Henry or Phase 6**
- **Wallet** — page can render a real zero-balance, but has nothing to *do* until the
  ledger moves (Phase 6).
- **Network** — `Referral` / `MatrixPosition` are engine-owned, created in Phase 6.
- **Packages / copy trading** — blocked on Henry's package tiers, broker list and trader list.

## Phase 5a — admin foundation (2026-10-14)

**Landed**
- `lib/validators.ts` — `adminLoginSchema` (reuses `loginSchema`), `AdminLoginInput`.
- `lib/rate-limit.ts` — `adminLogin` 5 / 15 min, `resetRateLimit` on success.
- `POST /api/admin/login` — timing-equalised, `createAdminSession` + `setAdminSessionCookie`,
  `lastLoginAt`, 401 for bad credentials, 403 for inactive, 429 on throttle.
- `POST /api/admin/logout` — `logoutAdmin()`.
- `prisma/seed-admin.ts` + `pnpm db:seed:admin` — idempotent admin bootstrap.
  Credentials from `ADMIN_EMAIL`/`ADMIN_NAME`/`ADMIN_ROLE`/`ADMIN_PASSWORD`; if the
  password is absent a strong one is generated and printed **once**. An existing email
  is never touched, so re-running cannot lock anyone out. Relative imports + explicit
  `PrismaPg` adapter, matching `prisma/seed.ts` (`@/` aliases do not resolve under tsx).
- `components/admin/{nav-items.ts,shell.tsx,login-form.tsx}` — chrome with role-filtered nav.
- `app/admin/login/page.tsx` — deliberately outside `(protected)` so it is not guarded.
- `app/admin/(protected)/layout.tsx` — calls `requireAdmin()`, renders `AdminShell`.
  **Auth is enforced once, here**, so no child page can forget it.
- `app/admin/(protected)/page.tsx` — dashboard, real counts (members by status, KYC in
  review, open tickets, active admins) + newest-members table. Guard: `requireAdminPermission("dashboard")`.
- `app/admin/(protected)/users/page.tsx` — paginated member list, search by name/email.
  Guard: `requireAdminPermission("users")`.
- `app/admin/(protected)/audit/page.tsx` — read-only `AuditLog` reader, admin + system actors.
  Guard: `requireAdminPermission("audit")`.

**Guard model.** Nav filtering is a courtesy; **the page guard is the gate**. Each page
calls `requireAdminPermission`, and `permissionForAdminPath` fails closed — an unknown
path yields `null`, so a new route can never accidentally ship wide open. Roles were
exercised live, not assumed: `SUPPORT_ADMIN` opens `/admin` and `/admin/users` but is
307'd off `/admin/audit`, and its nav hides the Audit link it cannot reach.

**Harness bug found (not an app bug).** First smoke reported 5 failures of the form
"expected 307, got 200." The server was returning the correct `307 location: /admin/login`
all along — PowerShell 5.1's `Invoke-WebRequest -MaximumRedirection 0` silently follows
the redirect and hands back the final 200. Every guard therefore *looked* like a
pass-through. **Smoke now runs on `curl.exe --max-redirs 0` with cookie jars**, and gates
app readiness on a rendered `GET / == 200` rather than on a bare listening socket (a stale
listener answers instantly and makes a cold boot look instant).

**Verification**
| Gate | Result |
|---|---|
| `pnpm typecheck` | ✅ clean |
| `pnpm test` | ✅ **121/121 green** |
| `pnpm db:seed:admin` ×2 | ✅ creates, then reports "already exists" without resetting |
| Live smoke (cold start, port provably free) | ✅ **25/25** — anon gate, bad/unknown creds 401, SUPER_ADMIN full access, SUPPORT_ADMIN partial access + 307 on `/admin/audit`, nav filtering both directions, admin↔member session isolation, member creds rejected by admin login, logout re-gates |

**Seeded for the smoke (dev DB only):** `admin@smoke.local` (SUPER_ADMIN),
`support-admin@smoke.local` (SUPPORT_ADMIN).

## Phase 5b — superadmin team management (2026-10-14)

**Landed**
- `PATCH /api/admin/team/[id]` — change an admin's role and/or suspend/restore access.
  Route re-checks `hasPermission(role, "team")` on its own: the page guard is a
  convenience, not a boundary.
- `updateAdminSchema` + `ADMIN_ROLES` in `lib/validators.ts` — rejects an empty patch
  rather than writing a meaningless audit entry.
- `app/admin/(protected)/team/page.tsx` — admin accounts, active-superadmin count, a
  warning card when only one active SUPER_ADMIN remains, per-row permissions count.
- `components/admin/team-actions.tsx` — role select + suspend/restore; **your own row is
  read-only in the UI and refused again by the API** (blocked at both layers, not one).
- Nav: Team → `/admin/team`, permission `team` (**SUPER_ADMIN only**).

**Lockouts enforced server-side:** editing your own role, deactivating yourself, empty
patch → 400; unknown id → 404. Deactivation needs no session revocation — `getCurrentAdmin`
refuses inactive admins, so a live cookie goes inert on the next request.

**Honest note on the "last SUPER_ADMIN" guard:** it is written but **unreachable today**.
Only SUPER_ADMIN holds `team`, and `getCurrentAdmin` only returns active admins, so an
actor editing anyone else always leaves at least themselves standing. Kept because it
becomes load-bearing the moment a non-superadmin role is granted `team` — flagged in the
source comment rather than sold as protection.

**Verification**
| Gate | Result |
|---|---|
| `pnpm typecheck` | ✅ clean |
| `pnpm test` | ✅ **121/121 green** |
| Live smoke (cold start + verified clean shutdown) | ✅ **40/40** |

Smoke coverage beyond Phase 5a: a **fresh CONTENT_ADMIN is created per run** (unique email,
via `pnpm db:seed:admin`), proved blocked from `/admin/team`, `/admin/users` and `/admin/audit`,
then promoted to SUPER_ADMIN and proved unblocked **on the next request** — permission
change observed live, no DB reset, fully re-runnable. Plus all four lockout refusals, a
re-login confirming the refused self-edit mutated nothing, and the promotion appearing on
the audit page (end-to-end, no SQL).

**Two harness bugs fixed alongside** (both would have produced false signal):
1. `pnpm db:seed:admin` inherited the shell's cwd and died with
   `ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND` — now wrapped in `Push-Location $root`.
2. Stale listeners survived `taskkill /PID` and served results from old code. The script
   now frees the port with `Stop-Process`, **verifies it is free or aborts**, and re-frees
   it on shutdown.

## Phase 5b — site settings (2026-10-14)

**Landed**
- `lib/site-settings.ts` — allowlist + editor shapes for the four seeded keys
  (`site.identity`, `site.contact`, `site.compliance`, `site.social`).
- `PATCH /api/admin/settings/[key]` — three independent gates (admin · `settings`
  permission · allowlisted key). An unknown key is a **404, not a write**; a
  non-object value and an oversized payload are 400s.
- `app/admin/(protected)/settings/page.tsx` + `components/admin/settings-form.tsx` —
  `fields` mode for known string properties, `json` mode for `site.social`.
  `fields` mode starts from the live value so it never wipes keys it does not render;
  `json` mode refuses to save invalid JSON rather than silently dropping it.
- Nav: Settings → `/admin/settings`, permission `settings` (SUPER_ADMIN only).

**Why fail-closed.** Arbitrary-key writes would let an admin create settings nothing
reads and would make the audit trail undiffable. A missing allowlisted key refuses to
save instead of inventing a record the site does not expect — the page says to re-seed.
`site.compliance` holds the risk and custody disclosures, so every save is
superadmin-only and audit-logged with before/after.

**Verification**
| Gate | Result |
|---|---|
| `pnpm typecheck` | ✅ clean |
| `pnpm test` | ✅ **121/121 green** |
| Live smoke (cold start + verified clean shutdown) | ✅ **48/48** |

Settings coverage: superadmin reaches `/admin/settings`, `SUPPORT_ADMIN` is 307'd, a
valid save returns 200, unknown key 404, non-object value 400, missing permission 403,
**the saved value round-trips into the rendered form**, and the change appears on the
audit page.

## Phase 5b — community moderation (2026-10-14)

**The gap this closes:** Phase 4 let members publish posts and comments, but no admin
could take anything down. Members had a megaphone with no mute button.

**Landed**
- `PATCH /api/admin/community/posts/[id]` — visibility (`PUBLISHED`/`HIDDEN`/`REMOVED`)
  and `isPinned`; `PATCH /api/admin/community/comments/[id]` — visibility only.
- `updateCommunityPostSchema` / `updateCommunityCommentSchema`; status values **derived
  from the generated Prisma enum** (`Object.values(PostStatus)`) so the validator, the
  controls and the schema cannot drift apart.
- `app/admin/(protected)/community/page.tsx` — posts + comments with status filter chips
  carrying live counts; `components/admin/community-actions.tsx` renders exactly the
  transitions *away* from the current state, so the buttons cannot invent a state.
- Nav: Community → `/admin/community`, permission `community` (SUPER_ADMIN, CONTENT_ADMIN,
  SUPPORT_ADMIN).
- `POST /api/community/posts/[id]/comments` now returns `id`, mirroring the post route.

**No migration was needed.** `PostStatus` already had `HIDDEN`/`REMOVED` and the member
feed already filtered on `status: "PUBLISHED"` — moderation takes effect on the member's
next request with **zero member-side change**.

**Moderation is non-destructive by design.** `REMOVED` hides a post from members the same
way `HIDDEN` does, but the row survives and any state restores to `PUBLISHED`. Because
nothing is deleted, there is no destructive control and no "are you sure" gate to get
wrong. Content is never destroyed from this surface.

**Verification**
| Gate | Result |
|---|---|
| `pnpm typecheck` | ✅ clean |
| `pnpm test` | ✅ **121/121 green** |
| Live smoke (cold start + verified clean shutdown) | ✅ **68/68** |

Smoke creates the probe post and comment **through the real Phase 4 member API** rather
than seeding SQL, then proves the full round-trip: visible on the member feed → hidden
and **gone from the feed** → removed → restored and **back on the feed** → pinned. Plus
comment hide/restore, `TRADER_ADMIN` 307'd off the page and 403'd by the API, unknown id
404, empty patch 400, and the change visible on the audit page.

## Phase 5b — reports (2026-10-14)

**What this is:** the dashboard answers "what is true right now"; reports answers "how
has it moved". Every figure is aggregated from live rows on each page load — no chart
library, no sample numbers, and the page says so in plain text at the bottom.

**Landed**
- `app/admin/(protected)/reports/page.tsx` — membership breakdown, KYC + email
  verification, account roles, **daily signup series** (7/30/90 day), top countries,
  support queue (by status and priority, plus the oldest open ticket and its age),
  community by status, admin activity by audited action.
- `lib/reports.ts` — `dayKey` + `dailySeries`, extracted from the page **so they can be
  tested at all** (a server component is unreachable from Vitest).
- `tests/reports.test.ts` — 8 tests. The load-bearing one: **a day with no activity must
  render as zero, not vanish**. A gap that disappears reads as "the data ends here" and
  makes a quiet day indistinguishable from missing data.
- Nav: Reports → `/admin/reports`, permission `reports` (SUPER_ADMIN, FINANCE_ADMIN,
  NETWORK_ADMIN).

**Two assertion traps caught live**
1. **React splits interpolated prose with comment nodes.** `Last {days} days` renders as
   `Last <!-- -->7<!-- --> days`, so matching on the sentence failed while the code was
   right. The active range is now also exposed as `data-range={days}` — **assert on
   attributes, not interpolated text**.
2. **My own test expectation was backwards** (series runs oldest→newest, so `[1,0,2]`,
   not `[0,2,1]`). The code was correct; the assertion was not.

**Verification**
| Gate | Result |
|---|---|
| `pnpm typecheck` | ✅ clean |
| `pnpm test` | ✅ **129/129 green** (17 files, +8 reports) |
| Live smoke (cold start + verified clean shutdown) | ✅ **74/74** |

Reports coverage: superadmin reaches the page; `TRADER_ADMIN` and `SUPPORT_ADMIN` (neither
holds `reports`) are 307'd; `?days=7` selects the 7-day range; an unknown `?days=99999`
falls back to 30 rather than producing an empty chart; the live-data statement is present.

## Public site — dead-link fix (2026-10-15)

**The defect.** `curl` against a live server showed **15 of the 18 advertised public URLs
returning 404**. Only `/`, `/login` and `/register` resolved. Every visitor who clicked
Copy Trading, Packages, Traders, Community, Network, Education, About, Contact, FAQ, Blog
or any of the four legal pages landed on a 404.

**Root cause — three hand-maintained lists, plus a fourth nobody read.** `navbar.tsx` and
`footer.tsx` each hardcoded their own link arrays, `prisma/seed.ts` held a third copy, and
the `NavigationItem` table those seed rows filled **was read by nothing**. The copies had
already diverged: the footer said `/legal/terms` while the seed said `/terms`, and the
footer's labels ("Investment Packages", "Referral Network") differed from the header's.

**Fix — one source of truth.**
- `lib/public-nav.ts` — the single nav definition, consumed by the navbar, the footer, the
  seed and the guard test. Client-safe (no fetching, no React) so it can be imported
  anywhere.
- `prisma/seed.ts` now provisions `NavigationItem` **from that module**, so the table is a
  mirror and can never disagree with what renders. Ids unchanged, so the seed stays
  idempotent and existing rows update in place.
- Canonical legal URLs are `/legal/*` — matching what the footer had always rendered.
  Legacy `/terms`, `/privacy`, `/cookies`, `/risk-disclosure` now 404 rather than
  silently coexisting as second copies of the same page.

**14 routes built — and deliberately empty.** Each renders an honest "not yet published"
state plus links that work. No invented marketing copy, and above all no invented legal
text: drafting terms, a risk disclosure or a privacy policy is legal authorship, not
engineering. They are `noindex` until real copy lands.

- `lib/pending-pages.ts` — an explicit **whitelist** of unpublished paths.
- `app/(public)/[slug]/page.tsx` and `app/(public)/legal/[slug]/page.tsx` — served from
  that whitelist and `notFound()` for anything else.

**Why a whitelist and not a catch-all:** an open `[...slug]` would turn every typo'd or
forgotten link into a plausible-looking page and destroy the exact signal that found this
bug. Unknown paths must still 404.

**The regression is now structurally impossible.** `tests/public-nav.test.ts` (10 tests)
asserts every advertised href is a real route or a declared pending entry, that the
whitelist is backed by real page files, that the four legal links stay under `/legal/*`,
and that no href or id is duplicated. A dead link fails the test run, not production.

**Note on the DB rows:** they are provisioned from the same source but are not yet the
*render* source — rendering reads the module directly. Wiring the runtime to the table
needs a `NavLocation` group for the footer's three columns, which is a schema change
better made when an admin nav editor is actually specified, not speculatively now.

| Gate | Result |
|---|---|
| `pnpm typecheck` | ✅ clean |
| `pnpm test` | ✅ **139/139 green** (18 files, +10 public-nav) |
| Live smoke (cold start + verified clean shutdown) | ✅ **85/85** |

Smoke coverage: all 17 public routes → 200; four legacy paths → 404; unknown path → 404;
homepage advertises `/copy-trading` and `/legal/terms` and does **not** advertise the old
`/terms`; unpublished pages state "Not yet published" and contain no illustrative content.

## Phase 6a — engine integration: the money-write spine (2026-10-17)

For five phases `lib/engine` sat behind 88 passing tests with **zero importers**. No code
path in the app ever created a `Wallet`. A confirmed payment had nowhere to go. That is
the entire gap this slice closes.

**One writer, one moment.** Registration is the only event that creates money obligations,
and an admin confirming the payment is the only event that settles them. No auto-settle on
signup, no async worker, no cron.

**What one confirm now does** (`lib/settlement/registration.ts`, inside a single
transaction):

1. `Payment` → PAID — refuses wrong purpose, wrong amount (must equal fee + 500 platform
   cents), or an already-settled row. Typed `SettlementError` maps to 404/409/400.
2. `PlatformFee` row for the 500 platform cents, status SETTLED.
3. `Registration` row recording the whole split:
   `feeCents 5000 | direct 1500 | generation 500 | rank 400 | leadership 350`.
4. Direct commission to the sponsor: `Commission` PAID 1500 + `Wallet` upsert + append-only
   `LedgerEntry` (CREDIT, `balanceAfterCents` 1500, idempotency key
   `reg:{paymentId}:direct`).
5. Generation commissions for every Active upline in gens 2–6, each keyed
   `reg:{paymentId}:gen{n}` — those keys are the whole defence against a double settle.
6. Rank 400 and leadership 350 accrued into `BonusPool` with matching `PoolLedgerEntry`
   ACCRUAL rows.

**Wallet opens at signup, at zero.** Every new user gets a `Wallet` in the same
transaction that creates them, so settlement is always an update plus a ledger append —
never a branch that might forget to create the wallet on the first credit.

**The tree that fits in the hole.** One referred member has no generation 2+ above the
sponsor, so the confirm response carries `generations: []`,
`generationAllocatedCents: 500`, `generationPaidCents: 0`. The share is **recorded as
unallocated** — not redistributed, not silently absorbed by the direct referrer. Where it
belongs is a business rule, not an engineering one.

**Where the money path stops.** `lib/engine` still has no other importers. There is no
gateway, no member-facing payment UI, no withdrawal, no payout, no rank milestone
evaluation. Those are 6b and Phase 7, and none of them are invented here.

| Gate | Result |
|---|---|
| `pnpm typecheck` | ✅ clean |
| `pnpm test` | ✅ **147/147 green** (19 files, +8 settlement) |
| Live smoke (cold start, clean shutdown) | ✅ **32/32** |

Smoke: register sponsor → wallet at 0 + PENDING `5500|500|PENDING`; register referred
member → sponsorId recorded and **zero** commissions before confirm; SUPER_ADMIN confirms →
`1500|PAID`, wallet 1500, ledger `balanceAfter` 1500, registration row
`5000|1500|500|400|350`, platform fee SETTLED, pools ≥400/≥350; double confirm → 409;
SUPPORT_ADMIN (no `deposits`) → 403 and the page 307s.

## Phase 6b — rank milestones on settlement (2026-10-17)

Ranks are gated on **member count, not money** (`eligibleTeamVolume` counts downline
members with a 40% leg cap; `countPersonalReferrals` counts direct referrals) — so every
settled registration is a rank input and evaluating on confirm is exactly right.

**Where it runs:** inside the same transaction as registration settlement, **after** the
pool accruals, so a milestone can draw on the very registration that triggered it.
Candidates are the **full upline chain** (member → sponsor → root): the 6-generation
window routes *payouts*, while rank qualification is a fact about tree shape.

**One settlement, three outcomes** (live-proven):

| Member | Qualification | Pool can cover? | Result |
|---|---|---|---|
| A | Associate 1 ($14) | yes (2200c available) | **PAID** — wallet +1400, ledger `RANK_AWARD`, `Commission(RANK_MILESTONE, PAID, pool RANK)`, pool `paidCents` +1400 |
| S1 | Leadership 1 (SMARTPHONE) | n/a — SKU, costs nothing | **PENDING** — recorded for fulfillment, no money, no pool |
| S2 | Associate 1 ($14) | no — 800c left | **FLAGGED** — row exists, zero rows of money moved |

**Policy encoded (engine contract, not invented locally):**
- Only the **highest newly-qualified** rank is awarded; the engine does not back-pay
  milestones skipped by a jump. *If Henry wants stepwise payout, that is a change to
  `lib/engine/ranks.ts`.*
- When the pool cannot cover everyone, awards are consumed **nearest-to-the-new-member
  first** (chain order) — the most proximate qualifier is paid, the rest flagged.
- **A FLAGGED award still promotes the member.** The qualification is a fact; payment is
  a separate state. Re-evaluation cannot re-award it (DB-unique), so a flag must later be
  cleared by an admin action — there is no payout UI yet (that is 6c/Phase 7).

**Idempotency has two independent layers:** the writer skips awards that already exist,
and `RankAward` gained `@@unique([userId, kind, rankId])` — migration
`20261017185500_rank_award_unique` (written by hand: `prisma migrate dev` refuses to run
non-interactively, so the SQL went to a file and `migrate deploy` applied it; RankAward
was verified empty first). A double-paid milestone would be unrecoverable, so the
database, not application logic, has the last word.

**Structure:** `creditWallet` moved to `lib/settlement/wallet.ts` — the rank writer needs
the same credit path but is called *by* registration settlement, so keeping it there would
have been circular. `lib/settlement/rank-plan.ts` is pure (`planRankAwards` +
`applyPoolBudget`, both unit-tested); `lib/settlement/rank-awards.ts` writes.

**Fixture:** `pnpm db:seed:rank-fixture` builds a 32-member tree in which one settlement
produces all three outcomes at once. Dev-only by construction: it wipes only its own
emails (`@rank-fixture.test`) and **resets the RANK pool to a known baseline** — which is
why it must never touch production, where pool ledgers are append-only. It creates the
PENDING payment itself, so the smoke makes **zero register-API calls** and never fights
the 5/hour/IP rate limit.

| Gate | Result |
|---|---|
| `pnpm typecheck` | ✅ clean |
| `pnpm test` | ✅ **159/159 green** (20 files, +12 rank-plan) |
| Migration `rank_award_unique` | ✅ applied (`migrate deploy`) |
| Live smoke Phase 6b (cold start, clean shutdown) | ✅ **30/30** |
| Live smoke Phase 6a (still green) | ✅ 32/32 |

Smoke proves against the database: the three award states, exactly one `RANK_MILESTONE`
commission (1400, PAID, pool RANK), wallets `1500 / 1600 / 100 / 75` (direct, gen+rank,
gen, gen — flagged pays nothing), ledger `balanceAfter` 1600, pool `2200|1400` with
`PAYOUT balanceAfter 800` and never negative, rank write-back `A=1, S2=1, S1=3/1`
(flagged promotes), no duplicate awards, double-confirm → 409 with the award count
unchanged.

## Phase 6c — payouts: hold, review, refund (2026-10-17)

**The money model — an inferred decision, stated openly.** 6a ended with the open
question *does approving a payout debit the wallet, and when?* Henry's standing
instruction was "proceed", so rather than re-ask, the semantics were chosen on first
principles and can still be changed cheaply:

- **REQUEST debits immediately (a hold).** Ledger `DEBIT/WITHDRAWAL`, key
  `payout:{id}:hold`, written in the same transaction as the `Payout` row — via a
  *conditional* `updateMany` (`balanceCents >= amount` in the WHERE), so racing requests
  cannot drive a balance negative; the loser rolls back, Payout row included.
- **REJECT refunds the hold.** Ledger `CREDIT/REFUND`, key `payout:{id}:refund`.
- **APPROVE moves no money** — human review only.
- **PAID moves no money and is terminal** — it records that the operator delivered funds
  externally. Review cannot be skipped: `MARK_PAID` from `REQUESTED` is a 409.

Consequence: `Wallet.balanceCents` always means **free** cash and over-commit is
structurally impossible — the funds leave the balance at request time, long before any
human sees it. Rejecting an *approved* payout is legal (change of mind before delivery);
rejecting a *paid* one is not (the money already left externally).

**Structure.** `lib/payouts/state.ts` is the pure transition matrix (+ `PayoutError`
with its HTTP status map) — the whole lifecycle in one table, unit-tested as the full
status × action matrix (19 tests). `lib/payouts/request.ts` and `lib/payouts/admin.ts`
are the two writers; each admin transition is **claimed** with a conditional
`updateMany` matching the expected status, so two admins racing on one payout can never
both win — the loser gets 409, never a second refund. Surfaces: member
`POST /api/account/payouts` (rate-limited 10/hour, zod `requestPayoutSchema`), admin
`PATCH /api/admin/payouts/[id]` (`withdrawals` permission, audit row written *inside*
the transaction for every action), `/dashboard/payouts` (request form + history, balance
card links to it), `/admin/payouts` (status-filtered queue), nav entries on both sides,
`payoutRequest` rate-limit bucket. The member request is recorded by the **ledger**
(append-only, attributable); audit rows cover the admin decisions.

**Fixture:** `pnpm db:seed:payout-fixture` — one verified member with a seeded 2000c
wallet under its own `@payout-fixture.test` universe (wipes only itself; the rank
fixture is untouched and neither smoke depends on the other). It logs in through the
**real** login route, so the smoke exercises the actual session path — zero register
calls.

| Gate | Result |
|---|---|
| `pnpm typecheck` | ✅ clean |
| `pnpm test` | ✅ **178/178 green** (24 files, +19 payout-transition matrix) |
| Live smoke Phase 6c (cold start, clean shutdown) | ✅ **46/46** |
| Live smoke Phase 6b / 6a (previous slices) | ✅ 30/30 · 32/32 |

Smoke proves, end to end: 2000→1000 on request with ledger
`DEBIT|WITHDRAWAL|1000|1000|{id}`; a 5000c over-balance request → 400
`insufficient_balance` with balance **and row count** unchanged (transaction rollback);
validation/401 gates; `MARK_PAID`-before-approve → 409; approve records
approver+timestamp; **PAID leaves the balance at 1000** (no money moved), terminal
409s after, exactly 2 audit rows; reject refunds `200 → 1000` with ledger
`CREDIT|REFUND|800|1000`; double-reject → 409 with balance untouched (no double
refund); approve-then-reject legal and refunded; final set exactly `PAID|1 +
REJECTED|2`; holds 2200 = refunds 1200 + the 1000 actually delivered; member
transactions page shows both row types; both nav links live.

**Harness, not app:** 4 of the first run's 7 failures were a *new* PowerShell trap —
inside a double-quoted string `"$p1:hold"` parses as the **scoped variable**
`$p1:hold` (scope `p1`, name `hold`) and silently expands to **empty**, so the SQL
searched for the literal `payout:`. Fix is `${p1}` braces. The other three: booleans
concatenate in Postgres as `true`, not `t`, and `C-Status`'s 4th parameter was never
wired to curl's output path (every HTML read hit an empty file). Every *money*
assertion passed on the first run.

## Phase 6d — flagged rank-award admin flow (2026-10-18)

**The last Phase 6 slice.** A `RankAward` set to FLAGGED at settlement time is a
milestone the RANK pool could not fund *then*; registrations keep re-accruing the
pool, so this slice gives an admin the two honest ways to close the gap:

- **Mark paid** — pay it from the pool's available balance, but only if the pool
  covers it *now*. Short pool ⇒ 409 `pool_short`, nothing written, "come back later".
  When it pays, the money shape is **identical to the automatic path**: same
  `Commission` (`RANK_MILESTONE`, key `rank:{userId}:associate:{rankId}`), same
  wallet credit, same pool debit, same `PoolLedgerEntry PAYOUT`.
- **Reject** — close it without payment. No money ever moved (nothing was held), so
  there is **nothing to refund**; the member keeps the rank — qualification is a
  fact, only the payout promise ends.

**The funding rule, stated once:** money comes ONLY from the RANK pool when it
covers the award. No new money source is invented — the shortfall flag exists
precisely so the system never pays what it does not have. Leadership (SKU) awards
are refused outright: fulfilling a physical SKU is delivery policy, not a pool
decision.

**Race discipline** (same as the payout writer): the transition is **claimed** with
a conditional `updateMany` matching FLAGGED, so two admins racing on one award
cannot both pay it. The pool increment runs *first* (locking the pool row) and the
invariant `paid ≤ accrued` is verified *after* — a concurrent automatic settlement
that exhausts the pool between our check and our write triggers `pool_short` and
the whole transaction (claim included) rolls back. The pool structurally cannot go
negative.

**Structure.** `lib/settlement/rank-admin.ts` — the pure matrix
(`rankAwardTransition`, full status × kind × action unit-tested) plus the one
writer `actOnRankAward`. Surfaces: `PATCH /api/admin/rank-awards/[id]`
(`withdrawals` permission, rate-limited, zod `rankAwardActionSchema`, audit row
written *inside* the transaction), `/admin/rank-awards` page (RANK pool card with
available balance, status-filtered queue, actions only on FLAGGED Associate rows),
admin nav entry. `RankAward` has no admin column — attribution is the audit row,
nothing else.

**Harness, hoisted.** The Phase 5/6/6b smoke scripts kept vanishing from the shared
temp dir mid-work; the fix is policy, not luck — **smoke harnesses are project
artifacts and live in-repo** under `tools/smoke/`, deriving `$root` from
`$PSScriptRoot`. All three smokes now ship with the repo.

**Fixture** (`scripts/rank-fixture.ts`, evolved in 6c-closeout): two flaggers —
`newcomer → a1 → A → S1 → S2 → M3` where M3 is a second root (S2 + P/Q legs ×4) —
plus **three** PENDING newcomer payments, so the pool top-up path (3 confirms ⇒
accrued 3000) is reproducible in one run.

| Gate | Result |
|---|---|
| `pnpm exec tsc --noEmit` | ✓ clean |
| `pnpm exec vitest run` | ✓ **197/197 green** (22 files, +19 rank-award matrix) |
| Live smoke Phase 6d (cold start, clean shutdown) | ✓ **38/38** |
| Live smoke Phase 6b / 6c (regression) | ✓ 32/32 · 46/46 |

Smoke proves, end to end: confirm #1 splits the three outcomes (A PAID / S2+M3
FLAGGED / S1 SKU) with pool 2200|1400 (avail 800); **MARK_PAID while short → 409
pool_short twice** (after confirms #1 and #2) with zero writes — no commission, no
ledger, no pool entry, award still FLAGGED; after confirm #3 (avail 1600) MARK_PAID
→ 200 with body `PAID|1400|200`, award row `PAID|paidAt`, S2 wallet 1625
(3×75 gen + 1400), ledger `1400|1625|RANK_AWARD`, pool `3000|2800` with PAYOUT
`balanceAfter 200`, pool never negative; double-pay → 409, REJECT-on-PAID → 409;
**REJECT M3 → 200 with NO money moved** (wallet untouched at 225, no ledger /
commission / pool entry), rank stays 1 — no demotion; re-reject → 409; exactly 4
award rows across 3 settles (no re-awards); final split `PENDING|1 + PAID|2 +
REJECTED|1`; both audit rows (`rank-award.mark-paid`, `rank-award.reject`);
`/admin/rank-awards` + `?status=FLAGGED` render; nav link live.

**First-run friction, harness-only again:** the initial `tsc` refused `rewardCents`
(null in the schema for SKU rows) in the pool-pay branch — fixed with an explicit
guard that refuses to pay a cash award with no recorded amount (corruption, loudly
refused) rather than a silent `?? 0`. Every money assertion passed first run.

## Phase 7a — the Pay2Crypto rail (2026-10-18)

Henry named the vendors: **Pay2Crypto** for payments, **Resend** for email. Phase 7
opens with the money rail, because a registration fee nobody can pay is a business
that cannot start.

**The shape.** `register → PENDING invoice carrying a reference → checkout link
attached → the member pays on-chain → the gateway calls back → the 6a spine
settles`. Nothing in that chain trusts the browser: the amount, the reference and
the settlement are all the server's, and the only place a payment becomes money is
the webhook.

- **`lib/payments/pay2crypto.ts`** — the wire contract, pure and unit-pinned:
  `POST {api}/v1/payment-requests` with `amount` as a **2-decimal string** (money
  crosses this boundary as text, never as a float), `asset`/`network`
  (`USDT`/`trc20`), `reference`, `return_url`; response `checkout_url` + `token`;
  webhook `{payment_ref, tx_hash, status, payment_amount}`. Non-ASCII is avoided
  in gateway-bound strings — a mangled encoding is an unpayable invoice.
- **`lib/payments/checkout.ts`** — attach (best effort, after the account commits)
  and refresh. **Refresh expires the old row and creates a new one; it never
  rewrites a reference on an existing row.** The reference is the webhook join key:
  rewriting it would strand a member who had already paid the old invoice with
  money that lands against a reference that no longer exists.
- **`lib/payments/webhook.ts`** — five load-bearing rules: non-final statuses are
  acknowledged, never applied; the amount is verified when the gateway echoes it;
  PAID is terminal and idempotent (flip + credits are one transaction, so a
  re-delivery is a pure no-op); **an EXPIRED invoice is still payable** (expiry is
  a UI state — the money arrived, it must be recorded); **a registration settles
  once per member, ever** (two live references must not pay the upline twice).
- **`app/api/webhooks/pay2crypto/route.ts`** — secret via `x-pay2crypto-secret`
  or `?secret=`, constant-time compare, **fails closed when unset**, rate-limited.
- **Member surface** — `GET /api/account/payments`, `POST
  /api/account/payments/[id]/checkout` (ownership checked first ⇒ 404 for someone
  else's invoice), `/dashboard/registration` + `RegistrationCheckout`. The page
  states the rail (USDT/TRC20) and the total from the real row — `USDT 55.00`, not
  a `$` that would be a lie about the asset.
- **Mock mode** is dev-only; production without a token answers `503
  gateway_not_configured` rather than pretending to take money.

**The bug the smoke caught.** `settleRegistrationPayment` accepted only
`gatewayTxid`, and the webhook passed the **on-chain hash** into it — clobbering
the gateway's own checkout token and leaving `txHash` null forever (the page's
"On-chain transaction" line could never render). Two different facts about one
payment were sharing one field. Fixed: the spine takes an optional `txHash`, writes
both, and the webhook no longer overwrites the gateway id. Every unit test passed
throughout — only the live run could see it, because the assertion was about what
the *database* held after a real callback, not about what a function returned.

| Gate | Result |
|---|---|
| `pnpm exec tsc --noEmit` | ✓ clean |
| `pnpm exec vitest run` | ✓ **226/226 green** (23 files, +29 pay2crypto contract) |
| Live smoke Phase 7a (cold start, clean shutdown) | ✓ **33/33** |
| Live smoke Phase 6d (regression, post-spine-change) | ✓ 38/38 |

Smoke proves, end to end: register ⇒ PENDING 5500/500 invoice with a mock checkout
link + gateway id; both member endpoints 401 unauthenticated; sign-in ⇒ payments
list; page renders TRC20 + `USDT 55.00`; a stale row refreshes into a **new**
invoice with the old row preserved EXPIRED; webhook with no secret ⇒ 401, wrong
secret ⇒ 401, unknown ref ⇒ 404, non-final ⇒ 200 **not applied**, short amount ⇒
400 **not settled**; the EXPIRED invoice settles when the money lands
(`PAID|0xstaleinvoice|kept` — hash recorded **and** gateway id preserved);
registration settled exactly once; PlatformFee `500|SETTLED`; RANK pool +400,
LEADERSHIP +350; replay changes nothing (no second registration, fee, or accrual);
the second invoice is recorded PAID with `already_registered` and settles nothing;
another member's invoice ⇒ 404; `/admin/payments` lists the settled row.

**First-run friction (4 of 5 failures were harness-only).** (1) The stale-link
UPDATE used a bare `now() - interval '2 hours'` — Prisma stores UTC in a
`timestamp` column while the psql session renders **local** time (+04), so the
"stale" row was written *two hours into the future* and looked brand new. The fix
is to pin the frame: `(now() at time zone 'UTC') - interval '2 hours'`. (2) The
page assertion demanded `$55.00` from a page that correctly says `USDT 55.00`.
(3–4) Both cascaded from (1). The fifth was the real bug above.

## Phase 7b — email that is real, or honestly not (2026-10-18)

Henry named **Resend**. The Phase 7 stub could not send anything: it logged in
development and reported failure in production, which was honest and useless the
day a real member signed up. This slice makes the adapter real and keeps the
honesty.

**Three behaviours, and the difference between them is the point.**
- **Configured** (`RESEND_API_KEY` *and* `EMAIL_FROM`) → send through Resend. A
  refusal comes back as `delivered: false` carrying the provider's own status and
  message, so an unverified sender domain is diagnosable from the log alone.
- **Not configured, development** → log the whole message, link included, and
  report `dev_logged`. Developing a flow that needs a working link must not
  require a provider account.
- **Not configured, production** → report `not_configured` and warn. **No fake
  success in production.** A silent "sent" is how a member ends up locked out of
  an account they can never verify.

`sendEmail` never throws. It runs after an account or a payment has already been
written, and a mail provider must not be able to undo that.

**Structure.** `lib/notifications/resend.ts` is the wire contract:
`buildResendRequest` is pure and unit-pinned (one POST, `to` as an array, `html`
omitted rather than sent empty, bearer auth), and `sendViaResend` is the only
function that touches the network — it returns a result for every failure mode,
including a thrown transport error. `fetch` rather than the Resend SDK: one POST
with a stable body does not justify a dependency, a lockfile entry and a
supply-chain surface. `lib/notifications/templates.ts` holds pure functions from
facts to `{subject, text, html}` — no env, no clock, no cents; the amount is
formatted by `lib/money` and passed in as a string. `lib/notifications/member.ts`
is the post-settlement notification, best effort by design. `lib/site.ts` gained
`siteName()`, now the single source for the product name in both the site metadata
(`app/layout.tsx`) and every email — a member must not be told "Verify your X
email" and land on a page branded Y.

**Two rules every template obeys, and the tests enforce.** The link appears in the
**plain-text** part too: HTML is a courtesy, the URL is the product, and a member
whose client strips markup must still be able to finish the flow. And anything a
member or a request supplied is escaped in the HTML — a display name is user
input, and an email client is a browser. Layout is tables and inline styles only,
with a test that refuses `<div>`.

**The settlement email is sent after the commit, never inside it**, and the amount
is read back from the payment row rather than from the gateway payload: the member
is told what we recorded, not what was claimed.

| Gate | Result |
|---|---|
| `pnpm exec tsc --noEmit` | ✓ clean |
| `pnpm exec vitest run` | ✓ **266/266 green** (26 files, +40) |
| Live smoke Phase 7b (cold start, clean shutdown) | ✓ **22/22** |
| Live smoke Phase 7a / 6d (regression, post-webhook change) | ✓ 33/33 · 38/38 |

**The smoke proves the email by consuming it.** No provider account is needed,
because the email's payload *is* the next step of the flow. The harness registers
a member, reads the message the dev transport logged, pulls the verification link
out of it and activates the account with that link (then proves the link is
single-use); does the same with a password reset, signing in with the new password
and failing with the old one; and finally confirms a registration through the
gateway webhook and asserts the member is told about the settlement, with the
amount we recorded, **exactly once** — a replayed webhook sends no second email.
The run asserts up front that no Resend key is configured, so it cannot quietly be
testing something else.

**What this does not prove:** that Resend accepts our request. That needs a live
key, and is pinned as far as it can be by unit tests against the wire shape.

**First-run friction: one harness bug, and it was a repeat.** `C-Status` in the
new harness had no `$extraHeaders` parameter, so the secret handed to it went
nowhere and the webhook answered 401 — the same class as the 6c lesson ("a helper
parameter never wired to the underlying call fails silently"), now on its second
offence. The fix is one line. The lesson is that a copied harness inherits the
*call sites* but not the *signature*, and the signature is where the silence lives.

**Two things deliberately not built, because they are policy, not code:** no email
on the overpayment path (a member whose second invoice was recorded-but-not-settled
gets no automated mail, because promising a refund is Henry's call), and no deposit
email (nothing creates a deposit invoice yet). Both are recorded as open.

## Phase 7c — identity verification, and the promise it finally keeps (2026-10-18)

The verification page has told members since Phase 4 that verification is
"required before any withdrawal can be processed." **Nothing enforced it.** The
claim was in the copy, the `kycStatus` column was in the schema, and between the
two there was no code. This phase builds the pipeline and, more to the point,
makes the sentence true.

**The one decision deliberately not taken.** Where identity documents live is a
PII posture with legal weight — encryption at rest, per-object access control, a
retention and deletion schedule, a breach-exposure answer. That is Henry's call.
So `DOCUMENTS_UPLOAD_ENABLED` is `false` and **no document bytes are collected**:
the pipeline is complete without them, a reviewer decides on the facts, and the
upload path slots in behind `documentPolicy()` when the decision lands. Building
a `public/uploads/` folder for passport scans "temporarily" is how a temporary
liability becomes a permanent one, and the smoke asserts that `documents` is
still null rather than leaving it implicit.

**Structure.** `lib/kyc/policy.ts` is the one editable home of the rules —
document types, the documents a member is asked to have ready, the age floor,
the field limits — plus `ageInYears`, counted in UTC so a birth date without a
zone cannot produce an answer that depends on where the server sits.
`lib/kyc/state.ts` is the transition matrix, shaped like `lib/payouts/state.ts`:
`PENDING` → `VERIFIED | REJECTED`, `NOT_STARTED` refused, `VERIFIED` refused,
and **`REJECTED` may resubmit**, because a rejection a member cannot answer turns
a correctable document problem into a dead end. `lib/kyc/submit.ts` and
`lib/kyc/review.ts` are the writers.

**Every write is claimed, not assumed.** Both writers match on the expected
current status in the `WHERE` of a conditional `updateMany`, so two reviewers
deciding the same submission — the normal case, not an exotic one — leave the
loser with a count of 0 and a 409 rather than an overwrite. The profile and the
denormalised `User.kycStatus` move in one transaction: a profile saying PENDING
next to a user saying NOT_STARTED is a member whose verification page contradicts
their own withdrawal gate.

**A rejection must carry a reason**, at least `KYC_LIMITS.reasonMin` characters,
enforced in the route and again in the domain function — both reading the same
constant, so they cannot drift. The reason is emailed through `renderLayout`,
which escapes it: an admin's free text lands in a browser, so it is treated as
input, not as copy.

**The gate lives in the domain function, not the route.** `requestPayout` loads
the member's `kycStatus` and refuses anything but `VERIFIED` with
`PayoutError("kyc_required")` → 403, *before* the Payout row is created. Putting
it there rather than in the HTTP handler means no future caller — a batch tool, a
second route, an admin impersonation — can skip it. This is the same reason the
balance guard is a `WHERE` clause instead of a read.

**The audit row is written inside the decision's transaction**, so an approval
cannot commit without its trail; the member's email is sent after the commit, so
the decision is durable before anyone is told about it.

| Gate | Result |
|---|---|
| `pnpm exec tsc --noEmit` | ✓ clean |
| `pnpm exec vitest run` | ✓ **334/334 green** (29 files, +68) |
| Live smoke Phase 7c (cold start, clean shutdown) | ✓ **39/39** |
| Live smoke 6b / 6c / 6d / 7a / 7b (regression) | ✓ 32 · 46 · 38 · 33 · 22 |

**The smoke proves the gate by sending the same request twice.** One payout
request, an empty wallet both times: before verification it must answer 403
`kyc_required`, after it must answer 400 `insufficient_balance`. That pairing is
the proof that identity is what changed and that the gate is the only thing in
the way. Around it, the harness lives the whole loop in the member's order —
register, activate, submit, be refused, be rejected with a reason, resubmit,
be verified, be let through — and checks the audit trail, the two emails, and
that a verified member cannot re-enter the queue.

**This phase broke an older smoke, and that was the point.** `phase6c` went from
46/46 to 13/46 the moment the gate landed: its fixture member had a wallet but
had never been verified, so every payout request 403'd. The honest fix was to
seed the fixture as identity-verified in `scripts/payout-fixture.ts` — the
fixture exists to exercise the payout rail, so it has to satisfy the platform's
own precondition. Reaching around the gate with SQL in the harness would have
left the suite green while testing a bypass of the thing under test.

**Two harness faults, both found the hard way.** PowerShell 5.1's `+` refuses to
merge hashtables with duplicate keys, so the variant fixtures are clones with one
field overwritten. And the first version of the harness **exited 0 after aborting
mid-run** — 11 checks executed, the summary printed "0 failed", exit code 0. A
green run over a third of a suite is worse than a red one, so the script now
carries an expected check count and fails loudly when the run comes up short;
that guard is the reason the number 38 appears in the harness at all.

**What this does not prove:** that uploaded documents are reviewed (none are
collected), and that a reviewer's decision is correct. The second one is a human
process, and this phase gives it a queue and an audit trail, not a brain.

## Phase 7d — the platform stops holding what it does not need (2026-10-18)

Two recommendations sat on the table after 7c: what to do about the identity
data, and whether to add WhatsApp/Telegram. The answer on both was "follow your
recommendation", and this phase is the identity half. The product was storing a
**plaintext document number** — a government-issued identifier, which the Data
Privacy Act classifies as *sensitive personal information* (s.3(l)(3)), carrying
higher penalties than ordinary personal information. Verification is a
point-in-time act: the number is needed to *check* someone, not to *keep* them.

So the `idNumber` column is gone. Two derived columns replace it:

- **`idNumberHash`** — an HMAC-SHA256 keyed with `KYC_ID_PEPPER`, so the same
  document used twice is still detectable, but the stored digest cannot be
  reversed by enumerating the short, structured space of possible numbers.
  A bare `sha256(idNumber)` would fail this: a 9-digit number is 10⁹ hashes,
  seconds on a laptop. The digest must be **keyed** to be minimisation rather
  than costume. When the pepper is absent, the function returns `null` rather
  than falling back to an unkeyed digest — losing duplicate detection (a
  feature) is the acceptable direction to fail; writing a weak digest of
  sensitive personal information is not.
- **`idNumberLast4`** — the four characters a reviewer can match against, and
  the only part a support agent should ever quote. The member page now says
  out loud what the platform does: *"We keep only the last four characters of
  the document number you gave us (ends 1234), not the whole number."*

Normalisation is a single function (`normalizeIdNumber`) imported by both the
hash and the last-four derivation, so `a0 1234567` and `A01234567` cannot be
stored differently. It lives in `policy.ts` (client-safe) and is imported by
`identity.ts` (which touches `node:crypto`) — not the other way round.

**The queue got thinner so the trail could get real.** 7c rendered every
member's legal name, date of birth, address and document number into the
`/admin/kyc` list — access to sensitive personal information as a side effect
of *looking at a list*, unrecorded and unanswerable afterwards. The list now
shows only triage (name, status, submitted, prior reason). The full details
live at `/admin/kyc/[id]`, which **writes a `kyc.view` audit row on open**:
admin, submission, address. That is the question the accountability principle
actually asks — who looked at whose identity data, and when. Two deliberate
details: the list links are plain `<a>` elements, not `next/link`, because the
App Router prefetches `Link` targets on hover and a prefetch would write access
records for pages nobody opened (an audit trail of imagined views is worse than
none); and the audit write is **not** try/caught — if the trail cannot be
written, the page must not render. `clientIp` was split into
`clientIpFromHeaders` so a server component and a route handler derive the
address the same way; two implementations would drift, and an audit row with a
differently-derived IP is not comparable with the rest of the trail.

**Retention.** "This member was verified on 4 May 2026 by reviewer X" is a fact
the platform may need for years. The name, birth date, address and document
reference that supported it are not. `IDENTITY_RETENTION_DAYS = 365` (a
starting point, not a compliance opinion — the number that should come from
counsel), and `pnpm db:purge:identity [--dry-run]` clears the identity columns
from rows past the window while leaving `status`, both dates, `reviewedById`
and `rejectionReason` intact. The script never logs the values it removes: a
retention job that prints the data it deleted has *moved* it, not deleted it,
and a cron transcript is less protected than the database. `IDENTITY_FIELDS`
is exported from `policy.ts` so a new identity column cannot be added without
appearing in the purge list.

The migration backfills `idNumberLast4` from the value being removed and then
drops `idNumber`. `idNumberHash` is deliberately **left null** for the three
rows that predate the pepper: the key is not in the database, and an unkeyed
digest would be worse than nothing. The payout fixture now derives both fields
the same way a real submission does — otherwise it would be the only row in
the database still holding a raw number.

### Verification

| Gate | Result |
|---|---|
| `pnpm exec tsc --noEmit` | ✓ clean |
| `pnpm exec vitest run` | ✓ **361/361 green** (30 files, +20) |
| Live smoke Phase 7d (cold start, clean shutdown) | ✓ **35/35** |
| Live smoke Phase 7c (regression, post-minimisation) | ✓ **39/39** |
| Migration `20261018061624_kyc_identity_minimisation` applied | ✓ |
| `pnpm db:purge:identity --dry-run` / real run | ✓ both exit 0, no values printed |

**The 7d smoke proves the negative, not the positive.** A migration that ran
and left a copy behind is exactly the failure this phase exists to prevent, so
the harness submits a unique document number and then hunts for it: in every
column of every `KycProfile` row (via `row_to_json`), in every audit row, and
in every dev log line. It also recomputes bare `sha256(value)` and asserts the
stored digest **differs** — if the platform ever stored an unkeyed digest, this
check is what catches it. Then it proves the access record by counting
`kyc.view` rows before and after opening a submission (exactly one, naming the
admin, with an IP), that opening the *queue* writes none (plain anchors, no
prefetch trail), and that the retention job runs quietly without values in its
output. First run: 33/34 — the member-facing notice assertion failed, and it
was right to: the notice lives with the resubmission form, so a PENDING member
cannot see it. The harness now rejects the submission before reading the member
page, which also proved the reject→resubmit path still works under 7d.

**What this does not prove:** that the pepper is backed up (lose it and the
duplicate-check column becomes null — duplicates stop being detectable for new
submissions), and that 365 days is the legally correct retention window. Both
are operational and legal calls, not code.

## Phase 8 - deploy pipeline (2026-10-22)

**Goal:** Make `main` self-deploying to the aaPanel box that already serves `gthubx.com` (DNS pointed, cert present). Reuse the proven COPINEX pattern (poll-driven 2-minute cron, idempotent `deploy.sh`, health gate + rollback, `pm2 delete + start` with a fresh env).

**Artifacts added**
- `app/api/health/route.ts` — `force-dynamic`, probes Postgres with a 3s timeout, returns `200 {status:"ok",db:"up"}` or `503 {status:"degraded",db:"down"}`. The deploy gate and the cron's health check both use it.
- `infrastructure/deploy/deploy.sh` — clone/pull, `pnpm install --frozen-lockfile`, `prisma migrate deploy`, `next build`, fresh `pm2 start`, health-check up to 60s, automatic rollback to the previous commit on failure. Never `pm2 restart` (that preserves a stale env). Logs to `deploy.log` on success.
- `.github/workflows/ci.yml` — `pnpm typecheck` + `pnpm test` on push/PR (unit tests only; integration against the live DB is the deploy health gate).

**Server bootstrap (aaPanel, `192.227.176.232`)**
- Cloned `https://github.com/Ebankz007/GTHubX.git` to `/www/wwwroot/gthubx` at `4d5ce1c` (public repo, no token).
- pnpm `11.12.0` installed via npm into Node `v24.18.0`'s bin.
- Postgres 16: role `gthubx` + database `gthubx_prod`. `.env` written server-side (secrets never committed): `DATABASE_URL`, `NEXT_PUBLIC_SITE_URL=https://gthubx.com`, `NEXT_PUBLIC_SITE_NAME`, `AUTH_SECRET` (32-byte hex), `KYC_ID_PEPPER` (base64), `EMAIL_FROM`.
- `pnpm install --frozen-lockfile` + `prisma migrate deploy` (3 migrations applied) + `pnpm db:seed` (pools, 4 site settings, 15 nav items) + `pnpm exec next build` (all routes compiled).
- PM2 process `gthubx` started on `:3500` (fork, Next.js 16.4.0). `pm2 save` + `pm2-root.service` enabled for reboot survival.
- Apache `gthubx.com.conf` rewritten (backup `gthubx.com.conf.bak-20261022`): HTTP→HTTPS redirect, `ProxyPass / http://127.0.0.1:3500/` with `ProxyPreserveHost On` and `X-Forwarded-Proto https`. Cert already present (`fullchain.pem`/`privkey.pem`, valid through Jan 11 2027). `Syntax OK`, graceful reload.
- aaPanel cron `gthubx-auto-deploy` (task 58, every 2 minutes, `toShell`) verified: body matches exactly, fires on schedule, idles cleanly (`HEALTHY on latest`).
- `pnpm db:seed:admin` created `SUPER_ADMIN admin@gthubx.com` (password generated once, not stored).

**Verification**
| Gate | Result |
|---|---|
| `pnpm typecheck` (local) | clean |
| `pnpm test` (local) | **361/361 green** (fixed a time-expired KYC age fixture to compute from the clock) |
| `git push origin main` | `8247739..4d5ce1c` |
| GitHub Actions CI (`39754337594`) | **success** |
| Server deploy script (manual) | `DEPLOYED` path exercised, health gate passed |
| `curl https://gthubx.com/api/health` | `{"status":"ok","db":"up","uptime_s":..., "time":"..."}` HTTP 200 |
| `curl https://gthubx.com` | HTTP 200, title `Global Traders HubX - Connect. Copy. Trade. Grow.` |
| `curl http://gthubx.com` | 301 → `https://gthubx.com/` |
| Auto-deploy cron (tasks 54,56,58) | firing every 2 min, idling cleanly, logs in `/var/log/gthubx-deploy.log` |

**Admin access**
- URL: `https://gthubx.com/admin/login`
- Email: `admin@gthubx.com`
- Password: `NFOzYYcmK9a_4KpEpM8KlM-UpCwiLI0N` *(change it on first sign-in)*

**What this does not prove:** Resend deliverability (DNS/SPF/DKIM/DMARC still pending), a real Pay2Crypto token (rail is mock-safe in dev / fails closed in prod if unset), or backups on the panel side. The pipeline is live and proven; those are credential/DNS items, not wiring gaps.

**Fixes made en route**
- KYC validator test hardcoded `2008-10-19` (turned 18 on 2026-10-19) — made the "one day short" case clock-computed from `MIN_AGE_YEARS` so it never expires again.
- Apache config was PHP/static by default; replaced with a Node reverse proxy (same shape as Copinex, single-process Next.js).
- Panel cron helper learned the correct `AddCrontab` shape (`sBody` + empty `urladdress`, all required fields) and the discipline of reading back after writes + deleting temp tasks.

## Next
1. **Email deliverability DNS checklist for Resend** — SPF, DKIM, DMARC, custom return-path for the sending domain (`gthubx.com` is the obvious candidate; verify in Resend dashboard). Until these land, real sends will land in spam or bounce, and the dev-log path is the only honest one we have.
2. **Live credentials** — a Pay2Crypto token and a Resend API key, for the first real (non-mock) payment and the first real email.
3. **The PII decision** — where identity document *files* live (object storage with encryption at rest, a third-party KYC provider, or manual collection). What the platform *stores* is now minimised; what it might one day *receive* is still open.
4. **Policy not yet decided:** what an overpaid member is told. Their second invoice is recorded PAID and not settled; today they get no email at all.
5. **Rank rescale** — still his call: absolute rewards ($14 → $20,000) land ~2.5× faster than planned against the $4.00 rank pool, so clears become pool-refusals an admin must chase. A rescale or a rank-pool carve increase is the durable fix.
6. **Open elsewhere:** AmplifiedTraders remote (public or private), and revoking the pasted PAT.
