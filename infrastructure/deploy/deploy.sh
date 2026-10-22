#!/bin/sh
# GTHubX auto-deploy — runs on the LIVE server on a 2-minute poll (aaPanel
# cron), same proven pattern as Copinex. Poll-driven because the panel's
# native hook endpoint proved inert on this host (pushes deliver 200 but
# move nothing) — see Copinex's 2026-10-04 fire drill.
#
# The script is idempotent: no new commit → health check only, no rebuild.
# Triggered remotely/unattended; must be fully non-interactive and fail
# LOUDLY: any failed step aborts before the next one, and a failed health
# check rolls back to the previous commit.
#
# One-time server setup (see docs/DEPLOY.md):
#   1. git clone https://github.com/Ebankz007/GTHubX.git (public repo: no
#      credentials needed) into APP_DIR on the server.
#   2. Create the production .env (never committed) + install node/pnpm/pm2.
#   3. Run migrations + seed by hand once, then this script.
#   4. Register the panel cron task pointing at this script.
#
# Design notes:
# - Always deploys origin/main HEAD, whatever branch was pushed (a feature-
#   branch push triggers a harmless no-op redeploy, never a wrong deploy).
# - Migrations are additive-only in this project (prisma migrate deploy
#   applies pending migrations; it never rolls one back).
# - Rollback = previous commit + rebuild + restart. The DB is NOT rolled
#   back (migrations are forward-only by design).
# - PM2 delete + start, never `pm2 restart`: restart preserves the OLD
#   environment, so a changed .env would silently not apply.

set -eu

# ── Configure these for the server ──────────────────────
APP_DIR="/www/wwwroot/gthubx"   # server checkout of the GTHubX repo
BRANCH="main"
WEB_PORT="3500"                  # app's own port (package.json start script)
WEB_HEALTH="http://127.0.0.1:${WEB_PORT}/api/health"
# Absolute node first: cron shells carry a minimal PATH. If the version
# directory differs on this host, fix THIS line, not the caller's PATH.
export PATH="/www/server/nodejs/v24.18.0/bin:$PATH"
# ─────────────────────────────────────────────────────────

log() { echo "[deploy $(date '+%Y-%m-%dT%H:%M:%S')] $1"; }
fail() { log "FAILED: $1"; exit 1; }

# (Re)start the process with a FRESH environment.
start_process() {
  pm2 delete gthubx >/dev/null 2>&1 || true
  (cd "$APP_DIR" && pm2 start node_modules/next/dist/bin/next --name gthubx -- start -p "$WEB_PORT") || return 1
  pm2 save >/dev/null 2>&1 || true
}

healthy() {
  curl -sf -m 5 "$WEB_HEALTH" >/dev/null 2>&1
}

[ -d "$APP_DIR/.git" ] || fail "APP_DIR $APP_DIR is not a git checkout"
cd "$APP_DIR"

# The cron shell has a minimal PATH — fail here naming the missing binary,
# not halfway through a deploy.
for bin in git pnpm curl node pm2; do
  command -v "$bin" >/dev/null 2>&1 || fail "required binary not on cron PATH: $bin"
done

PREV_COMMIT="$(git rev-parse HEAD)"
log "previous commit: $PREV_COMMIT"

log "fetching origin/$BRANCH…"
git fetch --prune origin || fail "git fetch failed (network or remote down)"

log "resetting to origin/$BRANCH…"
git reset --hard "origin/$BRANCH" || fail "git reset failed"

NEW_COMMIT="$(git rev-parse HEAD)"
if [ "$NEW_COMMIT" = "$PREV_COMMIT" ]; then
  log "already on $NEW_COMMIT — verifying health only, no rebuild"
  if healthy; then
    log "HEALTHY on $NEW_COMMIT — nothing to do"
    exit 0
  fi
  log "up to date but UNHEALTHY — restarting process once"
  start_process || fail "restart failed while up to date"
  sleep 15
  if healthy; then
    log "HEALTHY after restart — nothing to do"
    exit 0
  fi
  fail "UNHEALTHY and already on latest — needs a human, not a rebuild"
fi
log "deploying $PREV_COMMIT → $NEW_COMMIT"

rollback() {
  log "health check FAILED — rolling back to $PREV_COMMIT"
  git reset --hard "$PREV_COMMIT"
  pnpm exec next build >/dev/null 2>&1 || true
  start_process >/dev/null 2>&1 || true
  fail "rolled back to $PREV_COMMIT — inspect the server, then push a fix"
}

log "installing dependencies…"
pnpm install --frozen-lockfile || fail "pnpm install failed"

log "applying database migrations…"
pnpm exec prisma migrate deploy || fail "migrations failed — later steps aborted, fix and re-push"

log "building…"
pnpm exec next build || fail "build failed"

log "restarting process (fresh env)…"
start_process || fail "process start failed"

log "health-checking (up to 60s)…"
healthy_now=0
i=0
while [ "$i" -lt 12 ]; do
  sleep 5
  i=$((i + 1))
  if healthy; then
    healthy_now=1
    break
  fi
  log "health attempt $i/12 not ready yet…"
done
if [ "$healthy_now" -ne 1 ]; then
  rollback
fi

log "DEPLOYED $NEW_COMMIT — app healthy on :$WEB_PORT"
echo "$NEW_COMMIT $(date -u +%FT%TZ)" >> deploy.log
