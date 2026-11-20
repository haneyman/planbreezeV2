#!/usr/bin/env bash
set -Eeuo pipefail
# The shared driver selects rollback mode from this script's basename.
source "$(dirname "${BASH_SOURCE[0]}")/deploy.sh"
