# Render reads are idempotent; deploy writes require reconciliation before another attempt.
render_get() (
  set -euo pipefail
  local response http_code attempt exit_code
  response=$(mktemp)
  trap 'rm -f "$response"' EXIT
  for attempt in 1 2 3; do
    # --fail with --retry-all-errors would also retry permanent 4xx responses.
    # Check HTTP errors separately to preserve --fail semantics without those retries.
    if http_code=$(curl --silent --show-error --retry 3 --retry-all-errors --retry-delay 2 \
      --retry-max-time 90 --connect-timeout 10 --max-time 30 \
      -o "$response" -w '%{http_code}' "$1" -H "Authorization: Bearer ${RENDER_API_KEY}"); then
      exit_code=0
    else
      exit_code=$?
      if [ "$attempt" != 3 ]; then sleep 2; continue; fi
      return "$exit_code"
    fi
    case "$http_code" in
      2??) cat "$response"; return 0 ;;
      5??) if [ "$attempt" != 3 ]; then sleep 2; continue; fi ;;
    esac
    echo "Render read failed with HTTP ${http_code}" >&2
    return 22
  done
)

render_deploy() (
  set -euo pipefail
  local image_url="$1" response http_code attempt deploy_id recent_deploys
  response=$(mktemp)
  trap 'rm -f "$response"' EXIT
  for attempt in 1 2 3; do
    if http_code=$(curl --fail --silent --show-error --connect-timeout 10 --max-time 30 \
      -o "$response" -w '%{http_code}' -X POST "https://api.render.com/v1/services/${SERVICE_ID}/deploys" \
      -H "Authorization: Bearer ${RENDER_API_KEY}" -H 'Content-Type: application/json' \
      -d "$(jq -nc --arg image "$image_url" '{imageUrl:$image}')"); then
      if [ "$http_code" != 201 ]; then
        echo "Render answered HTTP ${http_code}; only a 201 names the deploy to follow" >&2
        return 1
      fi
      jq -er --arg image "$image_url" 'select(.image.ref == $image) | .id | select(type == "string" and length > 0)' "$response"
      return
    fi
    case "$http_code" in
      429|5??|000|201) ;;
      *) echo "Render deploy request failed with HTTP ${http_code}" >&2; return 1 ;;
    esac
    # A lost response can hide a successful write. Never resend unless this read succeeds.
    sleep 2
    recent_deploys=$(render_get "https://api.render.com/v1/services/${SERVICE_ID}/deploys?limit=100") || return "$?"
    deploy_id=$(jq -er --arg image "$image_url" '
      if type != "array" or any(.[]; (.deploy | type) != "object" or
        (.deploy.id | type) != "string" or (.deploy.image.ref | type) != "string")
      then error("Expected an image deploy list") else
        [.[] | .deploy | select(.image.ref == $image) | .id | select(type == "string" and length > 0)] | first // ""
      end' <<< "$recent_deploys") || return "$?"
    if [ -n "$deploy_id" ]; then printf '%s\n' "$deploy_id"; return 0; fi
  done
  echo "Render deploy request failed after 3 attempts for ${image_url}" >&2
  return 1
)
