# Azure Monitor alert rules — order intake, paid-without-order, webhook non-2xx and Stripe credential failure

The ARM payloads in this directory are the alert rules the specs (`docs/specs.md` §20, "Monitoring alerts")
tell the owner to create. One file per rule per environment; the file *is* the request body.

| File | Rule | Environment |
|---|---|---|
| `alert-dev-order-intake-5xx.json` | 5xx (or a failed invocation) from the `checkout` function, POST /api/orders | dev |
| `alert-dev-paid-without-order.json` | a payment the checkout reconciler could not turn into an order | dev |
| `alert-prod-order-intake-5xx.json` | as above | prod |
| `alert-prod-paid-without-order.json` | as above | prod |
| `alert-prod-webhook-non2xx.json` | any non-2xx (incl. resultCode 0) on /api/webhooks/* | prod |
| `alert-prod-stripe-credential-failure.json` | Stripe [stripe:failure] with kind=permission_or_config (key permission/config fault, not a decline); also filters cloud_RoleName == 'restaurant-ordering-system' | prod |

The two prod webhook/Stripe rules are defined but not yet in Azure, because
`rg-restaurant-ordering-system-prod` does not exist (dev already has both).

Apply and read back:

```sh
scripts/alerts/apply-alerts.sh dev            # PUT each dev payload, then GET it back
scripts/alerts/apply-alerts.sh dev --dry-run  # print URL + payload, write nothing
scripts/alerts/apply-alerts.sh dev --verify   # read back only (exit 1 if a rule is missing)
scripts/alerts/apply-alerts.sh dev --validate # read-only: run each query against App Insights
scripts/alerts/apply-alerts.sh prod            # PUT each prod payload, then GET it back
scripts/alerts/apply-alerts.sh prod --dry-run  # print URL + payload, write nothing
scripts/alerts/apply-alerts.sh prod --verify   # read back only (exit 1 if a rule is missing)
scripts/alerts/apply-alerts.sh prod --validate # read-only: run each query against App Insights
```

`apply-alerts.sh prod` cannot run until the action group `ag-restaurant-prod-webhooks` exists.

The script aborts if a payload's scope or action group belongs to the other environment, and if the
environment's action group does not exist. `SUBSCRIPTION_ID` overrides the subscription read from
`az account show`.

`az monitor scheduled-query` is not used: that extension does not install on this machine
(`pip failed`, no `pip` module in system Python 3.14), so the rules go through ARM with `az rest`,
which is the same API the extension calls.

Dev's webhook rule (`alert-dev-webhook-non2xx`) is not duplicated here — it already covers both
webhook routes. Rationale, exclusions and the limits of these rules are in `docs/specs.md` §20 ("Monitoring alerts").
