# Restaurant-ordering-system — what the product is and the rules it runs on

This is the **current-truth spec** for the restaurant ordering platform: what
has been decided, organised by subject so a rule can be looked up without
reading the file end to end. It is the source a ticket is cut from.

**What belongs here:** durable product law and the configuration numbers that
are product decisions. **What does not:** how any of it is implemented. That
lives in the code.

**Companion documents in this folder:**

- `audit-2026-08-27.md` — what the existing code already does, where it
  contradicts this spec, and what is missing. Read it before touching a
  subsystem; it says whether you are building, reshaping or replacing.
- `deferred.md` — everything ruled out of scope, with the reason. If a feature
  seems missing here, check there before assuming it was forgotten.

**Decided in the design interview of 2026-08-26/27 (session
`b7830bf6-afd2-4617-b9f2-bcb61c312187`).** Edit this file in place to say the
new truth; when a change is non-obvious, also write a note in
`wiki/work/decisions/` saying why.

---

## 1. What the product is

An **online ordering system that a restaurant clips onto its own website.** A
restaurant owner signs up, builds a menu, and gets a URL — `<domain>/shops/<slug>` —
which they link from their existing site. Their customers follow the link,
order, and pay the restaurant directly. Manish runs the platform and charges
each restaurant a monthly subscription. He takes no commission and never
handles the customer's money.

It is **not a marketplace.** The root page simply lists every restaurant, with
no special design, because it isn't advertised (Manish, 2026-09-30). There is no
search, ranking or cross-restaurant discovery beyond that plain list. Diners
reach a storefront through the restaurant's own link (e.g. Ma Pasta's website
links to its storefront), so each storefront's design is what matters.

Three groups of people use it, each through their own web app:

| Who | Their app | What they do |
|---|---|---|
| **Customer** | storefront (`restaurant-ordering-system-storefront`) | Follows a restaurant's link, orders, pays. No account, ever. |
| **Restaurant owner and staff** | admin (`restaurant-ordering-system-admin`) | Menu, orders, tables, staff, subscription, settings. |
| **Platform operator** | superadmin (`restaurant-ordering-system-superadmin`) | Plans, limits, roles, allergen and tax lists, all restaurants, audit. |

All three talk to one backend (`restaurant-ordering-system-backend`). A fifth repo
for end-to-end browser tests is still to be split out of the storefront repo.

**Germany first, global by design.** The pilot is Ma Pasta (`www.mapasta.de`),
a friend's Italian restaurant in Germany that is already trading — its Shop
button will point at `<domain>/mapasta`. Australia and other markets later.
Currency, time zone, tax and address handling are built to support that from
the start (§14).

### Built on the existing code, not from scratch

The four repos at `~/FairTech/restaurant-ordering-system` (≈330 commits, last
touched March 2026) are the starting point. They are on exactly the chosen
stack — React + Vite + Tailwind front-ends, Azure Functions backend, Cosmos DB,
Blob storage, TypeScript strict, Entra External ID via MSAL, Stripe — and
roughly two thirds of the platform spine already matches this spec. See the
audit for what conflicts.

**Copyshop-system is untouched.** Its lessons are carried over; its code is
not, and it is never refactored to share anything with this product.

### Restaurants only, on a reusable spine

The product is marketed and built for restaurants. The platform underneath —
sign-up, tenants, subscriptions, limits, staff, audit, superadmin, deployment —
is generic, so a second vertical (a florist, a bakery) later costs only its own
vertical-specific part. But no feature in this spec is made generic to serve a
vertical that does not exist yet.

### Five separate repositories, not a monorepo

Mirroring copyshop: a plain container folder, five independent git repos, no
shared tooling. **A change is never atomic across two of them.** A feature that
needs a backend field and a screen that reads it is two commits with a window
where one has shipped and the other has not. Plan for it.

---

## 2. Money and tax

### Money is whole cents, never a decimal

Every amount — stored, computed, sent — is an integer count of minor units.
€12.34 is `1234`. Percentages (VAT, discounts) resolve with one rule in one
place: **round half up.** Front-ends format for display and never do
arithmetic on money.

### Prices are VAT-inclusive; tax is extracted, never added

The number the owner types is the number the customer pays. €10 is €10. The
tax is a portion *of* that number:

```
vatAmount = round_half_up(gross × rate / (100 + rate))
```

Getting this backwards overcharged copyshop customers by 19%; hence the rule is
absolute and has no exceptions — dishes, delivery fees, surcharges.

### The rate comes from the dish's tax class, and the model keeps room for more

**Germany no longer taxes food differently by how it is served.** From
1 January 2026 all food is 7% — eaten in, collected or delivered alike — and
beverages stay at 19%. The previous split (19% eat-in, 7% takeaway) is gone.
Legal basis: `Steueränderungsgesetz 2025`, passed 4 December 2025 and approved
by the Bundesrat on 19 December 2025, with implementation detail in the BMF
letter of 22 December 2025.

So in Germany the fulfilment mode is irrelevant to tax. The model keeps the
dimension anyway, because the platform is meant to work in other countries and
several of them — including Germany until nine months ago — do split by mode.
Retrofitting that dimension later would mean recomputing the tax of every order
already taken, which is the one thing that cannot be undone.

- **Tax classes are a platform-owned list per country** (§13), like allergens.
  Adding one is a superadmin data change, not a deploy.
- **Each country has a rate table: tax class × fulfilment mode → rate**, and a
  restaurant inherits its country's table. Germany's rows hold the same value
  across all three modes.
- **Every rate row carries an effective-from date.** A rate change is a new row,
  never an edit — otherwise changing a rate silently rewrites the tax on orders
  already invoiced. This also handles the grace periods these transitions come
  with: the BMF let restaurants leave their tills at 19% for the whole of New
  Year's Eve 2025 rather than switch at midnight.
- **The settings screen collapses while a country's columns are identical** —
  one rate per class, no grid. The mode dimension only surfaces where a country
  actually uses it. No German restaurant should ever see a matrix of repeated
  numbers.
