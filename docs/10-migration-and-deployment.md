# Migration and deployment

This is a coordinated backend and frontend cutover. Repository changes do not alter the live Convex deployment. Do not switch the frontend until the replacement API, import, provider callbacks, and smoke checks pass.

## Prepare

1. Use the MongoDB instance already running on the production droplet. Keep it in standalone mode, enable authentication, and create a database user scoped to the PlanBreeze database. Keep MongoDB bound to loopback and port 27017 closed to public traffic. Configure scheduled backups stored off the droplet and rehearse a restore. No replica-set conversion is needed.
2. Install Node 24 LTS on the existing droplet. Run one API process as a dedicated unprivileged account, listening on `127.0.0.1:3001` behind nginx. The API also runs jobs and schedules.
3. Put production secrets in `/etc/planbreeze/api.env` (readable only by the service account/root). Use `.env.example` as the checklist. Set `NODE_ENV=production`, `SITE_URL=https://planbreeze.com`, `API_URL=https://planbreeze.com/api`, `PORT=3001`, and the authenticated local MongoDB connection URI. Preserve the old token encryption key if importing Google connections.
   Example production URI (use the database where the app user was created):

   ```text
   MONGODB_URI=mongodb://planbreeze:<URL-encoded-password>@127.0.0.1:27017/planbreeze?authSource=planbreeze
   ```

   The API uses standalone MongoDB without transactions. Multi-document writes can partially complete if the database or process fails. The local `compose.yaml` is a development configuration; production uses the droplet’s existing MongoDB instance with its own persistent storage and authentication.

4. Add the new Google login/Calendar and Apple callback URLs documented in README. Keep old callbacks during preparation so the old frontend keeps working. Set the new inbound email endpoint only at cutover.
5. Configure nginx `/api/` before the SPA fallback:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 120s;
    client_max_body_size 300k;
}
```

Do not strip `/api` in the proxy. Keep the existing TLS certificate and static frontend release setup.

A minimal systemd unit (adjust paths/user to the actual installation):

```ini
[Unit]
Description=PlanBreeze API
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=planbreeze
WorkingDirectory=/opt/planbreeze/current
EnvironmentFile=/etc/planbreeze/api.env
ExecStart=/usr/bin/node server/dist/server/src/main.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

Build with `npm ci && npm run build:api`. Deploy the compiled `server/dist`, `package.json`, lockfile, and production `node_modules` (install with `npm ci --omit=dev --ignore-scripts` in the release directory). The root postinstall is a frontend preparation step, so skip it for a backend-only production installation. Keep previous API releases and switch the API release symlink before restarting systemd. Check `/api/health` after each restart.

## Rehearse the import

Export a Convex snapshot using the existing deployment's dashboard or CLI, then extract it locally. The importer expects `<snapshot>/<table>/documents.jsonl`. Do not commit the snapshot or secrets.

```bash
npm run build:api
npm run import:convex -- /path/to/extracted-snapshot
# With MONGODB_URI set to an empty staging database:
npm run import:convex -- /path/to/extracted-snapshot --apply
```

Default execution validates and reports counts without connecting to MongoDB. `--apply` requires an empty target. It checks references, schema validation, and unique-key conflicts, imports documents sequentially, and verifies counts. If the import fails, partial data may remain; diagnose the error and retry into a fresh empty database. The importer never clears an existing database automatically. It retains original IDs and encrypted tokens, maps Google/Apple `authAccounts` to stable provider identities, and does not copy auth sessions or in-flight OAuth states. All users sign in again.

Interrupted chat replies become a retry message. Processing captures become failed with instructions to paste again, because Convex scheduled-function payloads are not present in the exported capture records. Pending committed plans get replacement calendar-write jobs. Review pending Convex scheduled functions before cutover; the importer does not replay previously queued email notifications.

## Cut over

1. Run typecheck, tests, build, and a staging rehearsal with a fresh export.
2. Pause frontend writes for a short maintenance window. Stop/disable the old backend's schedules and allow or account for outstanding scheduled functions. Export the final snapshot after writes stop.
3. Import into a fresh production database with API workers disabled (`JOBS_ENABLED=false`, `EMAIL_ENABLED=false`). Back up the import and verify counts and a sample of plan/member/calendar relationships.
4. Start the API and verify HTTPS `/api/health`, Google/Apple login, private plans, all circle roles, and separate Calendar consent. Verify an imported connection can decrypt its token. Confirm Radar does not write Calendar; commit/uncommit create/remove only marked events.
5. Set `NUXT_PUBLIC_API_URL=https://planbreeze.com/api` and build/deploy the frontend. The static deployment script checks the replacement API health marker before switching releases.
6. Update the inbound email webhook URL and enable the new worker. Enable Mailgun only after checking recipients and sending configuration. Verify chat, grounded discovery, capture, calendar updates, and invite delivery with real credentials.
7. Reopen writes. Retain the final snapshot, old frontend/API releases, and old backend for the agreed rollback period. Remove old provider callbacks and retire Convex only after acceptance.

The current GitHub workflow verifies and deploys static assets only; API provisioning/restarts and the database import are deliberate release operations. It will refuse a frontend release when the new API is unavailable. Do not run the old and new schedulers against the same Google accounts concurrently.

## Rollback

Before reopening writes, restore the previous frontend release and old provider/webhook URLs, stop the new API workers, and re-enable the old backend schedules. After new writes have been accepted, a frontend rollback alone loses access to those changes: stop writes, export the new MongoDB data, and reconcile it before returning to Convex. Keep backups and do not delete either database during the acceptance period.
