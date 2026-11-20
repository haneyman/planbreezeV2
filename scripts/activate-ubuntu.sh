#!/usr/bin/env bash
# Invoked by deploy-ubuntu.sh on the Ubuntu host.
set -euo pipefail
[[ $EUID == 0 && ${1:-} =~ ^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}$ ]] || exit 1
release_id=$1
base=/opt/planbreeze
release="$base/releases/$release_id"
archive="/tmp/planbreeze-$release_id.tgz"
trap 'rm -f "$archive" "/tmp/planbreeze-$release_id.sh"' EXIT
# Serialize releases, including dependency installation and health checks.
exec 9>/run/lock/planbreeze-deploy.lock
flock -n 9 || { echo 'Another deployment is running.' >&2; exit 1; }
[[ $(/usr/bin/node -p 'process.versions.node.split(".")[0]') == 24 ]]
# Validate the existing server connection before changing the active release.
# Parse without sourcing the env file or printing credentials.
/usr/bin/node --input-type=module -e '
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
const env = parseEnv(readFileSync("/etc/planbreeze/api.env", "utf8"));
if (!/^mongodb(?:\+srv)?:\/\//.test(env.MONGODB_URI ?? "")) {
  console.error("Set MONGODB_URI in /etc/planbreeze/api.env to the existing MongoDB connection before deploying.");
  process.exit(1);
}
'
mkdir "$release"
tar -xzf "$archive" --no-same-owner -C "$release"
chown -R planbreeze:planbreeze "$release"
runuser -u planbreeze -- bash -c 'cd "$1" && npm ci --omit=dev --ignore-scripts' -- "$release"
test -s "$release/public/200.html"
test -s "$release/server/dist/server/src/main.js"
pm2_app() {
  runuser -u planbreeze -- env HOME=/opt/planbreeze PM2_HOME=/opt/planbreeze/.pm2 /usr/local/bin/pm2 "$@"
}
restart_api() {
  pm2_app startOrRestart /etc/planbreeze/ecosystem.config.cjs --update-env
}
previous=$(readlink "$base/current" || true)
switch_release() {
  ln -s "$1" "$base/next-$release_id"
  mv -Tf "$base/next-$release_id" "$base/current"
}
rollback() {
  trap - ERR
  if [[ -n "$previous" ]]; then
    switch_release "$previous"
    restart_api || true
    pm2_app save || true
    echo "Deployment failed; restored $previous" >&2
  else
    pm2_app delete planbreeze-api planbreeze-web || true
    pm2_app save --force || true
    rm -f "$base/current"
    echo 'First deployment failed; API stopped.' >&2
  fi
  exit 1
}
trap rollback ERR
switch_release "$release"
restart_api
healthy=false
for attempt in {1..30}; do
  if curl -fsS --max-time 3 http://10.0.0.240:3001/api/health | /usr/bin/node -e '
let body=""; process.stdin.on("data", c => body += c); process.stdin.on("end", () => {
const r=JSON.parse(body); if (!r.ok || r.service !== "planbreeze-api") process.exit(1);
});'; then healthy=true; break; fi
  sleep 2
done
[[ $healthy == true ]]
curl -fsS --max-time 10 --resolve dev.planbreeze.com:443:10.0.0.240 https://dev.planbreeze.com/ | cmp - "$release/public/index.html"
curl -fsS --max-time 10 --resolve dev.planbreeze.com:443:10.0.0.240 https://dev.planbreeze.com/__deployment_healthcheck | cmp - "$release/public/200.html"
curl -fsS --max-time 10 --resolve dev.planbreeze.com:443:10.0.0.240 https://dev.planbreeze.com/api/health >/dev/null
pm2_app save
trap - ERR
echo "Active release: $release_id (previous: ${previous:-none})"
