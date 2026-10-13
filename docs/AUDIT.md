# GTHubX — Phase 1 Audit

*Method per the master prompt §3 Phase 1. Inspected 2026-10-11: GTHubX (empty shell),
`C:\BerfamWorks\CopiPilot`, `C:\BerfamWorks\Aglotrends`.*

## 1. GTHubX (target)
Empty shell — `README.md`, `docs/{BRAND,CONCEPT,BRIEF}.md`, local git (`main`). **No code,
no stack, no DB.** Baseline: N/A (nothing to test).

## 2. CopiPilot (architecture template)
| Aspect | Finding |
|---|---|
| Shape | Single Next.js app — public site + client portal + admin CMS |
| Stack | Next 16.4 · React 19.3 · Tailwind 4 · Prisma 7.10 · PostgreSQL 16 · Zod 4 · Vitest 5 |
| Auth | Custom revocable DB sessions (bcrypt cost 12; 256-bit opaque token, SHA-256 stored; httpOnly `cp_admin`/`cp_user`) |
| RBAC | `lib/rbac.ts` — 4 roles × 15 permissions, `requirePermission` on every page **and action** |
| Money | `Deposit`/`Withdrawal`/`Investment`/`Transaction` + `lib/finance.ts` — **`Float` (flagged)** |
| CMS | Pages, nav, homepage, stats, testimonials, blog, FAQ, media, settings |
| Ops | Audit log, rate limiting, uploads, notifications, contact inbox, team mgmt |
| Docs | AUDIT, CONCEPT, DEPLOY (aaPanel), PLAN, REPORT |
| Status | **Built, verified: `typecheck` clean, 140 tests green (14 files), build clean (52 routes), smoke 200s, published to private GitHub (`75f1004`)** |

**Reusable as-is:** auth/session model, RBAC matrix pattern, audit log, CMS modules, design-system
primitives, validators, rate limiting, deploy runbook, test harness.

## 3. Aglotrends (four-pillar + engine template)
| Aspect | Finding |
|---|---|
| Shape | pnpm monorepo — `apps/api` (Express), `apps/web` (Next 15), `packages/engine` (pure TS), `database` (Drizzle) |
| Engine | `constants, types, money, allocation, network, compression, bonuses, matrix, ranks, pools` — **58 tests green** |
| Posture | **Locked decision: software/education layer, NO licence, never touches client funds; copy + signals manual on broker site** |
| Money model | Integer-cents; registration fee split 45/55 across direct/generation/rank/leadership pools on a forced 3×3 matrix; realized-profit 60/10/30 |
| Web routes | `(marketing)` login/register · `(portal)` dashboard, network, signals, brokers, community, wallet, admin, notifications, settings |
| Docs | CONCEPT (excellent template), COMPENSATION_PLAN (MD/HTML/PDF) |
| Status | **Built, verified (98 tests), published to private GitHub (`1af075b`), running :4000/:3000** |

**Reusable as-is:** the compensation/network engine (port to `lib/engine`), the four-pillar route
map, the "no custody" posture, the risk-map framing.

## 4. Findings & risks
| # | Finding | Impact | Action |
|---|---|---|---|
| F1 | GTHubX ≈ **Aglotrends + CopiPilot combined** | Duplication risk | **Decide reuse vs rebuild (blocking)** |
| F2 | "Investment packages" + recruitment-funded referral = **CIS + pyramid risk** | Regulatory | **Custody fork (blocking)** — see `PLAN.md` §0 |
| F3 | CopiPilot money is `Float` | Correctness | Use `Decimal`/minor units in GTHubX |
| F4 | Aglotrends engine is **integer-cents, pure TS** | Reuse win | Port directly; keep integer money |
| F5 | Two proven architectures exist | Velocity | Reuse CopiPilot shell + Aglotrends engine; don't greenfield |
| F6 | No GTHubX DB yet | Setup | Create `gthubx` role/DB on PG16 `:5433` |

## 5. Baseline commands (once code exists)
`pnpm typecheck` · `pnpm test` · `pnpm build` · `pnpm db:seed` · live smoke on `next start`.

## 6. Recommendation
**Do not greenfield.** Build GTHubX as a **single Next.js app on the CopiPilot stack**, porting the
**Aglotrends compensation engine** into `lib/engine`, adopting the **no-custody posture** for v1.
This reuses ~60% of proven, tested machinery and sidesteps the licensing burden. See `PLAN.md`.