- **Every dish owns its tax class** *(changed 2026-10-12, Manish)*. A category's
  class (Pizza → Food, Drinks → Beverage) is only the **suggestion for new
  dishes**: the dish's tax box fills in from its first category and the dish
  keeps its own copy. Changing a category, or listing a dish in a second
  category, never re-taxes it. The box is shown in every wizard mode. An amber
  note appears when a chosen category suggests a different class ("Kids suggests
  Food — 7 %. This dish uses Beverages — 19 %."). The category edit page has
  "Apply to all dishes in this category" for a section that was set wrong.
  Existing dishes got their own copy by a one-off script (61 dishes on dev,
  2026-10-12; `scripts/convert-dish-tax-classes.ts`, dry run unless `--apply`;
  run it once against any other environment's database after deploying). Why:
  [[dish-owned-tax-class]].
- **Tax classes are named for what is sold, never for their rate** — "Speisen",
  "Getränke" — so a rate change is one dated superadmin row, not every
  restaurant re-tagging every dish (Manish, 2026-10-02). Where the owner picks a
  class (category or dish), the dropdown shows the current rate beside
  the name, e.g. "Speisen (7 %)". Why: [[german-gastronomy-vat-2026]].
- Collection and delivery are both "taken away"; dine-in is "eaten in". Kept as
  distinct modes even though Germany treats them alike.
- Delivery fees and any surcharge carry their own rate, set by the restaurant.
- **To build (decided 2026-10-13):** a separate **"Delivery" tax class at 19 %**
  becomes the default for delivery fees, replacing the Speisen 7 % default below.
  Its own class, not Getränke, so each rate can change alone. See
  [[delivery-fee-tax-class]].

> **Built: 8b (2026-10-09, pushed and deployed to dev).** The delivery fee's tax
> class is picked in Settings → Delivery (default: the country's default class,
> "Speisen (7 %)" in Germany); the fee is its own invoice line with its own rate.

**Germany's seeded classes: two.** *Food* at 7% and *Beverage* at 19%, and that
is the whole table — **no beverage gets the reduced rate.** Not milk-based
drinks, not tap water.

This was an open question and is now settled. Published guidance disagreed,
because the 7% on milk and water comes from the VAT act's list of **goods**,
while a restaurant serving a drink performs a **service** — and the service side
has no reduced beverage rate. IHK Darmstadt was right; tax-software sources
listing milk at ≥75% and tap water at 7% were describing the goods rate, which
does not reach a restaurant's menu.

The practical consequence is a simpler catalogue than first designed: no
*Milk-based beverage* or *Alcoholic beverage* class for Germany, so a category is
either food or drink and nothing else.

### A combo splits its VAT across its components, with an official shortcut

A combo ("any pizza plus a drink for €12") mixes rates in one line, so its tax is
computed from **its components' own rates, apportioned by their share of the
price** — never from the combo as a single thing.

Germany offers a formal alternative. The BMF letter of 22 December 2025 says that
for splitting the total price of a *Kombiangebot* of food including drinks —
naming buffets and all-inclusive offers — *"ist es nicht zu beanstanden, wenn der
auf die Getränke entfallende Entgeltanteil mit 30 Prozent des Pauschalpreises
angesetzt wird."* "Nicht zu beanstanden" is the standard formula for a
simplification the tax office commits not to challenge, so **30% is a fixed
official figure, not an example.**

**The platform offers both: component apportionment by default, and the flat 30%
as a per-combo option**, labelled in the interface as the BMF simplification
("BMF-Vereinfachung (30 % Getränke) – bitte mit Steuerberater abklären"),
offered to German restaurants only, off by default, and applied only when the
diner picks a drink and something else. Component apportionment weighs each
picked dish by what it would cost on its own right now (offer price, size and
extras included). *Built 8e (2026-10-09).*
Component-based is nearly free because every item's price is already known, and
it is always defensible. The 30% rule exists for the bundle whose drink was never
separately priced — a buffet — and refusing it would force a restaurant to invent
a price it does not use.

⚠️ The BMF wording names buffets and all-inclusive offers. Whether it extends to
a combo whose items each have their own menu price is arguable, and an accountant
should confirm before a restaurant relies on it.

### VAT is per line, not per basket

A basket mixes rates. Each line's tax is extracted separately and summed. A
discount reduces the taxable base: VAT is extracted from what the customer
actually pays, spread across lines in proportion to value.

### The server recomputes every price

The basket lives in the customer's browser and its prices are indicative. At
checkout the server revalidates every line against the live menu — price,
availability, the restaurant's LIVE state. Any difference is shown plainly and
needs one confirmation before payment. No customer is charged a figure they
did not see; no restaurant sells at a price it retired.

### No money ever touches the platform

Customer payments go **straight to the restaurant's own Stripe account** as
Stripe Connect direct charges with a zero application fee. The restaurant
carries the card fees and the chargeback risk — this is said plainly when
selling. The platform never holds funds, never refunds on a restaurant's
behalf, and never moves value between restaurants.

---

## 3. Fulfilment

### Three modes, independently switchable

**Collection**, **delivery by the restaurant's own driver**, and **dine-in at a
table.** A restaurant switches each on or off, sets hours per mode, and each
has its own tax treatment. Ma Pasta launches with collection and dine-in only.

### The customer picks the mode before the menu

Three buttons, no typing. The mode is chosen up front because the delivery fee
and minimum order — the things that actually change the total — should be
visible while the basket is built, not discovered at checkout. Address entry
comes at checkout, not before. A scanned table QR pre-selects dine-in and hides
the question. The normal shop link **never offers dine-in** — only a table QR
can start a table order.

Each dish can additionally be marked as available or not per mode (a draught
beer that cannot leave the building) — an availability rule, never a tax source.

### Delivery: postcode zones

A restaurant lists the postcodes it delivers to. **Each postcode carries its own
delivery fee and its own minimum order value.** The customer's address is
validated against the list before payment; an out-of-range address is offered
collection instead. No radius, no map drawing, no driver app, no live tracking.

> **Built: 8b (2026-10-09, pushed and deployed to dev; delivery is off for every
> restaurant until it switches it on).**
> - **The postcode is asked the moment the diner taps Delivery**, so fee, minimum
>   and estimate show before the basket is built; street and town come at
>   checkout. A postcode not on the list offers collection instead.
> - **Postcodes are stored as text, normalised:** spaces removed, upper-cased;
>   in Germany exactly 5 digits with any leading zero kept (`01067`).
> - **The postcode's minimum compares the dishes only, without the fee, and
>   replaces the shop-wide minimum** for delivery orders. Collection and table
>   orders keep the shop-wide minimum.
> - **Each dish can be marked "Not offered for" a mode** (a draught beer: not for
>   delivery). It disappears from the menu in that mode and the server refuses it.
> - A free delivery (fee 0) prints no fee line.
> - Why: [[delivery-zones-and-fees]].

### Dine-in: pay now, table attached

Table ordering is **collection with a table number** — the customer checks out
and pays immediately, exactly like collection. There are no running tabs, no
paying at the till afterwards, no bill-splitting. This keeps the platform out
of German cash-register law (the certified security element and its
record-keeping duties).

**Table numbers are plain text in the link** (built in slice 5, 2026-10-07).
The QR on each table opens `<storefront>/shops/<slug>?t=<table>`, where the
table is free text: 1–10 letters, digits, spaces or dashes ("7", "Terrasse 3").
There is **no table list** — admin's "Tables & QR codes" page turns whatever the
manager types into QR PNGs and printable A6 cards, and **saves nothing**. "7"
and "07" are simply different tables. A scan binds the table to that browser
tab for **2 hours**, tidies `?t=` out of the address bar and skips the mode
question; a badly formed link shows a notice and the pickup menu, and "Not at
this table?" switches back to collection. Table orders are **paid online like
every order** (§8) and still need name, email and phone.

**One "Dine in" switch per restaurant, off by default.** While it is off, table
links open the normal pickup shop and the server refuses dine-in orders. Secret
per-table codes and a "scan for menu" table picker were deferred (see
`deferred.md`) — every order is prepaid, so a prank order costs the prankster.

### ASAP or scheduled

Both. A scheduled order is placed **up to 4 days (96 hours) ahead in 15-minute
slots** (Manish, 2026-10-09; was 7 days), for **collection and delivery only** —
a table order is always "now". The card is reserved at once and charged on
acceptance like any order. It counts against that slot's capacity (§4), sits in
a silent "Upcoming" list under the order board (no alarm, email or
auto-decline), and moves into the live queue one ready time before it is due,
where auto-accept, the alarm and the decline timer start. Staff can decline it
any time but not accept it early. Scheduling is allowed while the restaurant is
closed. It is priced for the booked time (dish windows, offer prices, VAT). The
invoice is dated, and the order counted against the limit, on the day it is
accepted. A scheduled order is cancellable by the customer until accepted —
which for a Saturday order placed on Wednesday means days. That is accepted for
simplicity.

**Each restaurant switches it on itself** ("Accept orders for later", off by
default), so no kitchen gets booked orders it wasn't told about.

**Timed categories and booking ahead** (2026-10-15). Categories outside their
hours right now sit under an **"Other times"** pill on the menu (shown only when
something is closed); their dishes can be added. Checkout then offers only times
when every dish in the basket is served, and "as soon as possible" only if all
of it is served now. A dish in a timed and a normal category counts as available
whenever any of them is open. Re-submitting checkout frees the diner's own
earlier unpaid slot hold. Why: [[timed-categories-other-times-pill]].

> **Built: 8c (2026-10-09; pushed, deployed to dev and browser-checked).** Why:
> [[scheduled-orders]].

---

## 4. Opening hours and capacity

- **A weekly pattern with several windows per day** (11:00–14:30, 17:00–22:00),
  **defined separately per fulfilment mode** — collection can run later than
  delivery. *Built for delivery only (8b): Settings → Delivery can set its own
  hours; collection and table orders use the opening hours.*
- **Dated exceptions** override the weekly pattern: holidays, a private event.
- **Last orders close one prep-time before the window ends**, configurable per
  restaurant, so a kitchen is not handed a pizza at 21:59.
- **Per-slot capacity caps:** a kitchen can limit itself to N orders per
  15-minute window (1–50, empty = no limit; set under Orders for later, so only
  while that is on). Scheduled orders occupy their slot from the payment step
  (held 20 minutes, then kept once the card is reserved); a full slot is not
  offered. **Orders for now take a place once accepted but are never refused
  for capacity** — busy mode stays their brake. A declined or cancelled order
  frees its place. *Built 8c-2 (2026-10-09, code-tested and pushed; browser
  checks pending). Why: [[slot-capacity-caps]].*
- **Busy mode:** one tap adds a configurable number of minutes to every
  estimate. While auto-accept is on (§5) this is the only live control a
  restaurant has, so it sits somewhere unmissable.

> **Built: 8a (2026-10-08; pushed and deployed to dev the same day).**
> - **Busy mode** is one amber button on the order board ("Busy? Add 20 min"),
>   switchable by anyone who sees the board (owner, manager, staff; not a
>   superadmin). It adds the restaurant's busy minutes (default 20) to every new
>   estimate (the checkout's "as soon as possible (about … min)", the delivery
>   postcode line and the ready time once accepted), and
>   **switches itself off at 04:00 restaurant time**, so a forgotten tap never
>   lasts into the next day's service. It does not bring last orders forward.
> - **No mode line under the banner for a one-mode shop** (Manish, 2026-10-10):
>   the "Collection · ready in about 20 min" pill was removed. With nothing to
>   choose it was noise, and he wanted no info there. Shops with several modes
>   still get the choice buttons, without minutes.
> - **Last orders** = the restaurant's own setting (0–120 min before closing), or
>   one ready time before closing if it hasn't set one.
> - **A 24-hour restaurant no longer refuses orders near midnight:** a window that
>   ends at 00:00 and carries straight on into the next day has no last-orders
>   cut-off at midnight.
> - Capacity caps per slot were built later, in slice 8c-2 (see above).

---

## 5. Taking an order in the restaurant

This is the operational heart of the product. A missed order is a furious
customer and a cancelled subscription.

### The order screen

A web page in the admin app, run on a tablet in the kitchen. No native app in
v1 (React Native later, against the same API). It provides:

1. **An instant on-screen badge** over an open connection — new orders appear
   without a refresh. **Until slice 5a the screen checks for new orders every
   10 seconds instead** (slice 4a); the connection indicator turns red after
   30 s without contact. The open connection (Azure Web PubSub) and push
   notifications (item 3) arrive in 5a with the real-tablet test.
2. **A looping alarm sound.** Browsers refuse audio until the page has been
   interacted with, so the screen asks for one "enable sound" tap at the start
   of each shift, then rings freely.
3. **Push notifications** for restaurants that install the page to the home
   screen (works on Android and desktop; on iPad only when installed — a plain
   Safari tab gets nothing).
4. **A screen wake-lock** so the tablet does not sleep on that page.
5. **A visible "connected — waiting for orders" indicator.**

### Accept, reject, ready

**Staff press two buttons per order: Accept and Ready.** Every other state is
derived from timestamps, because a kitchen will not sustain five taps per order
on a Friday. On Accept, staff may adjust the ready-time from the default.
**Accepting is what takes the diner's money** — it was only reserved at
checkout (§8). Reject records a reason and releases the reservation, so the
diner is never charged.

### Auto-accept: one switch per restaurant, on by default

**A simple on/off switch, on for every restaurant unless the owner turns it
off** (Manish, 2026-10-03 and 2026-10-04). With it on, an order is accepted —
and the money taken — the moment Stripe confirms the diner's payment is
reserved, with the default prep time (§4). It skips the "new" column and the
looping alarm and appears straight under "in progress", marked "accepted
automatically", with a single chime. Owners switch it off to accept each order
themselves. Restaurants that already existed when this shipped (slice 4b)
started with it on too.

**Per-day windows** (e.g. auto 09:00–18:00, manual 18:00–22:00) — **built in
8a (2026-10-08).** Settings → "Automatic acceptance" offers Always / Only at these
times (by hand otherwise) / Never. **The hours are judged at the moment the
restaurant received the order** (Stripe's confirmation reached the server), so
an order received at 17:59 under "automatic until 18:00" stays automatic even if
taking the money is retried at 18:01. Outside the hours, orders wait for staff
with the usual 3-minute alert and 10-minute decline.

**Always, whether or not anyone is watching** (Manish, 2026-10-17; built the
same day). Auto-accept takes the money as soon as a paid order arrives, even
with no Orders page open. The 2026-10-13 "only while someone can see it" rule,
its once-a-minute ping and the amber warning were removed. Accepted cost: an
unwatched auto-accept shop can charge for an order the kitchen never sees.
Decision: [[pause-durations-and-auto-pause]] (supersedes
[[auto-accept-only-while-watched]]).

### The ignored order

An order waiting for staff (auto-accept off) that nobody touches:

- **After 3 minutes** — escalation email to the owner (and an optional second
  address per restaurant).
- **After a configurable timeout, default 10 minutes** — auto-rejected: the
  card reservation is released, so nothing is charged, and the customer gets a
  plain message. An honest rejection beats a customer waiting an hour, and the
  automatic release keeps the platform out of the dispute.

### Ready-time estimate

A **per-restaurant default per fulfilment mode** (20 / 45 / 20 min for
collection / delivery / table unless the owner changes it; 5–120 min, set in
Settings → "Kitchen timing" since 8a), plus busy mode, plus staff adjustment at
Accept. Per-item preparation times are
captured on each dish but **do not yet drive the estimate** — that waits until
there is real data to check them against.

### Thermal printers

Later. Cloud printers (Star CloudPRNT, Epson server-direct) poll the platform
over HTTPS for anything to print — one endpoint, no on-site software. See
`deferred.md`.

---

## 6. The menu

### What a dish carries

**Required:** name and description (per offered language, §12), price, one or
more categories, allergens, additives, and an available flag. **Optional:**
photo, dietary and spice tags, sizes, extras, availability window, preparation
time, per-mode availability, sort order. Tax class comes from the category.

The existing admin app has a multi-step product wizard; keep it — essentials on
step one so a simple dish is four fields and a save.

### Sizes and extras

- **Sizes** (variant groups): named options each with a price difference
  (26cm +€0, 32cm +€3.50) and its own availability.
- **Extras** (add-on groups): one or more groups ("Choose a base", "Toppings"),
  each with a minimum and maximum number of picks, options with price
  differences and their own availability.

These already exist in the code and are the one thing that cannot be bolted on
later, because every historic order references them.

### Allergens and additives are mandatory

**Platform-owned fixed lists per country** (§13), ticked per dish. Germany
ships with the EU's 14 allergen groups and the German numbered additive
declarations. **A dish cannot be published without addressing both.** "Addressed" means each list is either filled in or explicitly ticked "contains none" — an empty list alone counts as undeclared (slice 2). Because
the lists are platform-owned, their labels are translated in every interface
language for free — an English menu never lacks allergen declarations because
the owner only typed English dish names.

Free text is not offered: it is unsearchable, untranslatable, and gives a
customer no way to filter "no nuts".

**Sizes and extras can carry their own allergens and additives** (built
2026-10-13). The dish popup lists the dish's plus those of the chosen options and
updates as the diner picks; a combo adds the extras picked inside it. An option
with nothing ticked adds nothing — the dish's own declaration is still what gates
the menu. Decision: [[option-allergens-undeclared-adds-nothing]].

### Availability

- **Sold-out switch** per dish, and per size or extra option.
- **Time-limited availability:** date range, days of week, daily time window
  (a lunch menu 11:00–15:00), with an optional offer price and label for that
  window. Already exists. **The offer price is now actually charged** — before
  2026-10-08 neither the server nor the storefront applied it. Fixed
  2026-10-08, pushed and deployed to dev 2026-10-09 (backend merge `7b8e4ee`,
  storefront merge `082fe93`).
- **Per fulfilment mode** (§3).
- **Per category** *(built 2026-10-12)*: each category has an on/off switch
  (Admin → Categories, a switch on each row; saves at once) and optional weekly
  times (Admin → Categories → edit → Visibility: days plus from/until, in the
  shop's time zone, no overnight windows). An off or out-of-hours category is
  left off the storefront, its dishes can't be ordered, and combos stop
  offering them. **A dish in two categories stays orderable while either is
  live** (confirmed by Manish 2026-10-13) — see [[category-switch-and-times]].

### Combos

"Any pizza + drink for €12" — a fixed price for a bundle of choices. Tax is
computed from the components (§2).

- The owner builds a combo on its own **Combos** page (anyone who may edit the
  menu): name, price, category, and 1–5 choices, each a list of dishes. The
  diner picks one dish per choice; sizes and extras that cost extra still cost
  extra.
- **Each dish of a combo becomes its own order and invoice line** at its share
  and its own VAT rate ("1 × Pasta-Menü: Pomodoro 9,00 € 7 %", "1 × Pasta-Menü:
  Coca-Cola 3,00 € 19 %"), so invoices, discounts and correction invoices need
  no special handling. The basket and menu show one line at the combo price.
- **An item refund always takes the whole combo** (§7).
- A combo vanishes from the menu when any choice has nothing orderable left.
  Its allergens are the union of every dish it offers.
- **A combo has one photo** (4:3, same crop and size check as a dish); the admin
  won't save a combo without one. **Its name, description and choice-step names
  can be translated** into the second menu language. *(Built 2026-10-11.)*
- Not yet: time windows, offer prices or per-mode switches for combos.

*Built 8e (2026-10-09, code-tested and pushed; browser checks pending). Why:
[[combo-pricing-and-refunds]].*

### Also in the core design

Dietary and spice tags (vegan, halal, gluten-free, mild/hot), customer notes on
a line ("no onions"), checkout upsells ("add a drink?"), per-item preparation
time.

### Photos

One per dish, one per option, a logo and a cover per restaurant. **Accept
anything up to 10 MB; auto-orient, resize and re-encode on upload**, with an
in-browser crop to a fixed ratio the owner can adjust. Storage is not gated by
tier. Owners will not produce correctly-sized images and should not have to.

### Menu content is typed by hand

No import from photos or competitor exports in v1; the model must not preclude
one.

---

## 7. Orders

### Lifecycle

```
PLACED       → ACCEPTED, REJECTED, CANCELLED
ACCEPTED     → IN_PREPARATION, CANCELLED
IN_PREPARATION → READY, OUT_FOR_DELIVERY
READY        → COMPLETED
OUT_FOR_DELIVERY → COMPLETED
COMPLETED    → (end)
REJECTED     → (end)
CANCELLED    → (end)
```

`ACCEPTED` carries a ready-time. `REJECTED` and `CANCELLED` carry a reason and a
timestamp. `IN_PREPARATION` is derived (accepted and within prep time), not
pressed. `READY` only for collection and dine-in; `OUT_FOR_DELIVERY` only for
delivery. An uncollected `READY` order auto-completes at end of day.

Every transition is appended to the order's history with who and when.

**The existing code's lifecycle is payment-only** (`pending_payment | paid |
failed | cancelled | refunded`). Payment state becomes a separate field; the
lifecycle above is the workflow. This is the largest reshape in the backend
and the first thing built (§17).

### Two identifiers

- **`orderRef`** — short, human, spoken aloud (`AB3-K7P`). Shown everywhere:
  storefront, kitchen screen, emails, bag labels. Not sequential, so it leaks
  nothing about volume.
- **Invoice number** — sequential, per restaurant, in the fixed format
  `R-YYYY-NNNNN` (§10). Appears only on the invoice PDF, labelled
  "Rechnungsnummer".

### What the customer can do after ordering

- **Cancel, self-service, until the restaurant accepts** — on the diner's order
  page, reached by a secret link shown right after ordering and sent in the
  confirmation email. Cancelling takes a button press plus a confirm, so an
  email link-scanner opening the link can never cancel. The card reservation
  is released, so nothing is charged. After acceptance the kitchen has
  committed ingredients; the customer phones the restaurant.
- **Edit — never.** Recalculating totals, adjusting payment and re-issuing a
  receipt for a wrong pizza is a phone call.
- **See status — yes, on that same order page** (changed in slice 4a,
  2026-10-02: the cancel link needed somewhere to land, and showing the status
  there cost nothing extra). It refreshes itself; no live push.

### Refunds

**A refund only exists once money has been taken**, which means after
acceptance. Before that, declining or cancelling simply releases the card
reservation (§8) — nothing to refund.

**Owners and Managers can refund, full or partial, with a reason recorded**
(internal, never shown to the diner). Staff can only if Manish gives their role
the "Refund orders" permission in superadmin. **Superadmin cannot refund on a
restaurant's behalf** — the platform can see, and contact the restaurant.

**Two ways to refund** (Manish, 2026-10-05), never mixed in one refund — do two
refunds instead:

- **Tick items.** Staff choose which order lines, and how many of each, to
  refund. Each item is refunded at **its own VAT rate**, so a missing cola is
  corrected entirely at 19 %. This follows §17 UStG: tax is corrected at the
  rate of what was actually refunded.
- **Combos:** ticking any dish of a combo ticks the whole combo; one part of
  a combo can't be refunded on its own by item (use a free amount instead).
  *Built 8e.*
- **Discounts:** a ticked item gives back what was actually paid for it after
  the discount, shown on the correction invoice as the item plus an
  "Anteiliger Rabatt" line. *Built 8d.*
- **Free amount.** For goodwill not tied to an item. The amount is split across
  VAT rates **in proportion to what is still unrefunded at each rate**, counting
  earlier item refunds. This proportional split is the accepted practice only
  for lump sums not tied to items. An item whose rate a free amount has already
  used up can then only be refunded as an amount.

**Every refund automatically creates a correction invoice** (§10), emailed with
the refund email. The money goes back to the diner's card from the restaurant's
own Stripe account; Stripe's original fee is not returned. Refunds made directly
in the restaurant's Stripe dashboard are picked up by the Connect webhook
(`charge.refunded`), recorded as a free-amount refund, and get their correction
invoice from the order timer within a minute. Refunds our app makes are tagged
`metadata.source = ordering-app` at Stripe so the webhook never counts them twice.

**Edge cases (Manish, 2026-10-17; built the same day).** A **full refund of an
order still in play** (accepted, preparing, ready, out for delivery) ends it:
new final state "Erstattet" (`REFUNDED`), off the live board, no ready/done
buttons, diner page "Order refunded — this order is closed". Partial refunds
leave it active. A refund Stripe later **fails or cancels** (`refund.failed`,
`refund.updated`, `charge.refund.updated`) is reversed, never deleted: the
payment drops back, a reversing Rechnungskorrektur is issued, only the
restaurant is emailed, no automatic retry. A **declined/cancelled order partly
refunded in the dashboard** still gets the rest back automatically, worked out
from Stripe's own refund list. Decision: [[full-refund-ends-order]].

### Idempotency

Every submission carries a client-generated key so a double-click, a retry or a
re-delivered webhook returns the existing order rather than creating a second.

### When Stripe's webhook is lost (built 2026-10-13)

A paid checkout no longer depends on the webhook alone. While the diner's order
page is open, each poll asks Stripe directly once the card has been reserved for
15 s with no order yet, and builds the order through the same code the webhook
uses (order id = checkout id, so a second build is refused). A timer every
2 minutes does the same for checkouts 2–60 minutes old. After 45 minutes it gives
up: card released, time slot freed, checkout deleted; the page says nothing was
charged. After 2 minutes of waiting the page adds "taking longer than usual".
Unfinished checkouts expire after 1 hour (Cosmos TTL on `checkout_sessions`).

---

## 8. Payment

### Every order is paid online

**Every order is paid online through Stripe before it reaches the kitchen**
(Manish, 2026-10-03) — collection and table orders alike, and every order needs
an email. The diner pays by **card, Apple Pay or Google Pay**. **No PayPal for
now:** Stripe doesn't offer it to platforms whose businesses take payments
directly, which is our setup (TODO). **There is no pay in person** — the earlier
cash / "pay on collection" option was deleted from the code, not hidden; old
slice-4a orders read as "not paid online". This reverses the 2026-10-01 rule
that a restaurant could go live without Stripe: connecting Stripe is now a
go-live requirement (§16). Why: [[every-order-paid-online]].

### Reserved at checkout, taken on accept

**The diner's card is only reserved at checkout; the money is taken when the
order is accepted** (Manish, 2026-10-03):

1. At checkout Stripe reserves the amount. The order exists only once Stripe
   confirms the reservation.
2. Accepting — by staff, or by auto-accept (§5) — takes the money. If Stripe
   refuses, the order is declined and everyone is told; an order is never left
   accepted but unpaid.
3. Decline, diner cancel and timeout release the reservation. Releasing costs
   nothing, while a refund keeps Stripe's fee, so the restaurant pays nothing
   for orders it never makes. The diner's bank may still show the released
   amount as "pending" for a few days; the decline and cancel texts say so.
4. A failed release is retried every 15 minutes, the restaurant is emailed
   once, and order history shows it in red.

A reservation lasts about 7 days, far longer than any order waits. Why:
[[card-reserved-until-accepted]].

### Direct charges, zero fee

Stripe Connect direct charges into the restaurant's own connected account. The
existing code already has embedded onboarding, an account-session flow, and
both the platform and the Connect webhooks. Each restaurant's Stripe account
is created in the restaurant's own country — a German restaurant gets a German
account in euros — whatever country the platform itself is registered in.

### No tips

Removed from scope outright. See `deferred.md`.

---

## 9. Subscription and limits

> **Built: 7a (2026-10-07, merged to `dev`).** Accepted orders are counted per
> calendar month in the restaurant's time zone. Admin banner at 80/90/95 % and
> red at 100 %, shown to every role, Upgrade only for owners; owner email when
> each threshold is crossed (plus one at 100 %). **The hard stop is at checkout
> only** — orders already paid and waiting can still be accepted, so a month can
> end a few over. The paused storefront page has **no** upgrade link (diners
> can't upgrade; the one-click upgrade is the admin banner). Superadmin can
> override any limit per restaurant (reason + optional expiry); staff logins
> beyond the cap can't sign in (newest first; nothing deleted); decline watch in
> superadmin. A missing plan record means no limits (fail open). **Capability
> keys are not built yet** — they arrive with the first add-on module, since
> nothing in v1 is gated by capability. Billing behaviour below is 7b; owner
> test orders count like any other (7c dropped 2026-10-07). Why: [[order-limit-design]].

### Tiers

| | **Basic** | **Pro** | **Max** |
|---|---|---|---|
| Monthly | free | €29 | €59 |
| Yearly | free | €290 | €590 |
| Orders / month | 30 | 300 | unlimited |
| Staff logins | 5 | 5 | 5 |
| Menu items | unlimited | unlimited | unlimited |

**Orders per month is the only gate.** Staff logins are capped at five on every
tier. Menu items are unlimited. Everything else — card payments, delivery,
tables, the embed when it exists — is available to every tier. The tiers are a
pure volume ladder; upgrade pressure comes from success.

**Every number above is configuration**, set per plan in superadmin, with a
per-restaurant override. No trial: Basic *is* the trial. A trial or a plan
change can be granted by hand from superadmin with a reason and an expiry (the
existing `superadmin_override` mechanism).

### Entitlements are data, never plan names

Each plan is a row: numeric limits plus a list of capability keys. Every gated
action asks "is this restaurant entitled to X?" — never "is this restaurant on
Pro?". **No plan name ever appears in a condition anywhere in the code.** A
future module (invoicing, reservations) is a data change, not a deploy, and can
be switched on for one restaurant.

### Billing

Monthly or yearly, yearly cheaper. **Upgrades take effect instantly.**
**Downgrades take effect at the end of the paid period** and are **blocked
until the restaurant is already under the target tier's limits** — a shop with
more staff than the lower tier allows must remove them first.

### Warnings and the hard stop

- **80%, 90%, 95%** of the monthly order limit: a persistent banner in admin
  that cannot be dismissed, and an email to the owner each time.
- **100%: hard stop on every tier**, free and paid. The storefront shows
  "ordering paused" with a one-click upgrade. Because upgrades are instant, a
  restaurant that hits the wall mid-service is trading again in seconds.

  ⚠️ The hard stop on *paid* tiers was flagged as a retention risk and chosen
  anyway; it stands.

### What counts as an order

**Only accepted orders.** Rejected, cancelled and failed-payment orders do not
count. **Owners' own test orders count like any other** (Manish 2026-10-07:
every order is a real card sale with a real invoice number, so there is no such
thing as a free test order). **Once accepted, cancelling does not
return the slot.** The only way to dodge the counter is to reject before
accepting, which sends the customer an unambiguous rejection — and rejection
rates are tracked on a rolling window and surfaced in superadmin, so a
restaurant rejecting more than a threshold, or spiking near its limit, is
visible. Detection, not prevention.

### Failed payment

After a card fails: **7 days grace with three warning emails, then drop to
Basic with the excess preserved but suspended.** The storefront keeps taking
Basic's 30 orders; staff beyond the cap cannot log in until seats free up;
nothing is deleted. Everything is restored the instant they pay. Deleting a
restaurant's data because a card expired is unforgivable; hiding it is not.

### Multiple restaurants

One owner account can hold several restaurants with a multi-location
dashboard (the owner **Overview**, built 8f). **Each restaurant carries its own
subscription**, paid separately, possibly on different tiers — one subscription
per restaurant, not one combined bill (default 27; the old "billed together"
wording is retired). **Limits never pool**: the overview shows each
restaurant's limit on its own and never adds them up.

---

## 10. Invoices and receipts

### Every accepted order gets one complete invoice

Issued on acceptance, once the money is taken; emailed as a PDF with the
"accepted" email, and downloadable by the diner from their order page and by
staff from order history. Declined, cancelled and timed-out orders get none.
Invoices print names in any Latin, Greek, Cyrillic, Chinese, Japanese or Korean
letters (embedded Noto Sans fonts, 2026-10-13); characters outside those print
as "?".

**Every order gets the same complete invoice under §14 UStG** (Manish,
2026-10-04) — no separate small-amount layout: the seller from the restaurant's
Impressum with its tax number (Steuernummer) or VAT ID; a running number; issue
date; supply date (Leistungsdatum — the acceptance date); items and quantities;
net amount, rate and tax per VAT rate; the gross total; and the buyer's name.
Email and phone never appear.

**The diner's billing address is optional, and required above €250** (a gross
total strictly over 250,00 €) — the point where the small-invoice exemption of
§33 UStDV stops applying. When given, it is printed.

**A delivery fee is printed as its own line at its own rate** ("1 × Liefergebühr
2,50 € 7 %", after the dishes) and counts in the per-rate totals and the gross
total; the €250 rule is judged on the total including the fee. **The delivery
address is never on the invoice** — only the optional billing address (built
8b, 2026-10-09; checked on invoice R-2026-00019).

**The platform generates these invoices itself, not through Stripe Invoicing.**
Why: [[own-invoices-not-stripe-invoicing]]. Electronic invoice formats
(XRechnung, ZUGFeRD) are not needed for invoices to consumers.

### Numbering is fixed: `R-YYYY-NNNNN` per restaurant

Every restaurant uses the same format, `R-<year>-<5 digits>` (e.g.
`R-2026-00001`), with **its own sequence that restarts each calendar year in the
restaurant's time zone**. Separate yearly number ranges are allowed as long as
each number is used once (UStAE 14.5 Abs. 10). Restaurants no longer choose
their own prefix and counter (replaced 2026-10-04): one less thing to set up
before going live.

Guardrails: **a number is consumed when the invoice is issued** (on
acceptance), not when the order is placed, so rejected orders and abandoned
baskets leave no gaps; two simultaneous orders can never take the same number;
correction invoices draw from the same sequence.

### Every refund creates a correction invoice

**"Stornorechnung"** when the first refund covers the whole order (all items
ticked in full, or the full amount entered); **"Rechnungskorrektur"** otherwise;
**never "Gutschrift"** (Manish, 2026-10-04). It references the original
invoice and shows negative amounts per VAT rate — refunded items listed by name
at their own rate, or one partial-refund line per rate for a free amount (§7).
It is emailed with the refund email and listed for download next to the
original. Releasing a reservation before acceptance needs none, since no
invoice existed yet. A German tax adviser checks the layout once.

### No tax number, no invoices

Owners enter a **tax number on the Legal page**; it is printed only on invoices,
never in the public Impressum. An invoice needs either it or the VAT ID. A
restaurant cannot go live without one (§16); one already live without either
keeps taking orders, but gets no invoices until one is filled in.

### Stored as an immutable snapshot, rendered on demand

The PDF is **not** stored. At issue, every fact the receipt shows — the
restaurant's legal details as they were that day, each line's name, quantity,
price and rate, totals, invoice number, date, the buyer's name and address, and the
**template version** — is copied into one record that never changes. The PDF is
rendered from it whenever asked. Old template versions stay in the code so a
2026 receipt re-rendered in 2028 looks like a 2026 receipt.

Advantages over storing files: tiny, re-renderable in any language,
exportable as CSV for an accountant, searchable.

**Kept for eight years** — the retention German tax law imposes on invoices
since 1 January 2025 (it was ten). The archive outlives the restaurant's account
and any customer anonymisation (§15): an invoice is a tax record the restaurant
is legally required to hold. Owners can download any invoice from admin; a
month's batch, and invoices in the owner export, come later (TODO).

---

## 11. Accounts, roles and people

### Owners sign in with Entra; everyone else is local

- **Owners** register and sign in through **Microsoft Entra External ID**
  (self-service sign-up; the existing MSAL integration). Registration comes
  first; creating a restaurant is a separate step afterwards, which is what
  makes one identity holding several restaurants natural.
- **Managers and staff are local accounts** the owner creates by hand:
  **username and password, no email, no self-registration.** Usernames are
  unique per restaurant, not globally, so every restaurant can have a
  `kitchen`. Staff sign in at a restaurant-specific address
  (`/<slug>/staff`) the owner bookmarks on the tablet. No self-service
  password reset — the owner resets from the staff list. Passwords hashed,
  attempts rate-limited, lockout after repeated failures.
- **Customers have no accounts. Ever.** Guest checkout always; an optional
  "remember my details on this device" tickbox stored in the browser only.

The existing invitation subsystem (staff invited as Entra users by email) is
removed.

ℹ️ Entra will not put a user's email on the sign-in token unless each app
registration lists `email` as an optional claim — requesting the scope does
nothing — and self-service sign-ups store their address where it is not a
claim source. Solve at tenant setup; copyshop lost a debugging session to it.

### Three fixed roles

**Owner** (everything, including billing), **Manager** (menu, prices, orders,
staff, refunds, and **reports by default** via "View reports and takings",
which Manish can untick in superadmin — not billing), **Staff** (see and accept
orders, mark ready, toggle sold-out — no prices, never reports, no customer
data, no refunds). **Except
on delivery orders: everyone who sees orders — owner, manager and staff — sees
the delivery address and phone, so the order can be delivered** (Manish,
2026-10-08, slice 8b default 15; built 2026-10-09). Multiple
people in each. **Manish defines what each role can do, globally, from
superadmin; owners cannot change it in v1.** The existing per-shop custom role
CRUD is removed. No Driver role until own-driver delivery has real users.

### Interface language is per person

Each account carries its own language, defaulting to the browser's on first
sign-in, falling back to the restaurant's. A German owner and an
English-speaking manager work on the same restaurant in their own languages.

### Superadmin

Only Manish at first, with the full set: see everything, change subscriptions,
suspend a restaurant, edit a restaurant's content, impersonate an owner —
**every use written to the audit log and visible to that restaurant.** A
superadmin permission model exists from the start, everyone defaulting to full
access, so an invited helper can be restricted later without a rewrite.

### Audit log

**Append-only, permanent, no edit or delete path in any app.** Present in admin
(the restaurant's own history) and superadmin (everything). Records who, what,
which restaurant, when. **Entries hold identifiers and actions, never personal
content** — "user a7f3 refunded order 1042", not names or addresses — so a GDPR
erasure can blank the identity table while the trail stays intact and true.
The existing entry's TTL (self-deleting) and `actorEmail`/`actorName` fields
are removed.

---

## 12. Languages

### Interface

Translated by Manish. **German and English at launch**, built so a new language
is a translation file, not a code change. The admin app already has populated
`de` and `en` files.

### Menu content

**Typed by the restaurant, per language.** No machine translation, offered by
nobody. **Each restaurant chooses which languages it offers.** When a restaurant enables a second
language it is expected to translate its dishes; anything left untranslated
**shows its original text**, and the gaps are flagged to the owner in admin.
Nothing is ever hidden from a customer because of missing data entry.

Platform-owned lists (allergens, additives, tax classes) are translated
centrally and appear correctly in every offered language.

### Page language is separate from menu language (built 2026-10-10)

The storefront's own text (buttons, checkout, order page, legal headings,
prices) is the **page language**; dish names and descriptions are the **menu
language**. They are chosen with one picker but resolved separately:

- **The picker always offers DE and EN**, plus any further menu language the
  shop has. A German-only shop like Ma Pasta shows DE and EN.
- **Page language** = the diner's choice if it's `de` or `en`, otherwise `en`.
  First visit: the browser language if `de`/`en`, otherwise `en`.
- **Menu language** = the diner's choice if the shop's menu has it, otherwise
  the shop's original language. So an English diner at a German-only shop sees
  an English page around German dish names. No "menu only in German" hint.
- **The order carries the page language** (`de`/`en`), so confirmation emails
  and the order page match what the diner used. Dish names stored on the order
  still come from the menu language.
- **Invoices and credit notes stay in the shop's original language**, whatever
  the diner's page language (Manish, 2026-10-10). A German shop issues German
  invoices.
- Restaurant-written legal texts (terms, withdrawal, Impressum lines) stay as
  written; only our headings and labels switch.

Why, and the options held back: [[storefront-page-language]].

### Owner's primary menu language and where translations are typed (built 2026-10-10)

- **The owner picks the primary menu language when the shop is created.** It is
  pre-filled from the owner's browser language, since most owners in Germany
  are German; an English-speaking owner can switch it. Today it is silently
  derived from the country instead.
- **One primary language, locked forever.** Every dish's main text is stored
  in it, so changing it would mean retyping the menu.
- **Extra languages are switched on in Settings** (already built). Switching
  one off hides its translations; it never deletes them (already built).
- **Translations are typed inside the product editor** (option A): a section
  that appears only once a second language is on. Not on a separate page.
- **The amber "texts are missing a translation" banner and the separate
  Translations page are removed.** Translations are optional (untranslated
  text shows the original), so a warning count only nags; and the page is
  replaced by the editor sections.

---

## 13. Platform-owned reference lists

Managed in superadmin, **per country**, translated centrally, referenced by id:

- **Allergens** — Germany: the EU's 14 groups.
- **Additives** — Germany: the numbered declarations (colouring, preservative,
  antioxidant, flavour enhancer, sulphured, blackened, waxed, phosphate,
  sweetener, phenylalanine source, caffeine, quinine, taurine).
- **Tax classes** and each country's class × fulfilment mode → rate table, every
  row carrying an effective-from date (§2). Germany has exactly two classes —
  *Food* 7% and *Beverage* 19% — identical across all three fulfilment modes. No
  beverage gets the reduced rate.

A legal change is one edit by Manish, never a thousand restaurants updating
their menus.

---

## 14. Global readiness

Germany first; built to go elsewhere without rewriting history.

- **Currency and time zone are per restaurant**, woven through every record
  from day one. Already in the code.
- **Tax is a per-country table** (§13), Germany filled in.
- **Address formats are lookup data**, extended when a country needs it.
- **Delivery zones are postcode lists** until a country without postcodes
  turns up.
- **One neutral global domain**, used everywhere; country domains only if a
  market demands them. Not yet bought — see §16.
- Storefront language follows the restaurant (§12).
- **Opening a country deliberately includes a privacy check:** does that
  country's law require a local representative or registration? The EU
  representative (§15) covers the EU plus Norway, Iceland and Liechtenstein;
  the UK, Switzerland, Turkey and China have their own versions. The trigger is
  *choosing* to open the country — its tax classes, translation, currency or
  marketing — not a restaurant from there signing up on its own.

---

## 15. Legal, privacy and data

### The restaurant is the seller; the platform is the software

Everything a customer reads on the way to paying says who they are buying from:
the restaurant's identity dominates the storefront; a plain-language seller
statement at checkout ("This order is a contract between you and Ma Pasta.
[Platform] provides the ordering software."); the restaurant's terms are the
ones accepted at checkout; the confirmation and receipt carry the restaurant's
Impressum. The platform's entire presence on a storefront is one discreet
"ordering by [Platform]" footer line linking to the sales site.

### Legal pages every storefront needs

Required before the LIVE toggle (§16) can switch on:

- **Impressum** — structured fields the owner fills (company name, address,
  managing director, register number, VAT id); the platform generates the page
  in the legally fixed format.
- **Terms** and **withdrawal policy** — free text with guidance notes saying
  what belongs in each. The platform never supplies legal text: a defective
  template is defective across every restaurant at once.
- **Privacy notice** — generated, naming the restaurant as controller and the
  platform as processor, with the sub-processor list (Microsoft — Azure, Entra,
  Communication Services), and Stripe named separately as an **independent
  controller** for card payments, linking to Stripe's own privacy policy.
- **Accepted data processing agreement** — the current version, accepted by the
  owner (see below).

**As built in slice 3 (2026-10-02; full defaults in
`plans/handoff-slice-3-legal.md`):**

- The **Impressum phone is the restaurant's public contact phone** — one field,
  also used for §16's "contact phone" minimum and the checkout allergy line.
- **DPA:** owner-only, per restaurant, ticked when creating it (existing ones
  accept on the Legal page); every acceptance kept. A new version never takes a
  live restaurant offline — it must be accepted before the next switch-on.
  Checkout needs *some* accepted version.
- **Checkout has no "I accept" tickbox** — a "By ordering you accept the Terms…"
  line with links, plus the seller statement and an allergy line. (Lawyer list.)
- **Legal page language:** German for DE/AT/CH restaurants; English when the
  diner's menu language is English.
- **EU representative** appears on the platform's own page, not in each
  restaurant's diner privacy notice (the platform is only processor there).
  The superadmin fills in the platform identity; until then no privacy notice
  can be generated, so no restaurant can go live.
- All platform-written wording (DPA, privacy template, guidance) is marked
  **draft — not lawyer-reviewed** until the lawyer hour.
- Owner-only **export** (JSON + German-Excel CSVs, no order notes) and
  **erasure** (anonymise, keep amounts; refused while an order is open).

### Manish is a processor, not a controller — except for owners

Manish is based in Australia with no EU establishment and wants no controller
status for diner data. So:

- **Restaurants are controllers of their customers' data; the platform
  processes it on their instructions.** Every owner accepts a **data processing
  agreement** (Auftragsverarbeitungsvertrag) at signup, before a single order.
- **No platform-wide customer account exists** — that would have made the
  platform a controller. Hence §11.
- **Owner accounts are the one thing Manish controls** — their name, email and
  billing details for his own subscription business. Small, unavoidable,
  covered by the platform's own privacy policy.

Two obligations follow from being outside the EU regardless of structure:
an **EU representative** under GDPR Article 27, and a **transfer mechanism** —
Australia has no adequacy decision, so everything is hosted in an EU Azure
region, the **Entra tenant is created in the EU** (its data location cannot be
changed afterwards), and Standard Contractual Clauses are folded into the DPA.

**Why the representative is needed at all.** Diner data alone would not
require one: a non-EU processor working for EU controllers is bound through the
DPA, not directly under Article 3(2). **Owner accounts** are what trigger it —
there the platform is a controller offering a service into the EU, and the
product's German-specific design (German VAT, euro pricing, German-law DPA,
Germany-first) reads as targeting the EU regardless of the site being reachable
worldwide. Terms and conditions cannot waive it: the duty is owed to regulators
and data subjects, not to the restaurant.

**Who: a friend in Germany first, a paid service later if needed.** Appointed
in the legal-pack week before the **platform** goes live (build-order slice 3)
— the trigger is the platform opening to restaurants, not any one restaurant.
Needs a signed written mandate, a "forward within 48 hours" arrangement, and a
copy of the record of processing. Their name and address go in the privacy
notice. ⚠️ The representative can be held answerable for *their own* duties —
receiving and forwarding regulator and data-subject mail, producing the record,
cooperating — so the friend must know this before agreeing. Switch to a paid
service (a few hundred euros a year, insured, handles regulator letters
routinely) when growth or a larger customer's data-protection officer calls
for it.

### Stripe is an independent controller, not a sub-processor

Card details go straight from the diner's browser to Stripe, never through the
platform. With Connect direct charges the **restaurant** is Stripe's customer,
so payment data sits between the restaurant and Stripe, with the platform
further from it than it might assume. Stripe acts on duties nobody gives it —
anti-money-laundering, fraud screening, card-scheme rules, sanctions, its own
retention — and the platform could neither stop that nor delete a payment
record on request. Listing it as a sub-processor would claim a control that
does not exist, make the platform answerable for a company whose compliance it
cannot inspect, and let a restaurant formally object to being paid. Microsoft
(Azure, Entra, Communication Services) genuinely is a sub-processor and stays
on the list.

### The data processing agreement

- **Drafted as a hybrid:** a reputable German model AVV adapted in-house, then
  **one lawyer review before the platform goes live**. Every restaurant signs
  the same document, so a defective clause replicates across the whole
  customer base at once.
- **Sub-processors use general authorisation with 30 days' notice and a right
  to object** — the German market norm. A public sub-processor list page that
  restaurants can subscribe to for changes. A restaurant with a genuine
  data-protection objection that cannot be accommodated may terminate. Specific
  per-provider consent was rejected: one non-responding restaurant would block
  an infrastructure change for everyone.

⚠️ This is the shape, not legal advice. An hour with a German data-protection
lawyer before launch, covering: this section as a whole; the AVV review;
whether a business-to-business service like this needs the EU representative at
all (if not, drop it at renewal); whether German civil judgments are
enforceable against the Australian company; the competitor warning-letter
(*Abmahnung*) exposure for GDPR breaches; and, for an accountant, the BMF 30%
combo rule (§2).

### There is no allergy field, deliberately

A customer's own allergy — "I am severely allergic to nuts" — is **health
information**, which GDPR treats as a special category under Article 9 with
stricter rules than ordinary data. The usual justification does not reach it:
"necessary to perform the contract" is a valid basis for ordinary data but is
**not** one of the Article 9 exceptions, which in practice leaves explicit
consent.

**The platform does not offer an allergy field**, and this is a safety decision
before it is a legal one. A field built for allergies creates *reliance*: the
customer believes the kitchen has been told, and if the ticket is missed on a
busy Friday someone is harmed — with the trail pointing at a form the platform
designed and labelled. A phone call has a human confirming. Lieferando and
Deliveroo reach the same conclusion and offer no such field.

What exists instead:

- **Per-dish allergen and additive data** (§6) does the real work — it is what a
  customer needs to choose safely, and it is mandatory.
- **An explicit line at checkout** directing allergy questions to the restaurant,
  with its phone number beside it.
- **The notes field stays a notes field**, labelled for what it is ("kitchen
  requests, e.g. no onions") and explicitly not for allergies.
- **Whatever arrives there anyway is handled properly regardless** — encrypted,
  access-controlled, excluded from analytics and exports. Some customers will
  type it; that is foreseeable, so the storage is designed for it even though it
  is never invited.

⚠️ This leaves the platform occasionally holding health data without a formal
consent record. That is unavoidable short of blocking free text entirely, which
no restaurant would accept. **Typing something is not explicit consent** — it is
not informed, not specific to a purpose, and not demonstrable under Article 7,
and a private checkout form is not data "manifestly made public". The realistic
exposure is not a regulator pursuing a small platform over "no nuts please"; it
is how this reads in litigation after a real harm. The mitigation is the
labelling plus the security, and the reasoning above is what the lawyer should
review rather than rediscover.

Keep two things separate: a **dish's** allergen list is information about food
and is the restaurant's own content. This section is only about what a
**customer** discloses about their own body.

### Retention and erasure

- **A cancelled restaurant:** data kept 90 days fully intact and reactivatable;
  then storefront and menu deleted, order records retained anonymised, invoice
  snapshots retained eight years (§10).
- **A customer erasure request** (which goes to the restaurant, not the
  platform): **anonymise, never delete.** The order survives with its amounts
  and dishes; the person becomes "deleted customer". Tax law requires the
  restaurant to keep the record. **An issued invoice keeps the name and billing
  address printed on it for its eight years**: an invoice must be kept
  unchanged, and GDPR's right to erasure gives way to a legal duty to keep
  records (Art. 17(3)(b)). Email and phone are never on an invoice.
- **The billing address is personal data like the rest** (slice 4b). The
  privacy notice lists it ("if you give it, or for orders over €250") and says
  invoices with name and address are kept eight years; the owner's export
  includes it; erasure removes it from the order, leaving only the invoice
  copy.
- **The delivery address is handled like the billing address** (slice 8b): shown
  to the restaurant's order staff on delivery orders, in the diner's own order
  page and emails, included in the owner's export, removed by erasure; **never
  on the invoice and never in the activity log.** No automatic blanking after a
  period yet (that is slice 5a's retention clean-up).
- **Any restaurant leaving for any reason — including suspension — can export
  its menu, orders and customer list first.**

### Processor duties and hosting duties, designed in

- **Security:** encryption at rest and in transit, access control, a breach
  procedure with the 72-hour clock, instructions-only handling written into the
  DPA.
- **Two documents written now, not at go-live**, in the backend repo
  (`docs/privacy/`):
  - **Breach runbook** — how a breach is noticed, who decides and how fast,
    how affected restaurants are identified and reached, a ready notification
    template (what happened, what data, what was done, what they must do), and
    an incident log that records every incident including unreported ones. As
    processor the platform must notify "without undue delay"; every hour spent
    improvising comes out of the restaurant's own 72 hours.
  - **Record of processing (Article 30)** — categories of data processed for
    restaurants, purposes, sub-processors, location (West Europe), retention,
    security measures. The EU representative holds a copy.
- **Notice-and-action:** a reachable way to report illegal content on a
  storefront, a recorded decision, and the suspend switch — the EU hosting
  liability shield depends on acting once notified.

### Cookies

**No non-essential cookies, no banner.** Session, basket and table code are
strictly necessary; Entra's authentication cookies are exempt; analytics come
from the platform's own order data. A restaurant wanting its own advertising
pixel is a later opt-in that switches a banner on for that storefront only.

---

## 16. Storefront, URL and going live

### URL

`<domain>/shops/<slug>` (the `/shops/` prefix is fine — Manish, 2026-09-30; e.g. Ma Pasta is `/shops/mapasta`). **The owner types the slug at restaurant creation with a
live availability check, first-come-first-served.** It is **changeable only by
asking Manish**, and the old slug redirects permanently — the existing
request-and-approve rename flow implements exactly this. Custom domains: never.

The root domain is the sales site. Storefronts carry **`noindex`**; no SEO
work. One exception that is not SEO: a page title and a **link-preview card**
(image, name, one line) injected into the storefront's HTML shell by a small
Function, so a URL pasted into WhatsApp renders as a card and not a grey box.

### The LIVE toggle

Every restaurant has a switch. **Off** — the storefront shows the restaurant's
name and "not currently taking orders"; no menu, no basket; the link never
looks broken. **On** — refuses to switch unless the minimums exist: one
published dish, opening hours, one fulfilment mode, a contact phone number, the
legal pages, a **connected Stripe account** (every order is paid online —
§8), and a **tax number or VAT ID** for its invoices (§10).
The legal pages are five checks (slice 3): current DPA accepted, Impressum
complete, terms published, withdrawal policy published, privacy notice
generatable. A restaurant already live isn't switched off by them, but checkout
refuses orders until DPA, Impressum, terms and withdrawal exist. Likewise, a
restaurant already live without Stripe stays switched on but can't take orders
(the storefront says it cannot take online orders yet), and one without a tax
number or VAT ID takes orders but issues no invoices until one is entered.
**New restaurants start off.** The owner flips it for holidays or a bad night;
it is also how Ma Pasta stays dark until the switch is intended.

The existing `isPaused` + `pausedMessage` and the Go Live checklist are the
seed of this.

**Paused versus offline (Manish, 2026-10-12; built the same day).** Two separate states:

- **Offline** — the shop isn't presented. Set by the owner (Settings → Shop status →
  "Shop online" switch, field `isPaused`; the go-live checklist runs when switching on) *or* by the superadmin (All
  Shops → "Take offline", with an internal reason; field `offlineBySuperadmin`).
  While the platform holds it offline, the owner can't switch it back on. The
  storefront shows no menu and a popup that can't be closed.
- **Paused** — the owner temporarily stops new orders (overloaded kitchen,
  missing staff): Settings → Shop status → "Pause orders" switch, with an
  optional message for diners (`ordersPaused`, `ordersPausedMessage`). The menu
  stays visible; a popup says orders are paused and appears on every page load;
  checkout refuses with that message. Reaching the monthly order limit shows the
  same paused popup.
  - **How long** (2026-10-17): switching pause on asks 30 minutes / rest of
    today (ends 04:00 shop time) / until switched back. A timed pause ends on
    its own; while it runs, the diner popup adds "We take orders again from
    14:30" when the end is the same day.
  - **Auto-pause:** after N orders in a row declined because nobody answered in
    time (any accept setting), the shop pauses until switched back; the owner
    gets an email and an admin banner. An accept, a staff decline or switching
    pause resets the count. N is per shop, set only by the superadmin (Shops
    list → "Auto-pause"): off or 1–10, default 3.
    Decision: [[pause-durations-and-auto-pause]].
- Closed outside opening hours keeps its own popup, shown once per visit.
- The pause switch is on the Settings page **and** in the sidebar (Manish,
  2026-10-13); both ask for the duration. The online switch is on Settings and
  the Shops list, and the Shops list asks before taking a shop offline.

### Branding

**Logo, cover image and one accent colour, with an automatic contrast check**
so nobody ships pale-yellow buttons on white. **The logo is optional** (Manish,
2026-10-01): without one, the storefront shows the shop's first two letters
("MA" for Ma Pasta) on the accent colour, and going live never requires it. Nothing more: full theming is a
website builder and every storefront becomes a support surface. The existing
four-colour branding is reduced to one.

**Built so far (2026-10-06):** cover image upload in admin → Settings (upload,
preview, remove; JPG/PNG/WebP up to 10 MB; guidance for a ~3:1 banner); the
storefront ships its own default cover instead of loading Unsplash. Still open
from §Photos: resize, re-encode and crop on upload — for any image type.

**How banner and logo are shown (Manish, 2026-10-10, decided live in the UI;
merged to `dev` in storefront + admin, not yet pushed):**
- **Banner shape — fixed, cropped at upload** (Manish, 2026-10-11; replaces the
  2026-10-10 "always whole, blurred sides" rule; merged to `dev` in backend,
  admin and storefront, not yet pushed):
  - Stored size exactly **1920 × 640 (3:1)**. The owner crops in admin before upload, in a
    crop window with a fixed 3:1 frame, zoom, keyboard moves, desktop and phone previews, and
    the centre 2:1 dimmed-outside "Visible on phones" area. Sources under 1200 × 400 refused.
    Only the cropped JPEG is uploaded.
  - The backend reads the uploaded file's real pixel size and refuses anything else
    (`COVER_IMAGE_WRONG_SIZE`), deleting the upload and keeping the old cover.
  - Storefront: 2:1 full width on phones, 3:1 from tablet width up, at most page-content
    width, picture fills the box (cropped centre). No blurred backdrop. Old covers of other
    shapes still fill the box, centre-cropped; no migration.
- **Dish photos — same approach, 4:3** (same date and status): stored exactly
  **1200 × 900**, min source 800 × 600, cropped in the same crop window with a centre-square
  "Phone list" area; backend refuses others (`PRODUCT_IMAGE_WRONG_SIZE`). The dish popup
  shows the photo at 4:3. Combos have no photo upload, so nothing changed there.
- **Logo when uploaded:**
  - Shown whole, bare (no border, rounding or background) and with **no name beside it** in the header.
  - Height is 48 px, or 40 px on phones.
  - Width goes up to 320 px, or 200 px on phones; a wider logo shrinks in height instead.
  - It is never shown above its own pixel size.
  - The admin preview shows it uncropped.
- **No logo:** the initials square plus the name, as before. The home-page restaurant list keeps names under logos.
- **"Show banner" switch** (merged to `dev` in backend, admin and storefront 2026-10-10, not yet pushed):
  - An on/off toggle switch (not a checkbox) in admin → Settings → Cover Image.
  - Owners can turn the banner off entirely: no picture and no stock photo, so the menu starts under the header.
  - The uploaded picture is kept for turning it back on.
  - On by default; each change is logged in Activity.

Why: [[shop-banner-display]], [[shop-logo-display]].

**Shop info block (Manish, 2026-10-10; merged to `dev` in backend + storefront, not
yet pushed):** above the legal footer on the shop page, three columns:
- **Address:** the shop's own address (not the Impressum's), with a "Route planen" button that opens Google Maps directions in a new tab.
- **Opening hours:** the shop's weekly hours, with neighbouring days grouped, "Ruhetag" for closed days, and "durchgehend geöffnet" for 00:00–00:00. Delivery's own hours get their own lines.
- **Phone:** from the Impressum, tappable on phones.
- Any piece that's missing is left out. **No embedded map.** Why: [[shop-info-footer]].


### Onboarding

Entra registration → create a restaurant (name, slug) → a checklist in admin
turning the remaining setup into visible progress, including connecting Stripe
and passing its identity checks → LIVE toggle.

---

## 17. Email

All transactional mail — confirmation, acceptance with the invoice PDF, ready,
rejection, cancellation, refund with the correction invoice, loyalty vouchers,
escalations, limit warnings — sends through
**Azure Communication Services Email** from the platform's own domain, with the
restaurant's address as reply-to (display name: see below).
No custom sending domains, ever. One sending reputation to protect, no new
sub-processor, EU data location. Provider sits behind one interface so it can
be swapped without touching a template.

**The per-restaurant display name can't be done** (found in slice 4a): Azure
Communication Services fixes the sender name per configured sender address, not
per email. So mail arrives from the platform's fixed sender name; instead the
**subject starts with the restaurant's name** and **reply-to is the
restaurant's Impressum email**. Diner emails use the language the diner browsed
in and end with the restaurant's Impressum. Without email configured, emails
are written to the log only (kind and order ref, never contents or addresses).

---

## 18. Growth features

All per restaurant, always — platform-wide value would make Manish a clearing
house between businesses.

- **Discount codes and promotions.** Per restaurant: percentage or fixed,
  optional minimum, dates, total limit and per-diner limit (default 1), on/off;
  not editable once made. One code per order; never off the delivery fee; at
  least €0.50 always charged. On the invoice each dish keeps its menu price and
  the discount is one "Rabatt CODE" line per VAT rate. *Built 8d (2026-10-09).*
  Offer prices (a dish's lunch price) were fixed separately on 2026-10-08.
- **Loyalty as emailed single-use vouchers.** No balance, no account: the
  restaurant sets a rule ("every 5th order earns €5 off"), the platform counts
  accepted orders against the customer's email, and when they qualify it emails
  an expiring single-use `L-` code. The code only reaches the real mailbox.
  **A voucher email is advertising (BGH VI ZR 225/17), so it needs consent: an
  unticked box at checkout, and only ticked orders get the email.** *Built 8d
  (2026-10-09).* Why: [[discount-codes-and-loyalty-vouchers]].
- **Multi-location dashboard** for owners with several restaurants — the owner
  **Overview** after sign-in: today's takings and orders, waiting orders, and
  each restaurant's month against its own limit. Owners only. *Built 8f.*
- **Owner's order app** — a phone-shaped page for managing orders: `/phone`,
  the board one column at a time, installable to the home screen, for anyone
  who sees orders. *Built 8f.*
- **Reports, v1 set:** daily takings, orders by hour, top dishes, collection vs
  delivery vs dine-in split, month-to-date orders against the limit, VAT per
  rate, CSV. "Professional but not everything." An order counts on the day it
  was accepted (restaurant's time zone); a refund on the day it was made; VAT
  per rate matches the invoices and correction invoices to the cent. Owners
  and managers (`view_reports`), never staff. *Built 8f (2026-10-09,
  code-tested and pushed; browser checks pending).* Why:
  [[sales-reports-and-owner-overview]].

---

## 19. Design

A **small shared design system, formalised from what already exists** — the
admin app has a real Tailwind setup worth keeping. Approach: **hybrid** — build
the storefront menu, the checkout and the kitchen order list first, because
they carry the three hardest constraints; freeze what emerged into tokens
(colours, spacing scale, type sizes, radius, shadow) and roughly twenty
components (button, input, dropdown, dialog, table, toast, empty state,
skeleton, error banner); then every further screen is assembled from those.

The kitchen tablet is a real design constraint: glanceable at arm's length,
big touch targets, readable with greasy hands and bad lighting. Those rules
live in the shared components, not in a note everyone forgets by screen twelve.

---

## 20. Infrastructure

- **Separate Entra tenant** (EU data location) and **separate Stripe platform
  account** from copyshop — identity and money are the two things hard to
  unpick later.

  **Separate account, not a separate company.** Both products belong to the one
  registered entity, and Stripe supports exactly this through **Legal Entity
  Sharing**: a second account created under the same login, sharing the one
  verified entity, grouped with copyshop under a Stripe **Organization**. The
  reason it must be a second *account* rather than a second sandbox is Connect —
  a Connect platform's branding, connected businesses, payouts and risk exposure
  are all per account, so one account means both products share all four.

  ✅ The Entra tenant exists: `restaurantorderingdev.onmicrosoft.com`
  (`47342614-e039-456f-9fa5-9a4754e16ae5`), data location Europe, with its own
  app registrations and sign-up flow. See
  `wiki/work/restaurant-ordering-system/entra-tenant.md`.

  ⛔ Stripe is still copyshop's account — tracked in `projects/TODO.md` under
  `restaurant-ordering-system-backend`. No real payment can be taken until it is
  done.
- **Same Azure subscription, its own resource group**, EU region.
- **The dev environment was recreated in `westeurope`** on 2026-09-23 under
  `restaurant-ordering-*` names, replacing one that sat in `australiaeast` and
  `eastasia`. Three Static Web Apps and a Flex Consumption Functions app, all
  deployed by GitHub Actions using stable secret names.
- **`infra/main.bicep`** in the backend repo describes one environment, so a
  second is one command. Nothing described the old environment — it was built by
  hand in the portal. The old resource groups still exist and are Manish's to
  delete.
- **Dev data is wiped and reseeded for Germany** — the existing seed is
  Australian.
- **Dependency upgrade is ticket zero**, before any feature work, with the
  existing Playwright and unit tests as the safety net.

---

## 21. Build order

Full design agreed up front; shipped in sequence. Ma Pasta is already trading,
so the first real order is a real diner, not a friend testing — the legal pack
therefore ships before the switch.

**Working order from 2026-10-07 (Manish: finish dev first):** 7 → 8 → 5a →
notice-and-action mini-slice → 6 → 9. Slice numbers below are unchanged.

1. **Foundation** — dependency upgrade; wipe and reseed; order-model reshape
   (lifecycle + fulfilment mode + payment state as its own field); usage
   counter flipped from products to orders; local staff accounts and fixed
   roles; permanent audit log; customer accounts removed; single accent colour.
2. **Menu** — per-language content; allergen, additive and tax-class lists; tax
   class on category; dietary tags; prep time. Ma Pasta's real menu typed in.
3. **Legal pack** — DPA at signup; Impressum generator; terms and withdrawal
   with guidance; privacy notice; seller statement; retention and export.
   **Built and merged into `dev` 2026-10-02**, except automatic retention
   clean-up (→ 5a; it concerns a restaurant leaving, not a cancelled
   subscription), notice-and-action (→ mini-slice before 6), and the
   platform's own owner privacy policy and terms (→ 5a).
4. **One full collection order, end to end** — mode selection; basket
   revalidation; card and cash; order intake with accept/reject, alarm,
   wake-lock, escalation and auto-reject; confirmation email with invoice
   snapshot and PDF; customer cancel-until-accepted; refunds. **Split in two
   (Manish, 2026-10-02)**, because cash needs no Stripe and no new database
   container while card can't be tested properly before the product's own
   Stripe account exists:
   - **4a — cash collection order with kitchen intake.** Mode selection
     (collection only until slice 5), basket revalidation, VAT per line,
     opening-hours enforcement, idempotent cash placement stamped with the
     terms/withdrawal revisions, intake screen (accept/decline/ready/handed
     over, alarm, wake-lock, 10 s polling), 3-min escalation and auto-decline
     timers, diner order page with cancel, six transactional emails, euro
     prices. **Done (2026-10-02): merged into `dev`, deployed, and all 14
     browser checks passed on dev**, including the Azure-only timers,
     customer erasure on the real database, and the superadmin activity filter. Plan: `plans/handoff-slice-4a-cash-collection-order.md`.
     Why it works the way it does: [[order-intake-design]].
   - **4b — card payments, refunds, invoices.** Un-parked 2026-10-03 when
     Manish decided every order is paid online. Pay-in-person deleted; card
     (with Apple Pay and Google Pay) reserved at checkout, taken on accept,
     released on decline, cancel or timeout; the auto-accept switch, on by
     default; our own §14 invoices numbered `R-YYYY-NNNNN`, with a
     Stornorechnung or Rechnungskorrektur for every refund; refunds by ticked
     items or by a free amount; the optional billing address (required over
     €250); a private tax number with a go-live check. **Built, merged into
     `dev` and deployed in all four repos (2026-10-06).** Stripe moved to the
     product's own test sandbox, Ma Pasta connected, and the local backend
     check passed. **Done 2026-10-06: merged, deployed, browser checks passed**
     — the money flow, invoices, refunds, 3-D Secure, the superadmin
     permission row and activity log, the data export, and Stripe's own
     statuses (held, then taken on accept or released on decline) all checked
     on dev; three bugs found were fixed the same day. Go-live checklist check
     waived (direct toggle; backend tests cover the gate). Plan:
     `plans/archive/handoff-slice-4b-card-payments.md` (version
     4, read with `-v3.md`). Why: [[every-order-paid-online]],
     [[card-reserved-until-accepted]], [[own-invoices-not-stripe-invoicing]],
     [[restaurant-invoice-legal-basics]].
5. **Tables and QR codes.** **Done 2026-10-07: merged into `dev` in all four
   repos, deployed, code tests passed, and all 12 browser checks passed**
   (run on local apps against the dev database; check 10 confirmed from the
   audit data). Free-text table in `?t=`, no table list, QR PNG and A6 cards
   generated in admin, one Dine in switch (off by default; left off for Ma
   Pasta), the table on the kitchen board, history, emails and diner page.
   Table orders are paid online like every other order (§8). Plan:
   `plans/archive/handoff-slice-5-tables-qr-v3.md` (build log
   `plans/archive/handoff-slice-5-build.md`). Why: [[order-intake-design]].
5a. **Production readiness** (added 2026-10-01; numbered 5a so later slice
   numbers referenced elsewhere don't shift). Must be done before slice 6.
   **Postponed by Manish 2026-10-07: dev is completed first** — slices 7 and 8
   are built and tested on dev, then 5a, then 6. Numbers are kept so references
   elsewhere don't break. Cost accepted: Ma Pasta goes live later and the first
   production release is bigger. Settle the product name and domain early anyway
   — the Entra tenant, email domain and Stripe live checks wait on them.
   - **Production Azure environment** — a second environment from the existing
     one-command Bicep setup, separate from dev, with its own database, storage
     and Function App.
   - **Backend settings** — `STAFF_JWT_SECRET` set, Function App on Node 22, all
     secrets in app settings / Key Vault, none in code.
   - **Production Entra tenant** — once the product has a name (TODO).
   - **Own Stripe account** in live mode for this product (TODO), webhooks
     pointed at production. (Dev already has its own test sandbox, separate
     from copyshop's, since 2026-10-06.)
   - **Branches and deploys** (Manish, 2026-10-01) — in all four repos, `dev`
     deploys to the dev environment (already wired) and `main` deploys to
     production (to be wired here). Work merges into `dev` first; a release is
     `dev` merged into `main`. No hand-deploys. No separate `test` branch for
     now.
   - **Error monitoring and alerts** — backend failures (especially order
     intake and payment webhooks) alert Manish before a restaurant notices.
   - **Backups with a tested restore** — orders and invoice snapshots are
     records restaurants must keep; a restore is practised once, not assumed.
   - **Email delivery** — the platform's one sending domain authenticated
     (SPF, DKIM, DMARC) so confirmations land in inboxes, not spam.
   - **Real-kitchen test** — order alarm, wake-lock, escalation and auto-reject
     checked on an actual tablet, including a dropped connection.
6. **Point Ma Pasta's Shop button at `<domain>/mapasta`; flip LIVE when
   intended.** Requires the domain (§14).
7. **Subscription behaviour** — warnings, hard stop, instant upgrade, downgrade
   rules, failed-payment drop. Until then Ma Pasta's plan is set by hand.
   **Planned 2026-10-07**, split 7a (limits, warnings, hard stop, overrides,
   staff cap, decline watch) → 7b (billing: upgrades, downgrades, failed-payment
   grace, webhook fixes). 7c (owner test orders not counting) **dropped by Manish
   2026-10-07** — test orders count like any other.
   **7a done 2026-10-07: merged into `dev` in all four repos, local browser
   checks 1–7 passed;** deployed email check (8) still to do. Product defaults
   1–16 confirmed by Manish 2026-10-07. Plan:
   `plans/handoff-slice-7-subscriptions.md`; start from
   `plans/handoff-slice-7-start.md`.
8. **Delivery zones**, scheduled orders, capacity caps, auto-accept windows,
   busy mode, combos, promotions, loyalty vouchers, reports, multi-location
   dashboard, owner's order app. **Planned 2026-10-08, split into six
   sub-slices** (plan: `plans/handoff-slice-8.md`):
   - **8a** busy mode, auto-accept hours, kitchen timing — **built 2026-10-08**:
     merged into `dev` locally in backend, admin and superadmin, code-tester
     PASS, local browser checks 1–5 passed. **Pushed by Manish 2026-10-08** in
     all repos and deployed to dev. Optional deployed check D1 (auto-accept by hours on a real card
     order) still open.
   - **8b** delivery — **built 2026-10-09**: postcode zones with their own fee
     and minimum, the fee as its own invoice line at 7 %, delivery address and
     phone for all order staff, "Out for delivery" → "Delivered" on the board.
     Merged into `dev` (backend `86acb0f`, storefront `9f9d6f1`, admin
     `ae7731b`, superadmin `c8e11cb`), code-tester PASS, **pushed by Manish
     2026-10-09** in all four repos and deployed to dev. Deployed checks D1–D3
     passed on Ma Pasta (order 5XA-BGN, invoice R-2026-00019). Not yet seen:
     the diner's "On its way" page, the "ist unterwegs" email, and the
     superadmin activity details (TODO). Delivery is off again for Ma Pasta.
     Plan: `plans/handoff-slice-8b-delivery.md`.
   - **8c** scheduled orders — **done 2026-10-09: built, pushed, deployed to
     dev and browser-checked** (backend `f7e720c`, storefront `e4e1649` +
     fix `ee43a6b`, admin `159f4d7`). Up to 4 days ahead, collection and
     delivery only, "Accept orders for later" off by default. The paid checks
     were redone inside 8d's paid checks after the first run failed (the Mac
     slept). Capacity caps split out to 8c-2. Plan:
     `plans/handoff-slice-8c-scheduled.md`. Why: [[scheduled-orders]].
   - **8d** discount codes and loyalty vouchers — **done 2026-10-09: built,
     pushed, deployed to dev and browser-checked** (backend `1b25df6`, admin
     `1d9af1f`, storefront `3f4d7c2`, superadmin `a63b04b`). Loyalty email
     only with the unticked consent box at checkout. **Not yet verified:** the
     invoice and correction-invoice PDFs with discount lines, the voucher
     email's text, and an API-level check that no extra personal data is sent
     (TODO). (Offer prices were pulled out and fixed on their own — done
     2026-10-08, pushed and deployed 2026-10-09.) Plan:
     `plans/handoff-slice-8d-discounts.md`. Why:
     [[discount-codes-and-loyalty-vouchers]].
   - **8c-2** capacity caps ("most orders per 15 minutes") — **built,
     code-tested and pushed 2026-10-09** (backend `84ae1c0`, admin `e0cf0c1`;
     storefront and superadmin unchanged). Orders for now count but are never
     refused (default 18, option c). ⚠️ **Browser checks pending.** Plan:
     `plans/handoff-slice-8c2-capacity.md`. Why: [[slot-capacity-caps]].
   - **8e** combos — **built, code-tested and pushed 2026-10-09** (backend
     `5aed027`, storefront `b765211`, admin `958a464`, superadmin `1b4334d`).
     One invoice line per dish; an item refund always takes the whole combo;
     BMF 30 % drinks option for German restaurants, off by default. ⚠️
     **Browser checks pending.** Plan: `plans/handoff-slice-8e-combos.md`.
     Why: [[combo-pricing-and-refunds]].
   - **8f** reports, owner overview, phone view — **built, code-tested and
     pushed 2026-10-09** (backend `31aa7ed`, admin `9061141`, superadmin
     `6008f51`; storefront unchanged). `view_reports` for owners and managers
     (on by default), never staff; billing stays one subscription per
     restaurant. ⚠️ **Browser checks pending.** Plan:
     `plans/handoff-slice-8f-reports.md`. Why:
     [[sales-reports-and-owner-overview]].

   **Next after slice 8:** 5a (production readiness), then 6 (go live). Start
   from `plans/handoff-after-slice-8.md`.
9. ~~**Embed widget**~~ — **out of scope for now** (Manish, 2026-10-09); a topic
   for future discussion. Reasons and trade-offs in `deferred.md`.

**Start with the order model.** Everything in intake, scheduling, tax-by-mode
and reporting hangs off it, and every day it waits is another feature built
against the wrong shape.

---

## 22. Explicitly out of scope

See `deferred.md` for each item's reason and whether it is *later* or *never*.
Headline: no POS or till, no kiosks, no menu boards, no branded apps, no driver
routing, no reservations, no directory beyond the plain root list, no custom domains, no customer
accounts, no platform-wide loyalty, no cross-restaurant carts, no tips, no SEO,
no order editing, no pay-at-till, no custom sending domains, no embedded
ordering widget for now (open for future discussion).
