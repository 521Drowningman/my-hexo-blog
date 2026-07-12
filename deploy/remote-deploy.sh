#!/usr/bin/env bash

set -Eeuo pipefail
umask 022

deploy_base=${1:?Usage: remote-deploy.sh DEPLOY_BASE RELEASE_ID ARCHIVE}
release_id=${2:?Usage: remote-deploy.sh DEPLOY_BASE RELEASE_ID ARCHIVE}
archive=${3:?Usage: remote-deploy.sh DEPLOY_BASE RELEASE_ID ARCHIVE}

[[ "$deploy_base" =~ ^/[A-Za-z0-9._/-]+$ ]] || {
  echo "Invalid deployment base: $deploy_base" >&2
  exit 1
}
[[ "$release_id" =~ ^[0-9a-f]{40}$ ]] || {
  echo "Release id must be a full Git commit SHA" >&2
  exit 1
}

deploy_base=$(cd "$deploy_base" && pwd -P)
archive=$(cd "$(dirname "$archive")" && pwd -P)/$(basename "$archive")

releases_dir="$deploy_base/releases"
release_dir="$releases_dir/$release_id"
expected_archive="$deploy_base/incoming/$release_id.tar.gz"
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

[[ "$archive" == "$expected_archive" ]] || {
  echo "Unexpected archive path: $archive" >&2
  exit 1
}
[[ -f "$archive" ]] || {
  echo "Release archive does not exist: $archive" >&2
  exit 1
}

mkdir -p "$releases_dir"
if [[ -e "$release_dir" ]]; then
  [[ -d "$release_dir" && -f "$release_dir/index.html" ]] || {
    echo "Existing release is incomplete: $release_dir" >&2
    exit 1
  }
else
  mkdir "$release_dir"
  cleanup_failed_release() {
    rm -rf -- "$release_dir"
  }
  trap cleanup_failed_release ERR

  tar -xzf "$archive" -C "$release_dir"
  [[ -f "$release_dir/index.html" ]] || {
    echo "Release does not contain index.html" >&2
    exit 1
  }
  trap - ERR
fi

if [[ -L "$current_link" ]]; then
  old_release=$(readlink -f "$current_link")
  if [[ "$old_release" == "$release_dir" ]]; then
    rm -f -- "$archive"
    echo "Release $release_id is already active"
    exit 0
  fi
  case "$old_release" in
    "$releases_dir"/*)
      ln -sfn "$old_release" "$deploy_base/.previous-next"
      replace_link "$deploy_base/.previous-next" "$previous_link"
      ;;
    *)
      echo "Current link points outside the releases directory" >&2
      exit 1
      ;;
  esac
elif [[ -e "$current_link" ]]; then
  echo "$current_link exists but is not a symbolic link" >&2
  exit 1
fi

ln -s "$release_dir" "$deploy_base/.current-$release_id"
replace_link "$deploy_base/.current-$release_id" "$current_link"
rm -f -- "$archive"

echo "Activated release $release_id"
