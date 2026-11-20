#!/usr/bin/env bash
# Run on Ubuntu with sudo from the uploaded setup directory.
set -euo pipefail
cd "$(dirname "$0")/.."
[[ $EUID == 0 ]] || { echo 'Run with sudo.' >&2; exit 1; }
email=${1:?Provide the certificate contact email as the first argument}
[[ "$email" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+$ ]] || exit 1
apt-get update
apt-get install -y curl openssl ca-certificates xz-utils python3
# Install the official Node 24 binary when Node is absent. Existing installations
# of another major version must be upgraded deliberately by the administrator.
if [[ ! -x /usr/bin/node ]]; then
  case $(uname -m) in
    x86_64) node_arch=x64 ;;
    aarch64) node_arch=arm64 ;;
    *) echo 'Unsupported Node binary architecture.' >&2; exit 1 ;;
  esac
  node_tmp=$(mktemp -d)
  trap 'rm -rf "$node_tmp"' EXIT
  curl -fsS https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt -o "$node_tmp/SHASUMS256.txt"
  node_archive=$(awk -v arch="$node_arch" '$2 ~ ("^node-v24\\.[0-9]+\\.[0-9]+-linux-" arch "\\.tar\\.xz$") {print $2}' "$node_tmp/SHASUMS256.txt")
  [[ "$node_archive" =~ ^node-v24\.[0-9]+\.[0-9]+-linux-(x64|arm64)\.tar\.xz$ ]]
  curl -fsS "https://nodejs.org/dist/latest-v24.x/$node_archive" -o "$node_tmp/$node_archive"
  (cd "$node_tmp"; awk -v file="$node_archive" '$2 == file' SHASUMS256.txt | sha256sum -c -)
  tar -xJf "$node_tmp/$node_archive" -C /opt
  node_dir="/opt/${node_archive%.tar.xz}"
  for binary in node npm npx; do ln -s "$node_dir/bin/$binary" "/usr/bin/$binary"; done
fi
[[ $(/usr/bin/node -p 'process.versions.node.split(".")[0]') == 24 ]] || {
  echo 'Upgrade the existing installation to Node 24 LTS at /usr/bin/node first.' >&2; exit 1;
}
npm install --global --prefix /usr/local pm2@6
id planbreeze >/dev/null 2>&1 || useradd --system --home-dir /opt/planbreeze --shell /usr/sbin/nologin planbreeze
install -d -m 755 -o planbreeze -g planbreeze /opt/planbreeze /opt/planbreeze/releases
install -d -m 750 -o planbreeze -g planbreeze /opt/planbreeze/.pm2
install -d -m 750 -o root -g planbreeze /etc/planbreeze
if [[ ! -e /etc/planbreeze/api.env ]]; then
  umask 027
  cat > /etc/planbreeze/api.env <<ENV
NODE_ENV=production
HOST=10.0.0.240
PORT=3001
SITE_URL=https://dev.planbreeze.com
API_URL=https://dev.planbreeze.com/api
# Connection string for the MongoDB database already configured on this server.
MONGODB_URI=
SESSION_SECRET=$(openssl rand -hex 32)
TOKEN_ENCRYPTION_KEY=$(openssl rand -base64 32)
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
AUTH_APPLE_ID=
AUTH_APPLE_TEAM_ID=
AUTH_APPLE_KEY_ID=
AUTH_APPLE_PRIVATE_KEY=
GOOGLE_CALENDAR_CLIENT_ID=
GOOGLE_CALENDAR_CLIENT_SECRET=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
JOBS_ENABLED=false
EMAIL_ENABLED=false
MAILGUN_API_KEY=
MAILGUN_DOMAIN=
MAILGUN_REGION=US
EMAIL_FROM=
EMAIL_REPLY_TO=
INBOUND_EMAIL_SECRET=$(openssl rand -hex 32)
INBOUND_EMAIL_DOMAIN=in.dev.planbreeze.com
ENV
  chown root:planbreeze /etc/planbreeze/api.env
  chmod 640 /etc/planbreeze/api.env
fi
# Preserve existing secrets/settings on subsequent setup runs.
install -m 644 deploy/ecosystem.config.cjs /etc/planbreeze/ecosystem.config.cjs
# Retire only the earlier dedicated API service; PM2 owns the API now.
if systemctl cat planbreeze-api.service >/dev/null 2>&1; then
  systemctl disable --now planbreeze-api.service
fi
/usr/local/bin/pm2 startup systemd -u planbreeze --hp /opt/planbreeze
# Both Node listeners are LAN-only upstreams for the existing Caddy container.
# Preserve database credentials and all other server settings.
python3 - <<'PYENV'
from pathlib import Path
p=Path('/etc/planbreeze/api.env')
s=p.read_text().splitlines()
s=[line for line in s if not line.startswith('HOST=')]
p.write_text('\n'.join(s)+'\nHOST=10.0.0.240\n')
PYENV
bash scripts/setup-caddy.sh "$email"
echo 'Setup ready. Configure the existing MongoDB connection and provider credentials in /etc/planbreeze/api.env, then deploy.'
