# Deferred and rejected — decided, then set aside

Everything ruled **out of scope** during the design interview of 2026-08-26/27,
with the reason it was ruled out and whether it is *later* or *never*.

The point of this file is that a parked idea should never have to be thought
through twice. If one of these comes back, read the reason first — it usually
still applies, and where it doesn't, the reason tells you exactly what changed.

**Later** = deliberately not in the first releases; the design already
accommodates it. **Never** = actively rejected; bringing it back means undoing
a decision something else depends on.

---

## Never — rejected on principle

### Platform-wide customer accounts (cross-restaurant order history)
**Why:** it would make Manish a data *controller* of diners' personal data, with
his own privacy policy, his own erasure obligations and his own liability. He is
based in Australia, has no EU establishment, and wants to be a **processor only**.
Restaurants are controllers of their own customers; he processes on their
instructions.
**Undoing it means:** taking on controller status, an EU-facing privacy policy,
and direct regulatory exposure. Not a feature decision — a legal one.

### Customer accounts of any kind
**Why:** followed from the above. Guest checkout only. Removes passwords,
resets, lockouts, account pages and a whole category of stored personal data.
**Consequences already designed around it:** order status and receipts reach the
customer through an unguessable token link in their confirmation email;
"remember my details" is browser-local only; reordering happens from a link in a
past email; loyalty is emailed single-use vouchers rather than a points balance.

### Platform-wide loyalty points (earn at one restaurant, spend at another)
**Why:** settling value between two businesses would make the platform a
clearing house moving money between them — breaking the rule that no customer
money ever touches Manish. Loyalty is per restaurant, always.

### Cross-restaurant shopping carts
**Why:** one payment split across several Stripe accounts drags the platform
back into being a money transmitter. One restaurant per cart.

### Custom sending domain for transactional email
**Why:** explicitly decided — mail always sends from the platform's own domain,
with the restaurant's name as display name and their address as reply-to. One
sending reputation to protect instead of hundreds, and restaurants who cannot
configure DNS would never discover their confirmations were silently failing.

### Editing an order after it is placed
**Why:** recalculating totals, adjusting the payment up or down and re-issuing
the receipt — a rebuild of the entire payment path to serve a customer who
picked the wrong dish. Cancellation (until the restaurant accepts) covers the
real need. Changes are a phone call.

### Dine-in "pay at the till afterwards" / running tabs
**Why:** a tab across several orders, one bill, split payments — and probably
German cash-register law (the certified security element and its record-keeping
duties) the moment the platform becomes the thing recording a dine-in sale.
Table ordering is **pay now, table number attached**, which sidesteps all of it.

### Tips / digital tipping
**Why:** a tip taken at checkout lands in the restaurant's account, so it is
business income rather than the tax-free cash gratuity an employee receives
directly — and getting it to staff means payroll, where its status is at best
debatable. A tax question shipped switched on for everybody becomes the
platform's support burden. Dropped outright.

### Search engine indexing and SEO features
**Why:** storefronts carry `noindex`. No structured data, no per-restaurant
switch. The storefront is a destination for people following the restaurant's
own link, and an indexed storefront would compete with the restaurant's own
website for its own name.
**Kept anyway (not SEO):** a page title and link preview card, so a URL pasted
into WhatsApp does not render as a blank grey box.

### Custom domains for storefronts
**Why:** per-tenant DNS verification, certificate automation and routing, for a
cosmetic gain — the embed widget (see *later*) solves the same "it should look
like my site" problem far better.

### Hardware and adjacent product categories
POS/till, self-order kiosks, digital menu boards, drive-thru, branded
per-restaurant customer apps, driver apps with live tracking and route planning.
**Why:** each is a hardware business wearing a software coat, and each would
double the support burden for one segment of customers.

---

### More than one owner per restaurant — decided 2026-10-13: one owner only

A shop has exactly one owner, the person who created it. No co-owner invite and
no superadmin "add owner". Everyone else gets a staff login with a role.
**Why:** Manish, 2026-10-13, when the TODO triage asked how a second owner
should be added. Staff roles already cover helpers; ownership stays one clear
person for billing, Stripe and legal.

