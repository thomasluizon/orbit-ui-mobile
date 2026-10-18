#!/usr/bin/env bash
set -euo pipefail

module_dir="$(cd "$(dirname "$0")" && pwd)"
test_dir="$(mktemp -d)"
trap 'rm -rf "$test_dir"' EXIT

kotlinc \
  "$module_dir/src/main/java/org/useorbit/app/widget/WidgetAccountState.kt" \
  "$module_dir/src/test/java/org/useorbit/app/widget/WidgetAccountStateTest.kt" \
  -d "$test_dir/widget-ownership.jar"
kotlin -classpath "$test_dir/widget-ownership.jar" org.useorbit.app.widget.WidgetAccountStateTestKt
