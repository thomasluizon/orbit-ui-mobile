#!/usr/bin/env bash
# Installs one Android SDK package with the SDK manager of the runner image, in up to 4 attempts.
# Usage: install-android-sdk-package.sh <package> <check>...
# Each check names a file under the package directory: "<file>" requires a non-empty file, and
# "<file>=<line>" requires that exact line in the file. An attempt counts only when the SDK manager exits 0
# and every check passes. The SDK manager resumes a download from the partial archive that it keeps in .temp
# and .downloadIntermediates of the SDK root, so one corrupt archive there fails each later attempt. A failed
# attempt deletes the package directory and those two directories before the next attempt.
set -euo pipefail

package=${1:?Name the SDK package to install.}
shift
if [ "$#" -eq 0 ]; then
  echo "::error::Name at least one file that proves $package installed." >&2
  exit 2
fi
sdkmanager="${ANDROID_HOME:?}/cmdline-tools/latest/bin/sdkmanager"
# The SDK manager installs a package at its path, with each ";" as a directory separator.
directory="$ANDROID_HOME/${package//;//}"

if [ ! -x "$sdkmanager" ]; then
  echo "::error::sdkmanager is missing at $sdkmanager, so $package cannot install."
  exit 1
fi

verified() {
  local check
  for check in "$@"; do
    case "$check" in
      *=*) grep -Fqx -- "${check#*=}" "$directory/${check%%=*}" 2> /dev/null || return 1 ;;
      *) [ -s "$directory/$check" ] || return 1 ;;
    esac
  done
}

for attempt in 1 2 3 4; do
  # Channel 0 is the stable channel. The emulator runner installs from it too, so it accepts this revision.
  if "$sdkmanager" --sdk_root="$ANDROID_HOME" --install "$package" --channel=0 < <(yes) > /dev/null &&
     verified "$@"; then
    echo "Installed and verified $package on attempt $attempt."
    exit 0
  fi
  echo "::warning::Attempt $attempt did not install $package."
  rm -rf "${directory:?}" "$ANDROID_HOME/.temp" "$ANDROID_HOME/.downloadIntermediates"
  if [ "$attempt" -lt 4 ]; then sleep $((attempt * 5)); fi
done
echo "::error::$package did not install in 4 attempts."
exit 1
