#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/deploy-ssh.sh
[[ $(node -p 'process.versions.node.split(".")[0]') == 24 ]] || { echo 'Use Node 24 LTS.' >&2; exit 1; }
for cmd in ssh scp tar npm; do command -v "$cmd" >/dev/null; done
# Verify before building; sudo may prompt again during activation.
ssh -t "${ssh_options[@]}" "$remote" 'sudo -v && test -r /etc/planbreeze/ecosystem.config.cjs'
npm ci
npm run typecheck
npm test
NUXT_PUBLIC_API_URL=/api npm run build
test -s .output/public/index.html
test -s .output/public/200.html
release_id="$(date -u +%Y%m%dT%H%M%SZ)-$(openssl rand -hex 4)"
staging=$(mktemp -d)
trap 'rm -rf "$staging"' EXIT
mkdir -p "$staging/public" "$staging/server"
cp -R .output/public/. "$staging/public/"
cp -R server/dist "$staging/server/dist"
cp package.json package-lock.json "$staging/"
cp deploy/web-server.mjs "$staging/"
tar -czf "$staging/release.tgz" -C "$staging" public server package.json package-lock.json web-server.mjs
scp "${scp_options[@]}" "$staging/release.tgz" "$remote:/tmp/planbreeze-$release_id.tgz"
scp "${scp_options[@]}" scripts/activate-ubuntu.sh "$remote:/tmp/planbreeze-$release_id.sh"
ssh -t "${ssh_options[@]}" "$remote" "sudo bash /tmp/planbreeze-$release_id.sh '$release_id'"
echo "Deployed web and API to https://dev.planbreeze.com"
