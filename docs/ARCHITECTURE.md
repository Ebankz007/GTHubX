# GTHubX — Architecture

*Phase 2 per master prompt §4–§12. Recommended design; pending Henry's approval.*

## 1. Shape
**Single Next.js app** (CopiPilot shape), one deployable, four experiences under one brand:

```
Public site  →  Client portal  →  Admin  →  Superadmin
(marketing)     (/dashboard)      (/admin)   (/admin, SUPER_ADMIN scope)
```

Why single-app over an Aglotrends-style monorepo: GTHubX is one web product; Next route handlers
+ server actions host the API; the compensation engine is a self-contained `lib/engine` module.
Fewer moving parts to build, test, and deploy. *(Tradeoff: if the engine ever needs to run as a
separate worker for scheduled payouts, extract it to a workspace package later — it is already
pure TS and dependency-free, so extraction is cheap.)*

## 2. Stack
| Layer | Choice | Source |
|---|---|---|
| Framework | Next.js 16.4 (App Router, RSC, Turbopack) | CopiPilot |
| Language | TypeScript strict | CopiPilot |
| UI | React 19.3 + Tailwind 4 + hand-rolled component library | CopiPilot + brand tokens |
| Icons | lucide-react (brand glyphs inlined) | CopiPilot |
| DB | PostgreSQL 16 (`gthubx` role/DB, `:5433`) | CopiPilot |
| ORM | Prisma 7.10 + `@prisma/adapter-pg` + migrations | CopiPilot |
| Validation | Zod 4 (shared schemas) | CopiPilot |
| Auth | Custom revocable DB sessions (bcrypt cost 12, SHA-256 token hash, httpOnly cookies) | CopiPilot |
| Engine | Ported pure-TS compensation/network engine (integer cents) | Aglotrends |
| Money | **`Decimal` / integer minor units** (no `Float`) | new |
| Tests | Vitest 5 | CopiPilot |
| Toasts | sonner | CopiPilot |
| Media | Local disk (`public/uploads`), pluggable S3 | CopiPilot |

## 3. Folder structure
```
GTHubX/
  app/
    (public)/            home, about, copy-trading, packages, traders, community,
                         network, education, faq, blog, contact, legal pages
    (auth)/              login, register, forgot/reset-password, verify-email
    dashboard/           client portal (auth-gated)
      {portfolio,copy,packages,network,wallet,transactions,community,notifications,settings,kyc,support}
    admin/               operations admin (RBAC-gated)
      {users,kyc,deposits,withdrawals,packages,copy,network,community,content,blog,
       faq,media,messages,settings,audit,team,reports}
    api/                 route handlers (auth, contact, webhooks/*)
    layout.tsx · globals.css · sitemap.ts · robots.ts · not-found.tsx
  components/
    ui/                  design-system primitives
    site/ home/ dashboard/ admin/   feature components
  lib/
    engine/              ported compensation/network engine (pure TS, unit-tested)
    auth.ts prisma.ts rbac.ts finance.ts money.ts audit.ts rate-limit.ts
    validators.ts settings.ts tokens.ts uploads.ts notifications/ (email, whatsapp, telegram)
    integrations/ (payments, kyc) — adapters, no-op when unconfigured
  prisma/                schema.prisma · migrations/ · seed.ts
  tests/                 unit + integration + rbac
  docs/                  BRAND · CONCEPT · BRIEF · AUDIT · ARCHITECTURE · PLAN · DEPLOY
```

## 4. Data model (Prisma → PostgreSQL)
**Identity & access** (from CopiPilot, extended)
`Admin`, `AdminSession`, `User`, `UserSession`, `PasswordReset`, `AuditLog`, `SiteSetting`
— `User.role`: `CLIENT | TRADER`; add `kycStatus`.

**Copy pillar**
`Trader` (master-trader profile: display, strategy, stats, status) ·
`CopyRelationship` (user ↔ trader: allocation, status, startedAt) · `Broker` (link, logo, region).

**Invest pillar** *(shape depends on custody fork — §0 of PLAN)*
`Package` (tier, min/max, term, riskLevel, status) · `PackageSubscription` (user → package,
amount, status, dates).

**Network pillar** (engine-backed)
`Referral` (userId, sponsorId, position, depth) · `MatrixPosition` (forced 3×3) ·
`Commission` (immutable ledger: type, amount, source, pool, status) · `Payout` (batch, method,
status) · `Rank` (user achievement) · `BonusPool` (accrued/paid balances, solvency flag).

