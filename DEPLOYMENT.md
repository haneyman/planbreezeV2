# Ubuntu development deployment

This workflow targets `haneyman@10.0.0.240`, `/opt/planbreeze`, and
`https://dev.planbreeze.com`. It does not provision or deploy automatically.
Use Node 24 LTS and npm with the committed `package-lock.json`.

## Runtime and nginx mismatch

`npm run build` compiles the NestJS API and runs **nuxt generate**.
`nuxt.config.ts` sets `ssr: false`: `.output/public` is a static SPA, not a
Nuxt Node server. The existing NestJS entry point is
`server/dist/server/src/main.js`; it binds HOST/PORT and handles `/api/*`.
It does not serve `/`. This deployment does not invent a frontend server.

The current nginx catch-all proxy to 3001 cannot serve this frontend.
A one-time, manual nginx change is necessary. In the **existing** HTTPS
`server` block for dev.planbreeze.com, replace its catch-all proxy location
with the following locations and root. Preserve all TLS directives and other
unrelated configuration. Review any existing overlapping locations first.

```nginx
root /opt/planbreeze/current/public;
index index.html;
location /api/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 120s;
    client_max_body_size 300k;
}
location = /deployment-release.txt {
    add_header Cache-Control "no-store" always;
    try_files $uri =404;
}
location / {
    add_header Cache-Control "no-cache" always;
    try_files $uri $uri/ /200.html;
}
```

After manual review, `sudo nginx -t && sudo systemctl reload nginx`.
Do not change certificates, DNS, firewall, MongoDB, or unrelated sites.
The deploy scripts never edit nginx. Before the first release exists, static
requests will fail; schedule the first activation accordingly. nginx needs
traversal/read access to the public artifacts, which are installed with their
normal public build permissions. Do not expose shared configuration as an alias.

## First-time preparation (manual)

1. Install Node 24 LTS **at /usr/bin/node**, npm, rsync, curl, Bash, util-linux
   (flock/runuser), iproute2 (ss), and systemd using your approved Ubuntu
   package procedure. Node must be available to the planbreeze account without
   interactive shell initialization. No Docker, Caddy, or PM2 is used here.
2. Verify the existing `planbreeze` user and group, home `/opt/planbreeze`.
   Stop any old PlanBreeze API/web process manager before first activation so
   there is exactly one API/worker. Do not stop unrelated services. The
   uncommitted `deploy/ecosystem.config.cjs` and `scripts/*ubuntu.sh` describe a
   separate older workflow; do not combine it with this one.
3. Prepare only these directories:

   ```bash
   sudo install -d -o planbreeze -g planbreeze -m 0755 /opt/planbreeze /opt/planbreeze/releases
   sudo install -d -o planbreeze -g planbreeze -m 0700 /opt/planbreeze/shared
   sudo test -e /opt/planbreeze/shared/app.env || sudo install -o planbreeze -g planbreeze -m 0600 /dev/null /opt/planbreeze/shared/app.env
   sudo -u planbreeze nano /opt/planbreeze/shared/app.env
   ```

   The guard creates app.env only if absent. Retain this file across releases; never copy the local `.env`. Use
   Node's dotenv syntax and `.env.example` as a checklist. At minimum configure:

   ```dotenv
   NODE_ENV=production
   HOST=127.0.0.1
   PORT=3001
   SITE_URL=https://dev.planbreeze.com
   API_URL=https://dev.planbreeze.com/api
   MONGODB_URI=<existing separately managed standalone database connection>
   SESSION_SECRET=<at least 32 random characters>
   TOKEN_ENCRYPTION_KEY=<base64 32 bytes; preserve existing key for existing tokens>
   JOBS_ENABLED=false
   EMAIL_ENABLED=false
   ```

   Configure OAuth and OpenAI credentials as needed. Add dev.planbreeze.com
   callback URLs to the relevant providers separately. Enable jobs deliberately:
   they can write Calendar/send email. Deployment changes neither database nor
   provider configuration; application jobs and normal requests may write data.
   systemd supplies NODE_ENV/HOST/PORT explicitly, overriding file values.
   Secrets are loaded by Node directly, never sourced as shell code or logged.
4. Copy `deploy/planbreeze.service` to `/etc/systemd/system/planbreeze.service`
   as root (0644), then:

   ```bash
   sudo systemd-analyze verify /etc/systemd/system/planbreeze.service
   sudo systemctl daemon-reload
   sudo systemctl enable planbreeze.service
   ```

   Do not start until `current` exists. The unit runs one unprivileged NestJS
   process, starts after reboot, and restarts on failure. Logs go to journald.
