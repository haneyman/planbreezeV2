#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/deploy-ssh.sh
LETSENCRYPT_EMAIL=${LETSENCRYPT_EMAIL:-support@dev.planbreeze.com}
[[ "$LETSENCRYPT_EMAIL" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+$ ]] || exit 1
setup_id="planbreeze-setup-$(openssl rand -hex 8)"
staging=$(mktemp -d)
trap 'rm -rf "$staging"' EXIT
[[ $# == 0 ]] || { echo 'Usage: provision-ubuntu.sh (shared Caddy setup)' >&2; exit 1; }
tar -czf "$staging/setup.tgz" deploy scripts/setup-ubuntu.sh scripts/setup-caddy.sh
ssh "${ssh_options[@]}" "$remote" "mkdir -m 700 '/tmp/$setup_id'"
scp "${scp_options[@]}" "$staging/setup.tgz" "$remote:/tmp/$setup_id/setup.tgz"
ssh "${ssh_options[@]}" "$remote" "tar -xzf '/tmp/$setup_id/setup.tgz' -C '/tmp/$setup_id'"
ssh -t "${ssh_options[@]}" "$remote" "tar -xzf '/tmp/$setup_id/setup.tgz' -C '/tmp/$setup_id' && sudo bash '/tmp/$setup_id/scripts/setup-ubuntu.sh' '$LETSENCRYPT_EMAIL'"
ssh "${ssh_options[@]}" "$remote" "rm -rf '/tmp/$setup_id'"