## Later — designed for, not yet built

### Embedded ordering widget
A snippet restaurants paste into their existing website so ordering happens
inside their own page. **Out of scope for now (Manish, 2026-10-09)** — was
release two. Kept as a topic for a future discussion, not dropped for good.
**Why omitted:** it mostly wins restaurants that already have a website; the
first release targets small restaurants for whom a plain "Order online" link to
their storefront page does the job. It would also bring Safari's blocking of
storage inside embedded frames, per-restaurant Apple/Google Pay domain setup,
and an ongoing "it looks off on my site" support load.
**What it costs:** the main sales argument for restaurants with their own site;
diners leave the restaurant's site to order; competitors offer it; requests to
"make the storefront look like my site" (declined above because the widget would
solve them) have nowhere to go. **Coming back is cheap:** it would sit on top of
the existing storefront, so nothing built now is wasted.

### Native mobile apps
React Native, against the same API, once the web version has real users. Chosen
partly to stay inside JavaScript. Until then the owner's order screen is a web
page — installable to the home screen for push notifications where the operating
system allows it.

### Live order status page for customers
Customers see nothing after ordering in v1. The full order state machine is
recorded from day one precisely so this is cheap to add: Placed → Accepted →
In preparation → Ready / Out for delivery → Completed, plus Rejected and
Cancelled with reasons and timestamps.

### Menu import
Menus are typed in by hand. The menu data model is built so an importer — from a
photo, a competitor's export — can be added without reshaping it.

### Review collection and marketing emails
In the product's intended shape, built later.

### Buyable add-on modules alongside the tiers
v1 is tiers only (Basic free / Pro / Max). The **entitlement model** — each plan
is data: a list of capability keys plus numeric limits — supports à-la-carte
modules identically, so this is a pricing-page decision, reversible at any time.
Candidate modules named: invoicing, reservations, advanced promotions.
**Capability keys are not stored yet** (decided in slice 7a, 2026-10-07): plans
carry numeric limits only. The capability-key list is added together with the
first module, because a list nothing reads would be dead configuration.

### Reservations and reservation deposits
Out of v1 entirely. Was designed in detail before being cut: deposit charged to
the restaurant's own Stripe account, auto-refunded when staff mark the party
arrived, kept on a no-show after a grace period. That design survives here if it
comes back.

### Superadmin roles
Only Manish is superadmin at first, with full powers including impersonation and
content editing — every use written to the audit log and visible to the
restaurant. The permission model is built in from the start with everyone
defaulting to full access, so restricting an invited helper later is
configuration rather than a rewrite.

### Owner-editable role permissions
Manish defines what Owner / Manager / Staff can do, globally, from superadmin.
Per-restaurant permission editing waits until real owners say which specific
permission they wanted to move.

### Per-item preparation times driving the ready-time estimate
Per-item prep times are **captured** from day one but do not drive the estimate.
The estimate is a per-restaurant default per fulfilment mode (20/45/20 unless
the owner changes it), a one-tap busy mode, and a staff adjustment at accept. A computed estimate is only as good as numbers no
restaurant fills in accurately at signup — so it earns its place once there is
real data to check it against.

### Multi-location billing discount
Each restaurant carries its own subscription, paid separately, limits never
pooled. A discount for owners running several is a later pricing move.

### Storage-based tier limits
Storage is not gated. The menu-size limit already caps the real cost, and
policing a megabyte number nobody understands is not worth the support.

### Advertising pixels on storefronts and the cookie banner that follows
No non-essential cookies in v1, therefore no consent banner — analytics come
from the platform's own order data. Restaurants wanting their own Google or Meta
pixel is a real future request; when it arrives it becomes an opt-in feature
that switches the banner on for **that storefront only**.

### Public directory of restaurants — decided 2026-09-30: plain list only

**Decision (2026-09-30):** the storefront root keeps listing every restaurant as a plain, undesigned page; it isn't advertised. Anything beyond a plain list (search, ranking, diner-facing discovery) is still undecided and the privacy condition below still applies.

