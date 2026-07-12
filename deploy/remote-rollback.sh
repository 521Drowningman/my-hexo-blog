#!/usr/bin/env bash

set -Eeuo pipefail

deploy_base=${1:?Usage: remote-rollback.sh DEPLOY_BASE}

[[ "$deploy_base" =~ ^/[A-Za-z0-9._/-]+$ ]] || {
  echo "Invalid deployment base: $deploy_base" >&2
  exit 1
}

deploy_base=$(cd "$deploy_base" && pwd -P)

releases_dir="$deploy_base/releases"
current_link="$deploy_base/current"
previous_link="$deploy_base/previous"

replace_link() {
  local source_link=$1
  local destination_link=$2

  if mv --version > /dev/null 2>&1; then
    mv -Tf "$source_link" "$destination_link"
  else
    mv -hf "$source_link" "$destination_link"
  fi
}

[[ -L "$current_link" ]] || {
  echo "Current release link is missing" >&2
  exit 1
}
[[ -L "$previous_link" ]] || {
  echo "Previous release link is missing; automatic rollback is unavailable" >&2
  exit 1
}

current_release=$(readlink -f "$current_link")
previous_release=$(readlink -f "$previous_link")

case "$current_release" in
  "$releases_dir"/*) ;;
  *) echo "Current release points outside the releases directory" >&2; exit 1 ;;
esac
case "$previous_release" in
  "$releases_dir"/*) ;;
  *) echo "Previous release points outside the releases directory" >&2; exit 1 ;;
esac

[[ -f "$previous_release/index.html" ]] || {
  echo "Previous release is incomplete" >&2
  exit 1
}

ln -sfn "$previous_release" "$deploy_base/.current-rollback"
replace_link "$deploy_base/.current-rollback" "$current_link"
ln -sfn "$current_release" "$deploy_base/.previous-rollback"
replace_link "$deploy_base/.previous-rollback" "$previous_link"

echo "Rolled back to $(basename "$previous_release")"