**Community pillar**
`CommunityPost` · `CommunityComment` · `Event` · `Leaderboard` (derived/cached) ·
`Course` / `Lesson` (education) — or reuse `BlogPost` + `Page`.

**Ledger & money** (unified, immutable)
`Transaction` (double-entry: type, direction, amount `Decimal`, currency, status, referenceId,
relatedId) · `Wallet` (per-user balance, currency, `Decimal`) · reconciliation view.

**CMS** (from CopiPilot): `Page`, `NavigationItem`, `HomepageSection`, `Stat`, `Testimonial`,
`Faq`, `BlogPost/BlogCategory/BlogTag/BlogPostTag`, `Media`, `ContactMessage`, `Notification`.

**Principles:** real FKs; indexes on hot lookups (`slug`,`status`,`email`,`tokenHash`,`userId`);
`order` columns for reorderable content; `status`/`isEnabled` gates; JSON only for list-shaped
content; **no destructive migrations without a recovery plan**.

## 5. API inventory (route handlers under `/api`)
```
auth/    login · logout · register · verify-email · forgot-password · reset-password
contact  public, rate-limited, honeypot
webhooks payments/* (signature-verified) · kyc/* · messaging/*
```
Everything else is **server actions** (CopiPilot pattern) with `requirePermission`/`requireUser`
guards. Each action enforces the same permission as its page.

## 6. RBAC matrix (extends CopiPilot's 4×15)
| Role | Scope |
|---|---|
| `SUPER_ADMIN` | All modules + team + settings + integrations + audit |
| `CONTENT_ADMIN` | content, blog, faq, media, education, community moderation |
| `SUPPORT_ADMIN` | users, messages, tickets, kyc review, community reports |
| `FINANCE_ADMIN` | deposits, withdrawals, packages, commissions, payouts, ledger |
| `NETWORK_ADMIN` *(new)* | referral tree, ranks, pools, commission review |
| `TRADER_ADMIN` *(new)* | traders, copy relationships, broker links |

Permissions: `dashboard, content, blog, faq, media, users, kyc, messages, packages, copytrading,
network, community, education, deposits, withdrawals, ledger, reports, settings, audit, team`.
Guarded by a single `lib/rbac.ts` matrix. **No admin inherits superadmin by default.**

## 7. Security model (master prompt §6)
CopiPilot baseline **plus**:
- **MFA (TOTP)** for `SUPER_ADMIN`/privileged accounts; session revocation + brute-force lockout.
- **Ledger integrity:** append-only transactions, idempotency keys on every money mutation,
  atomic DB transactions, reconciliation job (ledger ↔ displayed balances).
- **Webhook security:** verify signatures; reject unsigned/duplicate events; record diagnostics.
- **IDOR/privilege escalation:** server-side ownership checks on every client resource;
  cannot change URL/ID/param to reach another user's data (explicit tests).
- OWASP Top 10 + API security; secrets outside source control; encryption in transit + at rest;
  audit log on every sensitive admin/financial action; no secrets in logs/errors/responses.

## 8. Integrations (§12)
Each = dedicated adapter layer + documented env vars + sandbox first + timeout/retry/rate-limit
handling + signature verification + duplicate-event guard + status/diagnostics. **Never silently
fall back to simulated money in production.** If credentials are missing, ship the interface +
testable adapter and mark it *blocked*.

## 9. Testing strategy (§3/§11)
- **Unit:** engine (allocation/network/matrix/pools/ranks), money math, validators.
- **Integration:** server actions (deposit/withdraw/package/copy/commission) with mocked Next
  runtime — *the pattern that caught the CopiPilot RBAC hole*.
- **RBAC:** every role × every permission; unauth → login; denied → `?error=forbidden`.
- **Ledger:** reconciliation + idempotency + concurrency tests.
- **E2E smoke:** all public routes 200; all authenticated pages render with real sessions.
- **Acceptance criteria** per phase (see `PLAN.md`).

## 10. Deployment / backup / rollback
**aaPanel:** Nginx reverse proxy + TLS + PM2 + Postgres (per CopiPilot `DEPLOY.md`).
Backups: nightly `pg_dump` + WAL retention; tested restore; migrations forward-only with a
documented rollback plan; `next build` gate before deploy; health endpoint + structured logs.
