# GTHubX — Implementation Plan

*Phase 2 deliverable. **Awaiting Henry's approval before Phase 3 (build).***

---

## 0. The two decisions that gate everything

### Decision A — Custody posture (the fork)
| | **A. Software/community layer** *(recommended)* | **B. Custodial investment platform** |
|---|---|---|
| Money | Platform **never holds client funds**. Packages = non-custodial allocations / broker links. | Platform holds deposits, sells packages, pays returns. |
| Licensing | Software/education/community → **low** (Aglotrends posture, proven) | **CIS / securities / deposit-taking** → needs licences + KYC/AML/custody |
| Referral | Rewards funded **only by membership/product revenue** | Rewards risk being **recruitment-funded → pyramid** |
| Speed | Ship fast, no licence | Slow, jurisdiction-by-jurisdiction counsel |
| Monetization | Membership tiers, education, broker revenue-share | Management/performance fees |

**My recommendation: A for v1.** It reuses Aglotrends' proven no-custody posture, avoids the
licensing wall, and still delivers the full brand experience. Reassess B per market *with counsel*.

### Decision B — Reuse vs rebuild
**Recommendation: reuse.** Single Next.js app on the **CopiPilot** stack + port the **Aglotrends**
compensation engine into `lib/engine`. ~60% of proven, tested machinery reused. Do **not** greenfield.

---

## 1. Phased roadmap

| Phase | Scope | Acceptance criteria |
|---|---|---|
| **0. Audit + plan** | This document set | ✅ Done — awaiting approval |
| **1. Scaffold + design system** | Next 16 + TS + Tailwind; brand tokens (Navy `#0B1220`/Gold `#D4A72C`/Emerald `#18A66A`); typography; layout; component primitives; logo mark | `typecheck` clean; tokens applied; primitives documented |
| **2. Database + engine** | Prisma schema (all modules); migration; idempotent seed; **port engine** to `lib/engine`; **integer-cents money** | ✅ Done 2026-10-14 — migration applies; seed reproducible; 88 engine tests green; no `Float` |
| **3. Auth + RBAC** | Admin/user sessions; register/login/reset; email verify; RBAC matrix (6 roles); rate limiting; MFA scaffold | Auth E2E works; every page+action guarded; RBAC tests green |
| **4. Client portal** | Dashboard, portfolio, copy, packages, network, wallet, transactions, community, notifications, settings, KYC, support | All journeys from register → primary op verified with real sessions |
| **5. Admin + Superadmin** | Operations admin (users/KYC/money/packages/copy/network/community/content) + superadmin (admins/roles/settings/integrations/audit/reports) | Every admin surface renders 200 authed; permission enforcement tested |
| **6. Engine integration** | Wire compensation: referral tree, commissions, ranks, pools, payouts; immutable ledger; reconciliation | Ledger reconciles to balances; idempotency + concurrency tests green |
| **7. Integrations** | Payments, email SMTP, WhatsApp/Telegram, KYC — adapters + webhooks + docs | Adapters testable; no-op when unconfigured; **no fake success in prod** |
| **8. Hardening + deploy** | Security pass (OWASP), a11y (WCAG 2.2 AA), responsive 1920→375, SEO, perf; aaPanel deploy; backups | Full gate green; live smoke; backup/restore tested |

## 2. Public site page inventory
Home · Copy Trading · Investment Packages · Traders · Community · Referral Network · Education ·
About · Contact · FAQ · Blog · Risk Disclosure · Terms · Privacy · Cookie Policy · Login ·
Register · 404/500. **No fabricated testimonials, credentials, or performance stats.**

## 3. Design system (§11)
Tokens (color/type/spacing/grid) · buttons/forms/cards/tables/dialogs/nav · icons/charts ·
light+dark · responsive · **every screen has loading/empty/success/failure/permission-denied
states** · keyboard nav + contrast + focus (WCAG 2.2 AA) · subtle motion (respects
`prefers-reduced-motion`) · **no decorative dead buttons**.

## 4. Compliance guardrails (non-negotiable)
- No guaranteed/implied-return language anywhere; performance labelled illustrative, past only.
- Persistent risk notice in footer; calculator disclaimers; four legal pages (review by counsel).
- Referral compensation derives from **product revenue**, never recruitment.
- KYC/AML before any fund custody (if Decision A ever flips to B).

## 5. Open questions for Henry
1. **Decision A — custody posture:** ✅ **A (no-custody)** — locked 2026-10-14.
2. **Decision B — reuse:** ✅ **reuse** (CopiPilot shell + Aglotrends engine) — 2026-10-14.
3. **Stack confirmation:** ✅ Next 16 + Prisma 7 + PG16 (CopiPilot house style).
4. **Integration providers:** ⏳ open — payments (Pay2Crypto / Flutterwave / Paystack),
   email SMTP, WhatsApp / Telegram tokens, KYC provider. Adapters no-op until provided.
5. **Business model:** ✅ registration **$50** + **$5 per-payment** platform fee; previous
   sharing formula on the $50 base (2026-10-14). Package tiers / revenue lines still to define.

## 6. Decision log
| Date | Decision | Status |
|---|---|---|
| 2026-10-11 | Project opened; brand captured | ✅ |
| 2026-10-11 | Phase 1 audit + Phase 2 plan produced | ✅ |
| 2026-10-14 | **Decision A = no-custody** — platform never holds client funds | ✅ locked |
| 2026-10-14 | **Decision B = reuse** — CopiPilot stack + ported Aglotrends engine | ✅ locked |
| 2026-10-14 | **Plan** — registration $50 + $5 per-payment fee; previous sharing formula on $50 | ✅ locked |
| 2026-10-14 | **Phase 2 complete** — schema, migration, seed, engine (88 tests green) | ✅ |
