# Shared SSH settings; source from the deployment scripts.
DEPLOY_HOST=${DEPLOY_HOST:-dev.planbreeze.com}
DEPLOY_USER=${DEPLOY_USER:-haneyman}
DEPLOY_PORT=${DEPLOY_PORT:-22}
[[ "$DEPLOY_HOST" =~ ^[a-zA-Z0-9.-]+$ && "$DEPLOY_USER" =~ ^[a-z_][a-z0-9_-]*$ ]] || exit 1
[[ "$DEPLOY_PORT" =~ ^[0-9]+$ ]] && (( DEPLOY_PORT >= 1 && DEPLOY_PORT <= 65535 )) || exit 1
ssh_options=(-o ConnectTimeout=15 -o StrictHostKeyChecking=ask)
# Use the existing SSH agent/config unless an identity is explicitly supplied.
if [[ -n ${DEPLOY_SSH_KEY:-} ]]; then
  [[ -r "$DEPLOY_SSH_KEY" ]] || { echo 'DEPLOY_SSH_KEY must be a readable private-key path.' >&2; exit 1; }
  ssh_options+=(-i "$DEPLOY_SSH_KEY" -o IdentitiesOnly=yes)
fi
ssh_options+=(-p "$DEPLOY_PORT")
scp_options=("${ssh_options[@]:0:${#ssh_options[@]}-2}" -P "$DEPLOY_PORT")
remote="$DEPLOY_USER@$DEPLOY_HOST"
