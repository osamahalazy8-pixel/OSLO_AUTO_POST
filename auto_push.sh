#!/usr/bin/env bash
set -euo pipefail

branch="main"
repository_url="https://github.com/osamahalazy8-pixel/OSLO_AUTO_POST.git"
message="${1:-Update OSLO_AUTO_POST}"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Error: run this script from inside the Git repository." >&2
  exit 1
fi

if git remote get-url origin >/dev/null 2>&1; then
  configured_url="$(git remote get-url origin)"
  if [[ "$configured_url" != "$repository_url" ]]; then
    echo "Error: origin points to $configured_url, expected $repository_url." >&2
    exit 1
  fi
else
  git remote add origin "$repository_url"
fi

git add -A
if git diff --cached --quiet; then
  echo "No staged changes to commit."
  exit 0
fi

git commit -m "$message"
git push origin "HEAD:$branch"
