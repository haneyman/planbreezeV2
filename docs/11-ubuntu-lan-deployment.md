# Ubuntu development deployment

Target: `haneyman@dev.planbreeze.com` on SSH port 22. Use the existing SSH agent/config or set `DEPLOY_SSH_KEY="$HOME/.ssh/id_trashcan"`. The domain forwards to `10.0.0.240`.

**Caddy serves both MovieBreeze and PlanBreeze**, including automatic HTTPS. PlanBreeze runs two single-instance PM2 processes as the `planbreeze` account: the NestJS API on `10.0.0.240:3001` and a static web server on `10.0.0.240:8080`. Caddy's existing Docker container proxies to these LAN upstreams; they cannot use host loopback from inside that container. Forward only public ports 80/443 and SSH. Permit the Caddy container's network to reach the upstreams; keep 3001/8080 restricted to trusted local traffic.

Existing MongoDB, SSH keys, MovieBreeze routes, access-key checks, Caddy certificates, and Docker volumes are retained. No database import runs. No local `.env` files are uploaded.

## Provision or recover from the failed nginx migration

```bash
# Optional when your SSH config/agent does not select this identity:
export DEPLOY_SSH_KEY="$HOME/.ssh/id_trashcan"
./scripts/provision-ubuntu.sh
```

Enter the Ubuntu sudo password when prompted. The old `--migrate-moviebreeze` flag has been removed.

Setup installs Node 24 if absent, PM2 6, and supporting tools. It creates the service account and env file if needed, and preserves existing credentials. It then:

- Backs up the bind-mounted MovieBreeze Caddyfile under `/var/backups/planbreeze-caddy-*`.
- Adds or updates a marked `dev.planbreeze.com` block without changing MovieBreeze's routes.
- Stops and disables the host nginx service left by the failed migration, removes this project's nginx renewal hook and obsolete migration marker, and restores Caddy's `unless-stopped` restart policy.
- Starts Caddy if needed, validates its configuration, and reloads it. Caddy handles certificate issuance and renewal; Certbot is no longer needed for these apps.

The existing MovieBreeze `public-edge` container must still exist. Its Compose `public` profile should remain enabled. Existing nginx files and Certbot certificates are retained for reference; unrelated certificate renewal jobs are not removed. Do not restart host nginx on ports 80/443.

The Caddyfile is edited in place to preserve its Docker bind mount. A failed Caddy setup restores the original file and restarts Caddy. Backups include the file path and prior restart policy. MovieBreeze deployments should preserve the marked PlanBreeze block in `deploy/dev/Caddyfile`; overwriting that file from another checkout would remove PlanBreeze routing.

## Server environment

```bash
ssh -t -i ~/.ssh/id_trashcan haneyman@dev.planbreeze.com 'sudoedit /etc/planbreeze/api.env'
```

Use the existing MongoDB connection string, database, and authentication settings. New env files leave `MONGODB_URI` blank; deployment checks it before activation. Required settings:

```dotenv
NODE_ENV=production
HOST=10.0.0.240
PORT=3001
SITE_URL=https://dev.planbreeze.com
API_URL=https://dev.planbreeze.com/api
MONGODB_URI=YOUR_EXISTING_MONGODB_CONNECTION_STRING
```

Provisioning updates only `HOST` on existing env files to make the API reachable from Caddy. Preserve the encryption key for any imported calendar connections. Configure credentials from `.env.example`. Use these development callbacks:

- `https://dev.planbreeze.com/api/auth/google/callback`
- `https://dev.planbreeze.com/api/calendar/callback`
- `https://dev.planbreeze.com/api/auth/apple/callback`

Apple also requires its domain registration. Production mode enables secure cookies even though this is the development server.

## Email and background work

Set `MAILGUN_API_KEY`, a verified `MAILGUN_DOMAIN`, `MAILGUN_REGION` (`US` or `EU`), `EMAIL_FROM`, and optionally `EMAIL_REPLY_TO`. Configure Mailgun DNS verification, SPF and DKIM. Then set `EMAIL_ENABLED=true` and `JOBS_ENABLED=true` when ready to run background work and send notifications. Setup defaults both to false. A local mail server is not installed.

Inbound capture uses Postmark-compatible JSON at:

```text
https://dev.planbreeze.com/api/capture/inbound-email?secret=SERVER_INBOUND_EMAIL_SECRET
```

Use the generated server secret, keep the webhook URL private, and configure `INBOUND_EMAIL_DOMAIN` and its provider/MX records. Native Mailgun inbound payloads require an adapter to the existing JSON format. `support@dev.planbreeze.com` is the certificate contact, not an automatically provisioned mailbox. `LETSENCRYPT_EMAIL` overrides that contact for compatibility with the existing scripts.

## Deploy

With Node 24 locally:

```bash
./scripts/deploy-ubuntu.sh
```

The script runs dependency installation, typecheck, tests and build, then uploads compiled artifacts. PM2 restarts both processes using the new release under `/opt/planbreeze/releases`; `/opt/planbreeze/current` selects the active release. The browser uses `/api`. The web process serves static files and falls back to `200.html` for client routes. The API reads server secrets directly through Node's env-file flag.

Activation checks API readiness, the exact frontend files, client routing and HTTPS through Caddy. A failed release restores the previous symlink and both PM2 processes. Old releases remain. Restarts cause brief downtime; application rollback does not undo database writes.

SSH overrides: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PORT`, `DEPLOY_SSH_KEY`. The target's LAN address and public domain are explicitly configured in Caddy, PM2 and server env. The existing public-site GitHub workflow remains separate.

## Inspect and restore

```bash
ssh -t -i ~/.ssh/id_trashcan haneyman@dev.planbreeze.com \
  'sudo -u planbreeze env HOME=/opt/planbreeze PM2_HOME=/opt/planbreeze/.pm2 /usr/local/bin/pm2 status'
ssh -t -i ~/.ssh/id_trashcan haneyman@dev.planbreeze.com \
  'sudo -u planbreeze env HOME=/opt/planbreeze PM2_HOME=/opt/planbreeze/.pm2 /usr/local/bin/pm2 logs --lines 100 --nostream'
curl --fail https://dev.planbreeze.com/api/health
```

To restore a retained release on Ubuntu:

```bash
sudo ln -s /opt/planbreeze/releases/RELEASE_ID /opt/planbreeze/restore
sudo mv -Tf /opt/planbreeze/restore /opt/planbreeze/current
sudo -u planbreeze env HOME=/opt/planbreeze PM2_HOME=/opt/planbreeze/.pm2 \
  /usr/local/bin/pm2 startOrRestart /etc/planbreeze/ecosystem.config.cjs --update-env
sudo -u planbreeze env HOME=/opt/planbreeze PM2_HOME=/opt/planbreeze/.pm2 /usr/local/bin/pm2 save
```

Monitor PM2 logs/disk usage and keep MongoDB backups separately. Caddy's certificates remain in its existing Docker volumes.
