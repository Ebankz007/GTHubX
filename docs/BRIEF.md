# GTHubX — Project Brief

*Filled from Henry's brand brief (2026-10-11) and the Phase 1 audit of Aglotrends/CopiPilot.
Assumptions are marked **[ASSUMPTION]** and may be overridden.*

## Identity
| Field | Value |
|---|---|
| Project name | **GTHubX** (brand: **Global Traders HubX**) |
| Project type | Full-stack web platform — public marketing site + client portal + admin + superadmin |
| Repository | NEW at `C:\BerfamWorks\GTHubX` (reuses Aglotrends engine + CopiPilot architecture) |
| Positioning | "Digital trading community, not a broker" — four pillars: Copy · Invest · Network · Community |

## Business purpose
A single hub where retail participants copy experienced traders, participate in structured
packages, grow through a referral network, and learn inside a community — monetized via
membership/packages and broker revenue-share. **Business model and custody posture are the
two open decisions (see `PLAN.md` §0).**

## Target users
| Persona | Role | Core need |
|---|---|---|
| Retail participant | `CLIENT` | Follow traders, participate, earn via network, learn |
| Master trader | `TRADER` | Distribution, followers, recognition |
| Operations staff | Admin roles | Review, approve, moderate, publish, support |
| Owner | `SUPER_ADMIN` | Global control, RBAC, settings, audit |

## Core modules
1. **COPY** — master-trader profiles, follow/copy relationships, performance display
2. **INVEST** — structured packages (participation tiers) — *custody posture TBD*
3. **NETWORK** — referral tree, compensation engine, ranks, pools, commissions, payouts
4. **COMMUNITY** — feed, discussions, leaderboards, events, education
5. **Client portal** — dashboard, portfolio, copy, packages, network, wallet, transactions, notifications, KYC, support
6. **Admin** — operations: users, KYC, deposits/withdrawals, packages, copy, network, community, content, support
7. **Superadmin** — admins & roles, global settings, branding, integrations, audit, reports, maintenance
8. **CMS** — pages, navigation, homepage, blog, FAQ, testimonials, media, legal
9. **Ledger** — immutable double-entry ledger for all money movement

## External integrations **[ASSUMPTION — confirm providers]**
- **Payments:** Pay2Crypto / Flutterwave / Paystack (adapters, no-op when unconfigured)
- **Email:** SMTP (transactional + reset)
- **Messaging:** WhatsApp Cloud API, Telegram Bot (notification fan-out)
- **KYC:** pluggable provider interface (manual review in v1)
- **Broker/market data:** broker links (manual) in v1; API feed deferred
- **Copy trading:** manual on broker site (Aglotrends posture) unless custody decision says otherwise

## Localization
- Languages: **English** first; i18n-ready (no RTL in v1)
- Regions/currencies: **Global**; base **USD**; multi-currency display formatting

## Technology stack **[RECOMMENDED]**
Reuse the **verified CopiPilot stack** (140 green tests, aaPanel-proven):
**Next.js 16.4** (App Router/RSC/Turbopack) · **TypeScript** strict · **React 19.3** ·
**Tailwind 4** · **Prisma 7.10** + `@prisma/adapter-pg` · **PostgreSQL 16** · **Zod 4** ·
custom revocable DB-session auth · **Vitest 5** · **pnpm**.
Compensation engine: **port Aglotrends `packages/engine`** (pure TS) into `lib/engine`.

## Database
**PostgreSQL 16** (dedicated `gthubx` role + DB; dev on `:5433`, mirrors CopiPilot).
**Money as `Decimal` / integer minor units from day one** — fixes the CopiPilot `Float` flag.

## Hosting
**aaPanel VPS** — Nginx reverse proxy + TLS + PM2 + Postgres (per CopiPilot `docs/DEPLOY.md`).

## Reference assets
- Brand book: `docs/BRAND.md`
- Architecture source: `C:\BerfamWorks\CopiPilot`
- Four-pillar + engine source: `C:\BerfamWorks\Aglotrends`

## Out of scope (v1, unless asked)
Real payment rails (intents recorded, operator settles) · live broker API/market data ·
automated copy execution · multi-tenant/multi-site · native mobile apps.
