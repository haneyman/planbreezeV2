#!/usr/bin/env bash
set -euo pipefail

: "${DEPLOY_SSH_KEY:?Set the DEPLOY_SSH_KEY GitHub Actions secret}"
: "${DEPLOY_KNOWN_HOSTS:?Set the DEPLOY_KNOWN_HOSTS GitHub Actions secret}"
: "${DEPLOY_USER:?Set the DEPLOY_USER GitHub Actions variable}"
: "${DEPLOY_HOST:?Missing deployment host}"
: "${GITHUB_SHA:?Missing commit SHA}"
: "${GITHUB_RUN_ID:?Missing workflow run ID}"
: "${GITHUB_RUN_ATTEMPT:?Missing workflow attempt}"
: "${RUNNER_TEMP:?Missing runner temporary directory}"
[[ "$DEPLOY_USER" =~ ^[a-z_][a-z0-9_-]*$ ]]
[[ "$DEPLOY_HOST" =~ ^[a-zA-Z0-9.-]+$ ]]
[[ "$GITHUB_SHA" =~ ^[0-9a-f]{40}$ ]]
[[ "$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT" =~ ^[0-9]+-[0-9]+$ ]]
test -s .output/public/index.html
test -s .output/public/200.html
grep -Fq 'https://basic-peacock-14.convex.cloud' .output/public/index.html

ssh_dir=$(mktemp -d "$RUNNER_TEMP/planbreeze-ssh.XXXXXX")
trap 'rm -rf "$ssh_dir"' EXIT
chmod 700 "$ssh_dir"
printf '%s\n' "$DEPLOY_SSH_KEY" > "$ssh_dir/key"
printf '%s\n' "$DEPLOY_KNOWN_HOSTS" > "$ssh_dir/known_hosts"
chmod 600 "$ssh_dir/key" "$ssh_dir/known_hosts"
cat > "$ssh_dir/config" <<EOF
Host planbreeze-deploy
    HostName $DEPLOY_HOST
    User $DEPLOY_USER
    IdentityFile $ssh_dir/key
    UserKnownHostsFile $ssh_dir/known_hosts
    StrictHostKeyChecking yes
    IdentitiesOnly yes
    BatchMode yes
    ConnectTimeout 15
EOF

release_id="$GITHUB_SHA-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
release="/var/www/planbreeze/releases/$release_id"
ssh -F "$ssh_dir/config" planbreeze-deploy "mkdir -p '$release'"
rsync -az --chmod=D755,F644 -e "ssh -F $ssh_dir/config" \
    .output/public/ "planbreeze-deploy:$release/"

ssh -F "$ssh_dir/config" planbreeze-deploy bash -s -- "$release_id" <<'REMOTE'
set -euo pipefail
release_id=$1
base=/var/www/planbreeze
release="$base/releases/$release_id"
test -s "$release/index.html"
test -s "$release/200.html"
previous=$(readlink "$base/current")
test -n "$previous"

rollback() {
    ln -s "$previous" "$base/rollback-$release_id"
    mv -Tf "$base/rollback-$release_id" "$base/current"
    echo "Health check failed; restored $previous" >&2
}
ln -s "$release" "$base/next-$release_id"
mv -Tf "$base/next-$release_id" "$base/current"
trap rollback ERR
# Verify TLS, nginx virtual host, exact release, and client-side route fallback.
curl --fail --silent --show-error --max-time 30 \
    --resolve planbreeze.com:443:127.0.0.1 https://planbreeze.com/ | cmp - "$release/index.html"
curl --fail --silent --show-error --max-time 30 \
    --resolve planbreeze.com:443:127.0.0.1 https://planbreeze.com/__deployment_healthcheck | cmp - "$release/200.html"
trap - ERR
echo "Deployed $release_id to https://planbreeze.com"
REMOTE