Originally rejected (2026-08-27): the root domain is a **sales site aimed at
restaurant owners**, not a marketplace, and no directory means no
cross-restaurant discovery, no moderation queue, and a junk storefront invisible
to everyone except whoever was handed its link. On 2026-09-25 Manish moved it
from *never* to **maybe later — genuinely unsure it will come.**
**Privacy condition, if it does:** a directory that only *lists* restaurants and
links to their storefronts holds business data, not diner data, and leaves the
processor-only structure (spec §15) intact. It turns into a controller problem
the moment the platform uses diner data for its own purposes — cross-restaurant
accounts, "your orders everywhere", marketing to diners — see *Platform-wide
customer accounts* above. The moderation argument above still applies.

### Secret per-table codes + table list / scan-for-menu picker

**Deferred by Manish 2026-10-03/05.** Slice 5 (built 2026-10-07) uses plain
free-text table numbers in the link (`?t=7`, `?t=Terrasse 3`), no saved table
list and no "scan for menu" code where the diner picks a table. **Revisit if
prank orders appear** — every order is prepaid, so a prank costs the prankster.
The swap is cheap: random codes can share the same `?t=` link, and orders keep
their own copy of the table. Why: [[order-intake-design]].

### Feature ideas from the 2026-10-11 review — to consider later

Proposed by Claude after a look across the three apps; **Manish chose to keep
these for later (2026-10-11)** and build only combo photos and combo
translations now. Each was checked against the code: none exists yet. Busy
mode, holiday closures and discount codes were left off because they already
exist.

