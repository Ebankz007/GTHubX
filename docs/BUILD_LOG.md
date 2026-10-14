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
| **5. Admin + Superadmin** | ops admin + superadmin (roles · settings · integrations · audit · reports) | ⬜ |
| **6. Engine integration** | referral tree · commissions · ranks · pools · payouts · immutable ledger | ⬜ |
| **7. Integrations** | payments · email · WhatsApp/Telegram · KYC adapters + webhooks | ⬜ |
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

## Next — Phase 5 (admin + superadmin)
1. Ops admin: users, KYC, packages, copy, network, community moderation, content.
2. Superadmin: admins, roles, settings, integrations, audit, reports.
3. Seed business content once Henry supplies it (packages, brokers, testimonials).
4. Wallet / network / copy trading unblock with Phase 6's engine.
