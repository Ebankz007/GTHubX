# GTHubX — Build Log

*The living checklist. Updated as work progresses (master prompt §3).*

## Phase status

| Phase | Scope | Status |
|---|---|---|
| **0. Audit + plan** | BRIEF · AUDIT · ARCHITECTURE · PLAN | ✅ 2026-10-11 |
| **1. Scaffold + design system** | Next 16 app · brand tokens · primitives · public shell | ✅ 2026-10-11 |
| **2. Database + engine** | Prisma schema · migration · seed · port Aglotrends engine · Decimal money | ⬜ next |
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

## Next — Phase 2
1. `prisma/schema.prisma` (identity, copy, invest, network, community, ledger, CMS).
2. `gthubx` role + DB on PG16 `:5433`; migration; idempotent `seed.ts`.
3. Port Aglotrends `packages/engine` → `lib/engine` (pure TS, integer cents) + tests.
4. Money as `Decimal` / integer minor units — **no `Float`**.