1. **"Add a drink?" before checkout.** Listed in the core design (§6 "Also in
   the core design") but never built. Cheapest lever on the average order.
2. **Menu search on the storefront.** Ma Pasta has 50 items and only category
   scrolling; a search box lets a diner type "carbonara".
3. **Diet and allergen filters for diners.** Dishes already carry dietary tags
   and allergens; diners can't filter by them ("vegan only", "no nuts").
4. **"Order again" that refills the basket.** The button on a finished order
   only returns to the menu. It could rebuild the same basket from the order's
   secret link — no customer account needed, so it doesn't clash with the
   rejected accounts above.
5. **"Sold out until tomorrow" from the order board.** One tap hides a dish and
   it returns by itself next morning; today someone must remember to switch it
   back on.
6. **"Popular" badges.** The sales report already knows the top sellers;
   badging the top few helps first-time diners choose.
7. **Suggested translations.** On a two-language menu, a "suggest translation"
   button so the owner checks a draft instead of typing everything twice.
8. *(Already a TODO item, listed for completeness)* superadmin's shop list only
   shows the newest 20 shops.

### Parked from the TODO triage — 2026-10-13

The TODO triage marked these real-but-someday (P3). Each was re-checked against `dev` that day; the original TODO text is kept so the *why* survives.

#### Feature: 'sold out until tomorrow' for dishes plus a stock-only staff permission
*Parked because:* Feature, not a bug; the "sold out until" half was already parked by Manish (feature idea 5, 2026-10-11).
*Was (TODO, B10):* No "sold out until" and no stock-only staff right (audit 2026-10-12, triple-checked: code trace + repro test + refute pass)

Dish availability is only `isAvailable`; changing it needs `manage_menu` (all-or-nothing); declining with `item_unavailable` doesn't touch the dish. **Fix:** `unavailableUntil` (end of service day / date / manual) + a `manage_stock` permission; optionally offer "mark sold out" when declining with that reason. Uber, Wolt, Square, Deliveroo have this. **Pair:** admin item "Sold-out today" — backend first.

*Triage 2026-10-13: DECISION — Both checkers confirm it is missing: no unavailableUntil or manage_stock in src, and executeUpdateProduct.ts:83 requires manage_menu. They split only on the label. The sold-out-until half is already deferred.md #5 ('Manish chose to keep these for later', 2026-10-11), so re-queuing it needs his call. The manage_stock half is new work.*

#### Build a shop-wide library of option groups so one 'out of Coke' switch covers every dish
*Parked because:* Feature (shared option-group library), not needed for go-live.
*Was (TODO, B11):* Option groups are copied per dish; no shared library (audit 2026-10-12, triple-checked: code trace + repro test + refute pass)

Variant/add-on groups live inside each product (`Product.ts:25-47`). "Out of Coke" means editing every dish. **Fix:** shop-level option-group library referenced by dishes, one availability switch per option. Bigger change — plan it first. **Pair:** admin item "Option-group library".

*Triage 2026-10-13: TASK — Option groups are still stored inside each dish (src/domain/product/Product.ts:25-47, 69-73), and src has no shared option store. Trace called it REAL and repro called it TASK. It is a missing feature, not a defect, so TASK. Plan it first; it pairs with the admin 'Option-group library' item.*

#### Add a test that forces an invoice template version bump when the rendered invoice text changes
*Parked because:* Safety-net test only; nothing renders wrong today.
*Was (TODO, B23):* Low: invoice renderer has no version switch (audit 2026-10-12, triple-checked: code trace + repro test + refute pass)

Mostly refuted: past invoices are a frozen snapshot and only the layout is re-rendered (GoBD 2025 allows same-content regeneration). Remaining: a future label change in `invoiceTextLines`/`invoicePdf.ts` would alter old PDFs. Add a snapshot test that forces a `templateVersion` bump when the rendered text changes.

*Triage 2026-10-13: REAL — INVOICE_TEMPLATE_VERSION is a hand-set literal (src/domain/invoice/invoice.ts:17). test/domain/invoice.test.ts:112 only checks that literal and there are no snapshot tests. Low risk because stored invoices keep frozen content; only a future label change could alter re-rendered old PDFs.*

#### Category times allow one window only, no overnight window, and 23:59 is never live; accepted for now, revisit when a shop needs it
*Parked because:* Accepted on purpose (spec §category times); widen when a shop needs it.
*Was (TODO, B24):* Low: category times — one window, no overnight, 23:59 never live (audit 2026-10-12, triple-checked: code trace + repro test + refute pass)

Accepted on purpose in `category-switch-and-times.md`. Revisit when a shop needs a late-night-only section or split lunch; reuse the opening-hours format.

*Triage 2026-10-13: DECISION — Category.ts:30-33,60: parse rejects 18:00-02:00 and arrays of windows, and isCategoryLive at 23:59:30 with end 23:59 is false (repro). Accepted on purpose (spec.md:488-493); widening it is a product call.*

#### Activity log shows the shop's ID instead of its name for limit-override changes and subscription cancellations
*Parked because:* Activity log shows shop id instead of name for limit overrides; cosmetic.
*Was (TODO, B35):* New activity-log rows for limit overrides show the shop ID, not its name

Found in slice 7a browser checks 2026-10-07. Superadmin → Ma Pasta → Activity:
"Platform changed a plan limit…" / "removed the restaurant's limit override" rows
show the shop's UUID where older rows show "Ma Pasta". Likely the audit entry for
the new limit-override actions doesn't record the shop name. Cosmetic.

*Triage 2026-10-13: REAL — executeSetLimitOverride.ts:73 and executeClearLimitOverride.ts:39 hard-code entityName `Shop ${shopId}` and never load the shop. The repro found the same defect in executeCancelShopSubscription.ts:72.*

#### Add a remove-logo endpoint (DELETE shops/{id}/logo, like remove-cover); must land before the admin Remove button
*Parked because:* Remove-logo endpoint: small feature, not needed for go-live.
*Was (TODO, B39):* Remove-logo endpoint (goes first; admin item depends on it)

There's no way to remove a logo once set. Mirror `removeShopCoverImage`
(`DELETE /shops/{id}/logo`, no-op when none, activity entry). The admin's
Remove button is a separate item under `### restaurant-ordering-system-admin`;
this one lands first.

*Triage 2026-10-13: TASK — src/functions/shop has only setShopLogo and generateShopLogoUploadUrl, with no DELETE logo. removeShopCoverImage exists for the cover. Trace and repro differ only on the label (missing feature vs bug), so TASK.*

#### PayPal for diners: Stripe won't offer it in our setup, so decide whether to park it in deferred.md
*Parked because:* Stripe won't offer PayPal in our setup; spec §8 already says "No PayPal for now".
*Was (TODO, B44):* PayPal for diners — blocked by Stripe, revisit later

**Why.** Manish wants PayPal as well "if it's easy" (2026-10-03). It isn't:
Stripe doesn't offer PayPal to platforms whose businesses take payments
directly (our setup — Connect direct charges, the restaurant is the merchant);
it needs Stripe's manual approval, which these platforms don't get. Options
later: ask Stripe anyway, or a separate PayPal integration (more work, a second
payment provider). Source: docs.stripe.com/payments/paypal.

*Triage 2026-10-13: DECISION — There is no code to check. Spec §8 (spec.md:638-640) already records 'No PayPal for now' and deferred.md has no PayPal entry. This is a product idea, not a fix, so it probably moves to deferred.md if Manish agrees.*

#### Let owners download a whole month's invoices and correction invoices at once, and include them in the owner data export
*Parked because:* Monthly receipt batch download: nice-to-have, needs a ZIP-or-CSV call first.
*Was (TODO, B46):* Monthly receipt batch download (after 4b)

**Why.** Spec §10 says owners can download a month's receipts in one go;
4b only delivers single receipts. A receipt is a tax record the restaurant must
keep, so a batch export saves an owner downloading them one by one at month
end. Needs a ZIP-or-CSV decision first. Single receipts already cover the legal
need, which is why it was deferred. **Do this first** (the export endpoint),
then the admin item of the same name under `### restaurant-ordering-system-admin`.

**Widened by slice 4b (2026-10-06):** the batch should include correction
invoices (Stornorechnung / Rechnungskorrektur), not just invoices, and the
owner's data export should include invoices and corrections too — 4b left both
out (plan v4, "Deferred") because single downloads already meet the legal need.

*Triage 2026-10-13: TASK — Only single-document download exists (src/functions/order/getOrderDocument/index.ts:8; application/order/invoices has issueInvoice and executeGetOrderDocument only). exportShopData (executeExportShopData.ts:34,77) leaves out invoices and corrections. Needs a ZIP-or-CSV decision first.*

#### A dish's special-offer label (e.g. 'Angebot des Tages') is shown untranslated to English-speaking diners
*Parked because:* Minor: offer label shown untranslated to English diners.
*Was (TODO, B51):* Offer labels are single-language

**Why.** Slice 2 translated category, dish, option-group and option names, but offer/promotion labels still hold one string, so an English visitor sees them in the original language.

*Triage 2026-10-13: REAL — Product.ts:14 `offerLabel?: string | null` has no translations field; buildCatalog.ts:123 passes it through as-is while names go through translation. No other offerLabel handling in src. Wording 'promotion labels' is overstated: promotions have no display label, only the dish schedule's offerLabel.*

#### Upgrade the backend's Stripe library from 20 to the current major (now 23), then the storefront's Stripe packages; testable now in dev's own Stripe sandbox
*Parked because:* Dependency upgrade (stripe 20 → 23); no bug.
*Was (TODO, B52):* Take stripe 22 once the product has its own Stripe account

Held at stripe 20 in the slice-1 dependency upgrade because v21/v22 change the
API version (to `2026-03-25.dahlia`) and nothing can exercise real payments
until the Stripe account split below is done. A break would only show at
runtime. Pair it with the storefront's `@stripe/*` bump (see
`### restaurant-ordering-system-storefront`) — do the backend first.

