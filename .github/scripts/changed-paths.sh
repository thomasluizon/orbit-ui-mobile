#!/usr/bin/env bash
set -euo pipefail

base_ref=$1
output_dir=$2
base="refs/remotes/origin/$base_ref"

if ! git rev-parse --verify --quiet "$base^{commit}" > /dev/null; then
  if ! git fetch --no-tags origin "refs/heads/$base_ref:$base"; then
    echo "::error::Cannot resolve base ref $base_ref after one fetch attempt." >&2
    exit 1
  fi
fi

if ! git diff --name-only --diff-filter=ACMRD -z "$base...HEAD" > "$output_dir/changed-paths.nul"; then
  echo "::error::Cannot diff base ref $base_ref against HEAD." >&2
  exit 1
fi

tr '\0' '\n' < "$output_dir/changed-paths.nul" > "$output_dir/changed-paths.txt"
: > "$output_dir/changed-paths-present.nul"
while IFS= read -r -d '' path; do
  if [ -f "$path" ]; then
    printf '%s\0' "$path" >> "$output_dir/changed-paths-present.nul"
  fi
done < "$output_dir/changed-paths.nul"
