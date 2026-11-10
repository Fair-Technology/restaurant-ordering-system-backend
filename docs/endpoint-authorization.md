# Endpoint authorization: decisions

Every HTTP function is registered `authLevel: 'anonymous'`; the host gates nothing, so each
operation checks inside its handler or application service. Each operation has an authorizer,
or a stated reason below for having none. Tests: `test/application/shopDataAuthorization.test.ts`
(and `platformAccessEndpoints.test.ts` for the platform path).

## Public on purpose (no authorizer)

`GET /shops/public`, `GET /shops/slug/{slug}`, `GET /shops/slug/{slug}/legal`, `GET /legal/platform`,
`GET /legal/dpa`, `GET /shops/{shopId}/catalog` (refuses deleted/offline shops),
`GET /reference-lists/{countryCode}`, `POST /orders/quote`, `POST /orders` (diner checkout),
`POST /staff/login` (credentials), and the two Stripe webhooks (signature-verified before any work).
The three `/customer-orders/{id}/...` routes are authorised by the order's secret access token.

## Closed (previously open)

| Route | Now requires | Why |
|---|---|---|
| `GET /orders/by-payment-intent/{id}` | `view_orders` on the order's shop | A PaymentIntent id is not a secret (it rides Stripe redirect URLs and logs) and the response carries the customer's name. No frontend calls it; the diner's own link is `/customer-orders/{id}/view`. The route is kept, not removed, because removing it changes the published contract. |
| `GET /products?shopId=` | `manage_menu` on that shop | It served any shop's product list, offline shops included, anonymously. Its only callers are rs-admin's menu editor and combos screen, which are already `manage_menu` screens. The public menu is `GET /shops/{id}/catalog`. |
| `GET /products/{id}`, `GET /shops/{id}/categories`, `GET /shops/{id}/categories/{id}` | Membership of the shop (owner, its own active staff) or a platform operator | They only required "signed in" and restricted staff, so any diner or other shop's owner could read any shop's menu. Plain staff keep access (the order screens need names); no extra permission is demanded. |

## Deliberate: kitchen writes gated by `view_orders`

`accept`, `reject`, `ready`, `dispatch`, `complete` and `PUT busy-mode` use `view_orders`
(`loadShopForOrderAction`). There is no `manage_orders` permission, and the plain staff role's default is
exactly `['view_orders']`: running the kitchen is the job of the role that sees the orders. Adding a write
permission would either lock plain staff out or be granted to every role that already has `view_orders`.
Money movement is separate (`refund_orders`). Revisit only if a role should see orders but not act on them.