5. Ensure haneyman has trusted SSH key access, with the server fingerprint
   verified and stored in local known_hosts. Scripts enforce strict host-key
   checking and batch mode. Configure noninteractive sudo for the deployment
   administrator: scripts require `sudo -n bash -s` and
   `sudo -n -u planbreeze rsync`. **The Bash permission is effectively root
   access**; grant it only to a trusted administrator, never a restricted CI
   identity. Existing passwordless administrator sudo works. A future restricted
   deployment identity needs a root-owned installed helper with fixed arguments,
   not a sudoers entry allowing arbitrary Bash. No passwords or keys belong in
   this repository.
6. Apply the necessary manual nginx change above. Confirm the database is
   reachable from the server independently; this workflow does not install,
   configure, import, or back up MongoDB.

## Deploy from the local repository

```bash
export PATH="$HOME/.nvm/versions/node/v24.22.2/bin:$PATH" # or your Node 24 installation
./scripts/deploy.sh --dry-run
./scripts/deploy.sh
```

Dry run validates local prerequisites and prints intended actions; it performs
no installation, build, SSH connection, or server changes. It cannot certify
remote readiness. Real deployment runs `npm ci`, typecheck, tests, and the full
build **before any SSH operation**. The build overrides NUXT_PUBLIC_API_URL to
the target HTTPS API URL; this is compiled into the static frontend. Other local
.env values are not uploaded. Ensure build tooling has no additional private
public-runtime settings before changing frontend configuration.

Configuration variables: DEPLOY_HOST=10.0.0.240, DEPLOY_USER=haneyman,
DEPLOY_ROOT=/opt/planbreeze, APP_HOST=127.0.0.1, APP_PORT=3001,
HEALTHCHECK_URL=https://dev.planbreeze.com (origin only; no trailing slash).
Root and binding are deliberately constrained to the specified values: changing
them requires reviewing the unit, remote helper, deletion guards, and nginx
configuration together. Host/user and public origin can be overridden.

Only public build files, compiled API files, package.json, package-lock.json,
and the nonsecret helper are transferred to a fresh UTC timestamp/random-suffix
release. No source tree, .git, node_modules, dotenv files, logs, test output,
editor files, caches, or source maps are transferred. Remote runtime dependencies
are required for NestJS: `npm ci --omit=dev --ignore-scripts` installs the locked
production tree as planbreeze. This includes frontend packages because the
repository has one package manifest; no independent runtime lockfile is invented.
Lifecycle scripts are disabled because the root postinstall is `nuxt prepare`.
Ubuntu needs outbound access to the npm registry.

Activation/rollback take a server-side flock shared across operators. Uploads
use unique directories, so interrupted uploads leave current untouched. Atomic
`mv -T` replaces the current symlink. A single systemd restart causes a brief
API outage; there is no zero-downtime claim or overlapping worker process.
Frontend requests may observe the new static release during startup.

Checks retry up to 12 times: systemd active, exact loopback-only port listener,
loopback `/api/health`, public HTTPS `/api/health`, and public frontend bytes plus
release marker. Public requests run on the server with TLS verification and
normal DNS, so the server must reach its own public HTTPS origin. Health detects
API startup/database connection, not every provider or collection operation.

On activation failure the previous current symlink is restored and its service
restarted. On first-deploy failure there is no previous version: stop the unit
and remove current. Failed releases remain for diagnosis and are never counted
as successful. After success keep the newest five successful releases; current
and the immediately previous release are additionally protected (so exceptional
rollback histories can retain more than five). No pruning happens on rollback.
An SSH outage, SIGKILL, or server power loss can prevent the recovery trap from
running; reconnect, inspect current/service, and invoke rollback if needed.

## Rollback

```bash
./scripts/rollback.sh --dry-run
./scripts/rollback.sh
```

Rollback atomically switches to `previous`, restarts, and performs the same
checks. A failed rollback restores the original current. A successful rollback
makes the version just left available as previous, allowing a toggle back.
Code/static artifacts roll back together. Database changes, environment edits,
provider actions, and systemd configuration do not roll back. Preserve schema
compatibility and backups separately; no database migration is run here.

## Diagnostics

```bash
ssh haneyman@10.0.0.240
sudo systemctl status planbreeze.service
sudo journalctl -u planbreeze.service -n 100 --no-pager
sudo ss -ltnp 'sport = :3001'
curl --fail http://127.0.0.1:3001/api/health
curl --fail https://dev.planbreeze.com/api/health
curl --fail https://dev.planbreeze.com/deployment-release.txt
readlink -f /opt/planbreeze/current
readlink -f /opt/planbreeze/previous
```

A 404 on loopback `/` is expected: NestJS is an API, while nginx serves `/`.
A public JSON/404 root or missing release marker usually means nginx still has
the catch-all proxy. Connection refusal suggests service startup/configuration
failure; inspect journald without sharing secrets. Failed dependency uploads or
installs leave inactive releases; remove only individually verified inactive
paths under `/opt/planbreeze/releases`. Do not recursively chmod/chown the home.
