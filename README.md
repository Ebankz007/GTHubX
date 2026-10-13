# GTHubX

> Status: **PLANNED — brand locked, Phase 1 audit + Phase 2 architecture/plan complete,
> awaiting approval before build.** Genesis 2026-10-11. No code yet.
> Start at [`docs/PLAN.md`](docs/PLAN.md) (decisions + roadmap), then
> [`docs/BRIEF.md`](docs/BRIEF.md) · [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) ·
> [`docs/AUDIT.md`](docs/AUDIT.md) · [`docs/CONCEPT.md`](docs/CONCEPT.md) ·
> [`docs/BRAND.md`](docs/BRAND.md).

## What this is
**Global Traders HubX** — a digital trading community (not a broker) bundling four
pillars: **copy trading**, **structured investment packages**, a **referral/network**
layer, and a **trader community**.

**Connect. Copy. Trade. Grow.**

## Open questions (blocking)
1. **New venture, rebrand of Aglotrends, or consolidation?** The pillars overlap
   Aglotrends almost exactly.
2. **Regulatory posture** — "investment packages" + recruitment-funded referrals is
   a high-risk combination. Resolve before building (see `CONCEPT.md` §7).
3. **Business model** — how revenue is actually captured (spread share? fees?).
4. **Intended form** — web platform / app / both; build target and stack.
5. **The wedge** — smallest thing that proves the thesis.

## Layout
```
GTHubX/
  docs/
    BRAND.md         brand book (source of truth)
    CONCEPT.md       thesis, pillars, regulatory posture, decisions
    BRIEF.md         filled project brief (stack, modules, integrations)
    AUDIT.md         Phase 1 audit (GTHubX / CopiPilot / Aglotrends)
    ARCHITECTURE.md  Phase 2 architecture (data model, RBAC, API, security)
    PLAN.md          decisions + phased roadmap  ← start here
  README.md          this file
```

*No code until the two gating decisions (`PLAN.md` §0) are approved. The stack
follows the problem, never the reverse.*
