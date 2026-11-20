#!/usr/bin/env bash
set -Eeuo pipefail
# Executed through SSH by deploy.sh; never source a server environment file as shell code.
mode=${1:?}
url=${2:?}
id=${3:-}
root=/opt/planbreeze
log() { printf '[%s] %s\n' "$(date -u +%FT%TZ)" "$*"; }
[[ $EUID == 0 && $url =~ ^https://[a-zA-Z0-9.-]+(:[0-9]+)?$ ]]
for tool in flock curl systemctl runuser node npm ss; do command -v "$tool" >/dev/null; done
[[ $(/usr/bin/node -p 'process.versions.node.split(".")[0]') == 24 ]]
[[ $(getent passwd planbreeze | cut -d: -f6) == "$root" ]]
for dir in "$root" "$root/releases" "$root/shared"; do [[ -d $dir && ! -L $dir ]]; done
[[ -s $root/shared/app.env && ! -L $root/shared/app.env ]]
runuser -u planbreeze -- test -r "$root/shared/app.env"
systemctl is-enabled --quiet planbreeze.service
# Root-owned lock directory prevents the service account substituting a lock symlink.
install -d -m 0755 /run/planbreeze-deploy
exec 9>/run/planbreeze-deploy/lock
flock -w 600 9
valid_release() { [[ $1 =~ ^/opt/planbreeze/releases/[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}$ && -d $1 && ! -L $1 ]]; }
switch_link() {
  local target=$1 name=$2
  rm -f -- "$root/.$name.next"
  ln -s "$target" "$root/.$name.next"
  mv -Tf "$root/.$name.next" "$root/$name"
}
if [[ $mode == prepare ]]; then
  [[ $id =~ ^[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}$ ]]
  [[ ! -e $root/releases/$id ]]
  install -d -o planbreeze -g planbreeze -m 0755 "$root/releases/$id"
  exit
fi
old=
if [[ -L $root/current ]]; then
  old=$(readlink -f "$root/current")
  valid_release "$old"
else
  [[ ! -e $root/current ]]
fi
[[ ! -e $root/previous || -L $root/previous ]]
if [[ $mode == rollback ]]; then
  target=$(readlink -f "$root/previous")
  valid_release "$target"
  test -f "$target/.successful"
elif [[ $mode == deploy ]]; then
  [[ $id =~ ^[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}$ ]]
  target="$root/releases/$id"
  valid_release "$target"
  for file in package.json package-lock.json public/index.html public/200.html server/dist/server/src/main.js; do test -s "$target/$file"; done
  log "Installing production dependencies in $target"
  # Node's built-in env-file loads shared secrets in systemd; no release .env.
  (cd "$target"; runuser -u planbreeze -- npm ci --omit=dev --ignore-scripts --no-audit --no-fund)
else
  exit 2
fi
health() {
  systemctl is-active --quiet planbreeze.service || return 1
  # Reject unintended additional/wildcard listeners on the application port.
  local listeners
  listeners=$(ss -H -ltn 'sport = :3001' | awk '{print $4}')
  [[ $listeners == 127.0.0.1:3001 ]] || return 1
  curl -fsS --max-time 5 http://127.0.0.1:3001/api/health | /usr/bin/node -e 'let s="";for await(const c of process.stdin)s+=c;const j=JSON.parse(s);if(j.ok!==true||j.service!=="planbreeze-api")process.exit(1)' || return 1
  curl -fsS --max-time 10 "$url/api/health" | /usr/bin/node -e 'let s="";for await(const c of process.stdin)s+=c;const j=JSON.parse(s);if(j.ok!==true||j.service!=="planbreeze-api")process.exit(1)' || return 1
  curl -fsS --max-time 10 "$url/" -o /run/planbreeze-deploy/index.html || return 1
  cmp -s /run/planbreeze-deploy/index.html "$target/public/index.html" || return 1
  [[ $(curl -fsS --max-time 10 "$url/deployment-release.txt") == "${target##*/}" ]]
}
recover() {
  local status=${1:-$?}
  trap - ERR INT TERM
  log 'Activation failed; restoring previous current' >&2
  if [[ -n $old ]]; then
    switch_link "$old" current
    if systemctl restart planbreeze.service; then
      target=$old
      local restored=false
      for ((attempt=1; attempt<=12; attempt++)); do
        if health; then restored=true; break; fi
        sleep 2
      done
      if ! $restored; then log 'CRITICAL: restored release failed health checks; inspect journal/nginx' >&2; fi
    else
      log 'CRITICAL: previous service restart failed; inspect journal' >&2
    fi
  else
    systemctl stop planbreeze.service || true
    rm -f -- "$root/current"
    log 'First deployment failed; no previous release existed' >&2
  fi
  exit "$status"
}
trap recover ERR
trap 'recover 130' INT
trap 'recover 143' TERM
log "Activating $target"
switch_link "$target" current
systemctl restart planbreeze.service
healthy=false
for ((attempt=1; attempt<=12; attempt++)); do
  if health; then healthy=true; break; fi
  sleep 2
done
$healthy
# Commit release metadata before pruning. Keep current and previous even if older.
runuser -u planbreeze -- touch "$target/.successful"
if [[ -n $old && $old != "$target" ]]; then switch_link "$old" previous; fi
trap - ERR INT TERM
log "Healthy: $target"
if [[ $mode == deploy ]]; then
  count=0
  while IFS= read -r candidate; do
    valid_release "$candidate" || continue
    [[ -f $candidate/.successful ]] || continue
    count=$((count + 1))
    if ((count > 5)) && [[ $candidate != "$target" && $candidate != "$old" ]]; then
      log "Removing old successful release $candidate"
      rm -rf --one-file-system -- "$candidate"
    fi
  done < <(find "$root/releases" -mindepth 1 -maxdepth 1 -type d | sort -r)
fi