*Triage 2026-10-13: TASK — package.json:28 still `"stripe": "^20.4.1"`; storefront still @stripe/stripe-js ^8.11.0. Stated blocker gone: spec.md ~1517 and ~1551 say dev has its own test sandbox since 2026-10-06.*

#### Stock-only staff role for marking dishes sold out ('sold out today' half is already parked in deferred.md #5)
*Parked because:* Admin half of the sold-out / stock-only role feature parked above.
*Was (TODO, A08):* Sold-out today + stock-only role (after the backend item) (audit 2026-10-12, triple-checked: code trace + repro test + refute pass)

Pair of backend "No 'sold out until'". Quick "sold out today" on the dish list and orders board.

*Triage 2026-10-13: TASK — No soldOutUntil or unavailableUntil anywhere. Products have only isAvailable, and roles are owner|manager|staff. deferred.md:217 item 5 ('Sold out until tomorrow' from the order board) is already parked by Manish, so only the stock-only role is new. Move it to deferred.md too.*

#### Admin: shared option-group library so owners set up a group once and reuse it across dishes (after the backend item)
*Parked because:* Admin half of the option-group library.
*Was (TODO, A09):* Option-group library (after the backend item) (audit 2026-10-12, triple-checked: code trace + repro test + refute pass)

Pair of backend "Option groups are copied per dish".

