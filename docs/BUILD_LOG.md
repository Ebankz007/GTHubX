# GTHubX — Build Log

*The living checklist. Updated as work progresses (master prompt §3).*

## Phase status

| Phase | Scope | Status |
|---|---|---|
| **0. Audit + plan** | BRIEF · AUDIT · ARCHITECTURE · PLAN | ✅ 2026-10-11 |
| **1. Scaffold + design system** | Next 16 app · brand tokens · primitives · public shell | ✅ 2026-10-11 |
| **2. Database + engine** | Prisma schema · migration · seed · port Aglotrends engine · integer-cents money | ✅ 2026-10-14 |
| **3. Auth + RBAC** | Sessions · register/login/reset · RBAC matrix (6 roles) · rate limiting · MFA | ⬜ |
| **4. Client portal** | dashboard · copy · packages · network · wallet · community · KYC · support | ⬜ |
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

## Phase 2 — in progress (2026-10-14)

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

## Next — Phase 3 (auth + RBAC)
1. Auth: register / login / reset, sessions, email verify, RBAC matrix (6 admin roles),
   rate limiting, MFA.
2. Seed business content once Henry supplies it (packages, brokers, testimonials).
3. **Commit Phase 2** — awaiting Henry's word; nothing committed yet.
