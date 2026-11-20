#!/usr/bin/env bash
set -Eeuo pipefail
# Override these in the invoking shell. Runtime settings must match the installed unit.
DEPLOY_HOST=${DEPLOY_HOST:-10.0.0.240}
DEPLOY_USER=${DEPLOY_USER:-haneyman}
DEPLOY_ROOT=${DEPLOY_ROOT:-/opt/planbreeze}
APP_HOST=${APP_HOST:-127.0.0.1}
APP_PORT=${APP_PORT:-3001}
HEALTHCHECK_URL=${HEALTHCHECK_URL:-https://dev.planbreeze.com}
MODE=deploy
[[ ${0##*/} == rollback.sh ]] && MODE=rollback
log() { printf '[%s] %s\n' "$(date -u +%FT%TZ)" "$*"; }
trap 'log "ERROR at line $LINENO" >&2' ERR
DRY_RUN=false
case ${1:-} in --dry-run) DRY_RUN=true ;; '') ;; *) echo "Usage: $0 [--dry-run]" >&2; exit 2 ;; esac
[[ $# -le 1 ]]
cd "$(dirname "${BASH_SOURCE[0]}")/.."
for tool in node npm ssh rsync mktemp; do command -v "$tool" >/dev/null; done
[[ $(node -p 'process.versions.node.split(".")[0]') == 24 ]]
[[ $DEPLOY_HOST =~ ^[a-zA-Z0-9.-]+$ && $DEPLOY_USER =~ ^[a-z_][a-z0-9_-]*$ ]]
# Deliberately restrict deletion and privileged operations to the dedicated home.
[[ $DEPLOY_ROOT == /opt/planbreeze && $APP_HOST == 127.0.0.1 && $APP_PORT == 3001 ]]
[[ $HEALTHCHECK_URL =~ ^https://[a-zA-Z0-9.-]+(:[0-9]+)?$ ]]
for file in package.json package-lock.json scripts/release-remote.sh deploy/planbreeze.service; do test -s "$file"; done
if $DRY_RUN; then
  log "DRY RUN: no local installation/build or SSH connection will occur."
  log "$MODE on $DEPLOY_USER@$DEPLOY_HOST; root=$DEPLOY_ROOT; bind=$APP_HOST:$APP_PORT"
  if [[ $MODE == deploy ]]; then
    log "Deploy: npm ci; typecheck; tests; static build with API URL $HEALTHCHECK_URL/api."
    log "Upload allowlisted artifacts to a new UTC release; install runtime dependencies as planbreeze."
  else
    log "Select previous successful release; retain server environment and database."
  fi
  log "Lock activation; atomically switch current; restart systemd; check service, loopback, HTTPS API and exact frontend."
  log "On failure restore previous release; after success retain five successful releases. Rollback swaps current and previous."
  exit 0
fi
ssh_opts=(-o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=15)
remote="$DEPLOY_USER@$DEPLOY_HOST"
if [[ $MODE == rollback ]]; then
  ssh "${ssh_opts[@]}" "$remote" "sudo -n bash -s -- rollback '$HEALTHCHECK_URL'" < scripts/release-remote.sh
  exit
fi
log 'Installing locked dependencies and validating locally before remote changes'
npm ci
npm run typecheck
npm test
NUXT_PUBLIC_API_URL="$HEALTHCHECK_URL/api" npm run build
for file in .output/public/index.html .output/public/200.html server/dist/server/src/main.js; do test -s "$file"; done
stage=$(mktemp -d)
trap 'rm -rf -- "$stage"' EXIT
release=$(date -u +%Y%m%dT%H%M%SZ)-$(node -e 'console.log(require("node:crypto").randomBytes(4).toString("hex"))')
chmod 0755 "$stage"
mkdir -p "$stage/public" "$stage/server"
# Positive allowlist: never transfer source env files, git, modules, caches or logs.
rsync -a --chmod=D755,F644 --exclude='.*' --exclude='*.map' .output/public/ "$stage/public/"
rsync -a --exclude='.*' --exclude='*.map' server/dist/ "$stage/server/dist/"
cp package.json package-lock.json "$stage/"
printf '%s\n' "$release" > "$stage/public/deployment-release.txt"
chmod 0644 "$stage/public/deployment-release.txt"
cp scripts/release-remote.sh "$stage/release-remote.sh"
log "Preparing isolated release $release"
ssh "${ssh_opts[@]}" "$remote" "sudo -n bash -s -- prepare '$HEALTHCHECK_URL' '$release'" < scripts/release-remote.sh
rsync -az --rsync-path='sudo -n -u planbreeze rsync' -e 'ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=15' "$stage/" "$remote:$DEPLOY_ROOT/releases/$release/"
ssh "${ssh_opts[@]}" "$remote" "sudo -n bash -s -- deploy '$HEALTHCHECK_URL' '$release'" < scripts/release-remote.sh
log "Deployed $release"
