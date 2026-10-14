/**
 * GTHubX compensation + network engine — pure TypeScript, no framework
 * dependencies. Everything downstream (route handlers, server actions, jobs,
 * dashboards) is a thin adapter over these functions.
 *
 * Ported from Aglotrends `packages/engine` (2026-10-14). Money is integer cents
 * throughout; percentages are integer basis points.
 */
export * from "./constants";
export * from "./types";
export * from "./money";
export * from "./allocation";
export * from "./network";
export * from "./compression";
export * from "./bonuses";
export * from "./matrix";
export * from "./ranks";
export * from "./pools";
