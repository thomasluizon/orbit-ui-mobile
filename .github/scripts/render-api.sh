# Render reads are idempotent; an ambiguous deploy write permits only read-only reconciliation.
render_retry_delay() {
  # Render advertises seconds. Cap waits at 90 seconds, matching curl's retry budget.
  awk '
    /^HTTP\// { delay = "" }
    tolower($1) == "retry-after:" { delay = $2; sub(/\r$/, "", delay) }
    END { if (delay ~ /^[0-9]+$/) print (delay + 0 > 90 ? 90 : delay + 0); else print 2 }
  ' "$1"
}

render_get() (
  set -euo pipefail
  local response headers http_code attempt exit_code
  response=$(mktemp); headers=$(mktemp)
  trap 'rm -f "$response" "$headers"' EXIT
  for attempt in 1 2 3; do
    : > "$headers"
    # Without --fail, permanent 4xx responses bypass curl's transport retries.
    if http_code=$(curl --silent --show-error --retry 3 --retry-all-errors --retry-delay 2 \
      --retry-max-time 90 --connect-timeout 10 --max-time 30 --dump-header "$headers" \
      -o "$response" -w '%{http_code}' "$1" -H "Authorization: Bearer ${RENDER_API_KEY}"); then
      case "$http_code" in
        2??) cat "$response"; return 0 ;;
        429|5??) ;;
        *) echo "Render read failed with HTTP ${http_code}" >&2; return 22 ;;
      esac
      exit_code=22
    else
      exit_code=$?
    fi
    if [ "$attempt" = 3 ]; then
      echo "Render read failed after 3 attempts with HTTP ${http_code}" >&2
      return "$exit_code"
    fi
    sleep "$(render_retry_delay "$headers")"
  done
)

render_reconcile_deploy() {
  local image_url="$1" existing_ids="$2" started_at="$3" attempt recent_deploys deploy_id
  for attempt in $(seq 1 12); do
    sleep 5
    recent_deploys=$(render_get "https://api.render.com/v1/services/${SERVICE_ID}/deploys?limit=100&createdAfter=${started_at}") || return "$?"
    deploy_id=$(jq -er --arg image "$image_url" --argjson existing "$existing_ids" '
      if type != "array" or any(.[]; (.deploy | type) != "object" or
        (.deploy.id | type) != "string" or .deploy.id == "" or (.deploy.image.ref | type) != "string")
      then error("Expected an image deploy list") else
        [.[] | .deploy | .id as $id | select(.image.ref == $image and ($existing | index($id)) == null) | .id] | first // ""
      end' <<< "$recent_deploys") || return "$?"
    if [ -n "$deploy_id" ]; then printf '%s\n' "$deploy_id"; return 0; fi
  done
  echo "Render deploy acceptance is unresolved for ${image_url} since ${started_at}; check the service's deploys before dispatching again" >&2
  return 1
}

render_deploy() (
  set -euo pipefail
  local image_url="$1" response headers http_code attempt exit_code started_at existing_ids
  response=$(mktemp); headers=$(mktemp)
  trap 'rm -f "$response" "$headers"' EXIT
  started_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  existing_ids=$(render_get "https://api.render.com/v1/services/${SERVICE_ID}/deploys?limit=100" | jq -ce '
    if type != "array" or any(.[]; (.deploy.id | type) != "string" or .deploy.id == "")
    then error("Expected deploy ids before requesting a deploy") else [.[] | .deploy.id] end') || return "$?"
  for attempt in 1 2 3; do
    : > "$headers"
    if http_code=$(curl --fail --silent --show-error --connect-timeout 10 --max-time 30 \
      --dump-header "$headers" -o "$response" -w '%{http_code}' -X POST "https://api.render.com/v1/services/${SERVICE_ID}/deploys" \
      -H "Authorization: Bearer ${RENDER_API_KEY}" -H 'Content-Type: application/json' \
      -d "$(jq -nc --arg image "$image_url" '{imageUrl:$image}')"); then
      if [ "$http_code" != 201 ]; then
        echo "Render answered HTTP ${http_code}; only a 201 names the deploy to follow" >&2
        return 1
      fi
      jq -er --arg image "$image_url" 'select(.image.ref == $image) | .id | select(type == "string" and length > 0)' "$response"
      return
    else
      exit_code=$?
    fi
    case "$http_code" in
      429) ;;
      000) case "$exit_code" in
        6|7) ;;
        *) render_reconcile_deploy "$image_url" "$existing_ids" "$started_at"; return "$?" ;;
      esac ;;
      5??|201) render_reconcile_deploy "$image_url" "$existing_ids" "$started_at"; return "$?" ;;
      *)
        if [ "$exit_code" != 22 ]; then
          render_reconcile_deploy "$image_url" "$existing_ids" "$started_at"; return "$?"
        fi
        echo "Render deploy request failed with HTTP ${http_code}" >&2; return 1 ;;
    esac
    # Only a refusal or a failure to resolve/connect proves that no deploy was accepted.
    if [ "$attempt" != 3 ]; then sleep "$(render_retry_delay "$headers")"; fi
  done
  echo "Render deploy request failed after 3 attempts for ${image_url}" >&2
  return 1
)
