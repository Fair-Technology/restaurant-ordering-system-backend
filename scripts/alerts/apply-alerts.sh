#!/usr/bin/env bash
# Apply (or read back) the Azure Monitor alert rules in infra/alerts/.
#
#   scripts/alerts/apply-alerts.sh dev              # create/update dev's rules, then read them back
#   scripts/alerts/apply-alerts.sh dev --dry-run    # print what would be sent, change nothing
#   scripts/alerts/apply-alerts.sh dev --verify     # read back only; no writes
#   scripts/alerts/apply-alerts.sh dev --validate   # read-only: run each rule's query against App Insights
#
# Needs an authenticated az CLI with rights on the subscription. Prints no secret values.
set -euo pipefail

ENV_NAME="${1:-}"
MODE="${2:-apply}"
case "$ENV_NAME" in
  dev)
    RG=rg-restaurant-ordering-system-dev
    AI=restaurant-ordering-system-dev
    AG=ag-restaurant-dev-webhooks
    ;;
  prod)
    RG=rg-restaurant-ordering-system-prod
    AI=restaurant-ordering-system-prod
    AG=ag-restaurant-prod-webhooks
    ;;
  *)
    echo "usage: $0 <dev|prod> [--dry-run|--verify|--validate]" >&2
    exit 2
    ;;
esac

case "$MODE" in
  apply|--dry-run|--verify|--validate) ;;
  *) echo "unknown mode '$MODE' (apply|--dry-run|--verify|--validate)" >&2; exit 2 ;;
esac

command -v az >/dev/null || { echo "az CLI not found on PATH" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq not found on PATH" >&2; exit 1; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RULES_DIR="$REPO_ROOT/infra/alerts"
SUB="${SUBSCRIPTION_ID:-$(az account show --query id -o tsv)}"
AI_ID="/subscriptions/$SUB/resourceGroups/$RG/providers/Microsoft.Insights/components/$AI"
AG_ID="/subscriptions/$SUB/resourceGroups/$RG/providers/microsoft.insights/actionGroups/$AG"
QAPI="https://management.azure.com/subscriptions/$SUB/resourceGroups/$RG/providers/Microsoft.Insights/components/$AI/api/query?api-version=2018-05-01-preview"

echo "env=$ENV_NAME  subscription=$SUB  rg=$RG  app-insights=$AI  action-group=$AG"
echo

# --- preconditions -----------------------------------------------------------------------------------
if [ "$MODE" != "--dry-run" ] && [ "$MODE" != "--validate" ]; then
  if ! az monitor action-group show -g "$RG" -n "$AG" -o none 2>/dev/null; then
    echo "STOP: action group '$AG' not found in '$RG'. Create it first (runbook §12) - the rules are useless" >&2
    echo "      without a receiver, and a rule pointing at a missing group is rejected." >&2
    exit 1
  fi
fi

# --- each rule ---------------------------------------------------------------------------------------
status=0
for file in "$RULES_DIR"/alert-"$ENV_NAME"-*.json; do
  [ -e "$file" ] || { echo "no rule files found in $RULES_DIR for '$ENV_NAME'" >&2; exit 1; }
  rule="$(basename "$file" .json)"
  query="$(jq -r '.properties.criteria.allOf[0].query' "$file")"
  scope="$(jq -r '.properties.scopes[0]' "$file")"
  agid="$(jq -r '.properties.actions.actionGroups[0]' "$file")"
  url="https://management.azure.com/subscriptions/$SUB/resourceGroups/$RG/providers/Microsoft.Insights/scheduledQueryRules/$rule?api-version=2023-03-15-preview"

  echo "=== $rule"
  # Guard against a dev payload being applied to prod (or the reverse): both ids are env-specific.
  [ "$scope" = "$AI_ID" ] || { echo "  MISMATCH scope=$scope expected=$AI_ID" >&2; status=1; continue; }
  [ "$agid" = "$AG_ID" ] || { echo "  MISMATCH actionGroup=$agid expected=$AG_ID" >&2; status=1; continue; }

  if [ "$MODE" = "--validate" ]; then
    body="$(jq -n --arg q "$query" '{query:$q, timespan:"P7D"}')"
    if ! out="$(az rest --method post --url "$QAPI" --body "$body" -o json 2>&1)"; then
      echo "  query REJECTED by App Insights:"; echo "$out" | head -5; status=1; continue
    fi
    echo "  query accepted; rows in the last 7 days: $(echo "$out" | jq -r '.Tables[0].Rows | length')"
    continue
  fi

  if [ "$MODE" = "--dry-run" ]; then
    echo "  PUT $url"
    jq '{displayName:.properties.displayName, severity:.properties.severity, enabled:.properties.enabled,
         evaluationFrequency:.properties.evaluationFrequency, windowSize:.properties.windowSize,
         scope:.properties.scopes[0], actionGroup:.properties.actions.actionGroups[0],
         query:.properties.criteria.allOf[0].query}' "$file"
    continue
  fi

  if [ "$MODE" = "apply" ]; then
    az rest --method put --url "$url" --body @"$file" -o none
    echo "  applied"
  fi

  # read back: whatever Azure now holds, not what we sent
  if get="$(az rest --method get --url "$url" -o json 2>&1)"; then
    echo "$get" | jq -r '
    "  enabled=\(.properties.enabled) severity=\(.properties.severity) freq=\(.properties.evaluationFrequency) window=\(.properties.windowSize) threshold=\(.properties.criteria.allOf[0].threshold)",
    "  scope=\(.properties.scopes[0])",
    "  actionGroup=\(.properties.actions.actionGroups[0])",
    "  query=\(.properties.criteria.allOf[0].query | gsub("\n"; " "))"'
  else
    echo "  NOT PRESENT in Azure: $(echo "$get" | head -2 | tr '\n' ' ')"
    status=1
  fi
done

exit "$status"