*Triage 2026-10-13: TASK — The feature is not built, so this is not a bug. Option groups are still stored inside each dish (backend src/domain/product/Product.ts:70,73) and there is no shared group type in the backend or admin. This is the admin half of backend B11 'Option groups are copied per dish', and the backend work has to come first. Trace said REAL and repro said TASK; TASK fits because it is new work.*

#### Add a Remove button to the logo card, after the backend remove-logo endpoint exists
*Parked because:* Admin Remove-logo button, after the backend endpoint.
*Was (TODO, A18):* Remove-logo button (after the backend endpoint)

Depends on the backend item "Remove-logo endpoint" — that goes first. Then add
a Remove button to the logo card the way the cover card has one.

*Triage 2026-10-13: TASK — Backend has only POST shops/{shopId}/logo and logo/upload-url (functions/shop/setShopLogo/index.ts:6-8), with no remove route. The admin logo card has no Remove button, but the cover card does (ShopSettingsPage.tsx:433,758). Still blocked on the backend item.*

#### Add a 'download this month's receipts' button, after the backend batch export exists
*Parked because:* Admin half of the monthly receipt download.
*Was (TODO, A21):* Monthly receipt batch download (after 4b)

**Why.** Owners need a month's receipts as one download (spec §10). Add the
button once the backend item of the same name under
`### restaurant-ordering-system-backend` (which goes first) provides the
export.

*Triage 2026-10-13: TASK — Backend has no monthly receipt batch export route (only per-order documents/{documentId} and data-export). The admin has no receipt UI. Still blocked on the backend item of the same name (spec §10).*

#### Activity page shows which staff login was acted on as a raw id instead of a name
*Parked because:* Activity page shows staff target as raw id; cosmetic.
*Was (TODO, A22):* Activity page shows the *target* of staff actions as a raw id

Actor names resolve ("manager"), but the thing acted on — e.g. which staff
login was created or deleted — shows as a UUID. Resolve target labels at read
time the same way actors are, from the staff table (deleted accounts →
"Deleted staff account"), in the backend's audit reader.

*Triage 2026-10-13: REAL — Staff use cases write entityName: created.id (executeCreateStaff.ts:92, executeDeleteStaff.ts:59, executeUpdateStaff.ts:88, executeResetStaffPassword.ts:60). executeGetAuditEntries.ts:55 resolves only actorLabels, and admin ActivityPage.tsx:37 renders entityName as-is. The fix belongs in the backend audit reader, so file the item under the backend.*

#### Upgrade the admin to i18next 26 / react-i18next 17 / i18next-http-backend 4, with a browser pass in both languages
*Parked because:* Dependency upgrade (i18next majors).
*Was (TODO, A23):* Take the i18next 26 / react-i18next 17 / i18next-http-backend 4 majors

Held in the slice-1 dependency upgrade (2026-09-25): translation breakage only
shows at runtime and nothing tests rendered text beyond the en/de key-parity
test. Upgrade with a browser pass over every page in both languages.

*Triage 2026-10-13: TASK — Admin package.json:26,28,36 are still i18next ^25.10.10, i18next-http-backend ^3.0.6, react-i18next ^16.6.6. The latest versions are 26.4.4 / 4.0.2 / 17.0.16.*

#### Unpin eslint-plugin-react-hooks from 7.0.1 (the blocker is gone and the lint error count stays the same)
*Parked because:* Lint plugin unpin; safe but zero user value.
*Was (TODO, A24):* `eslint-plugin-react-hooks` pinned at 7.0.1

Slice 1 pinned it because 7.1.1 flagged two `set-state-in-effect` patterns
(`CreateProductPage.tsx:66`, `ProductsPage.tsx:744`). **Update 2026-09-25:**
slice 2 removed both — `CreateProductPage.tsx` is deleted and the
`ProductsPage.tsx` mode effect is gone. Try unpinning now; other pages still
carry some of the baseline lint errors, so check the count before and after.

*Triage 2026-10-13: TASK — Admin package.json:50 is still pinned at 7.0.1. CreateProductPage.tsx was deleted in 0169937. Repro ran lint with 7.1.1 and got the same 6 errors as 7.0.1, so unpinning is a safe small task.*

#### Upgrade @stripe/stripe-js to 9 and @stripe/react-stripe-js to 6, after the backend Stripe library upgrade
*Parked because:* Storefront Stripe packages upgrade; follows the backend one.
*Was (TODO, S17):* Take `@stripe/stripe-js` 9 and `@stripe/react-stripe-js` 6 with the backend Stripe bump

Held in slice 1 for the same reason as the backend's stripe 22 — see that item
under `### restaurant-ordering-system-backend`. Backend first, then this.

*Triage 2026-10-13: TASK — Storefront package.json:21-22 is still on ^5.6.1 and ^8.11.0. The backend is still on stripe ^20.4.1 (backend package.json:28), so the upgrade this waits on hasn't happened.*

#### Upgrade Tailwind to 4 and eslint-plugin-react-hooks to 7 during the spec §19 design pass
*Parked because:* Tailwind 4 / lint plugin; tied to the design pass.
*Was (TODO, S18):* Take tailwindcss 4 and eslint-plugin-react-hooks 7 at the design pass

Tailwind 3→4 is a migration, not a bump — do it with the spec §19 design pass.
react-hooks 7's compiler rules would fail today's clean lint gate.

*Triage 2026-10-13: TASK — package.json:44 is still tailwindcss ^3.4.19 and :40 is still eslint-plugin-react-hooks ^5.2.0. This is tied to the design pass, which hasn't started.*

### Business buyers and e-invoices — parked 2026-10-13

Manish, 2026-10-13: not now. Every buyer stays a private customer. Revisit
before the German B2B e-invoice duty (2027/2028) or when a shop asks for
catering/office orders. Invoices of €250 or less are exempt, which covers
almost every takeaway order. Both TODO items, kept as they were:

#### Add e-invoices (ZUGFeRD) for business buyers on orders over €250, required from 2027/2028
*Was:* No e-invoice for business buyers (deadline 1 Jan 2028 for most shops) (audit 2026-10-12, triple-checked: code trace + repro test + refute pass)
No business-buyer flag, no ZUGFeRD/XRechnung anywhere. Issuing e-invoices to businesses becomes compulsory from 2027 for sellers over €800k prior-year turnover, from 2028 for all; invoices ≤ €250 exempt (§27(38) UStG, §33 UStDV). **Fix:** "buying for a business" at checkout + ZUGFeRD PDF. **Pair:** storefront checkbox — backend first.
*Triage 2026-10-13: TASK — src, scripts and test have nothing for ZUGFeRD, XRechnung or a business-buyer flag, and spec.md:800 covers consumers only. Trace called it REAL and repro called it TASK. It is a feature not yet built, so TASK. The title overstated it: only business invoices over €250 are affected, so most takeaway orders are exempt.*
**Note:** Waits on decision: support business buyers at all? Storefront half: "Buying for a business" checkbox.


#### Decide whether to support business buyers (company name, VAT ID, e-invoice) at checkout; the storefront checkbox waits on that and on the backend item (DECISION)
*Was:* "Buying for a business" checkbox (after the backend item) (audit 2026-10-12, triple-checked: code trace + repro test + refute pass)
Pair of backend "No e-invoice for business buyers".
*Triage 2026-10-13: DECISION — No business or VAT-ID field in the checkout, and no ZUGFeRD/XRechnung in the backend. The spec (spec.md:799-800) only covers consumers. The legal duty starts 2027/2028 and exempts invoices of €250 or less, which covers most takeaway orders, so whether to build it is Manish's product/legal call. Trace said DECISION, repro said TASK; I sided with DECISION.*
**Note:** Waits on the same decision as backend "Add e-invoices (ZUGFeRD)…".
