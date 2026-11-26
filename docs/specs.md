# Restaurant-ordering-system — what the product is and the rules it runs on

This is the **current-truth spec** for the restaurant ordering platform: what
has been decided, organised by subject so a rule can be looked up without
reading the file end to end. It is the source a ticket is cut from.

**What belongs here:** durable product law and the configuration numbers that
are product decisions. **What does not:** how any of it is implemented. That
lives in the code.

**This is the only specification document.** Everything ruled out of scope, with
the reason, is in §22 — if a feature seems missing, check there before assuming
it was forgotten. Open work is tracked on the kanban board, not in this file.
The 2026-08-27 audit of the pre-spec code was reconciled on 2026-11-13: every
conflict it named is resolved (built the decided way, or superseded by a later
decision here) and everything it listed as missing is built, except the
link-preview / `noindex` work (§16).

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

All three talk to one backend (`restaurant-ordering-system-backend`). A fifth
repo (`rs-e2e`) holds the end-to-end browser tests and the daily contract check
against the deployed dev environment.

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
roughly two thirds of the platform spine already matched this spec; the rest has
since been built or reshaped.

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
arithmetic on money. This includes client-side state such as a shopping
cart: line prices are held as integer cents, never as decimal euros.

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
  Food — 7 %. This dish uses Beverages — 19 %."). The category editor opens in a
  drawer over the category list (no separate edit page, no permanent side column)
  and has "Apply to all dishes in this category" for a section that was set wrong.
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
- **Built (decided 2026-10-13):** a separate **"Delivery" tax class at 19 %** is
  the default for delivery fees, replacing the Speisen 7 % default. Its own
  class, not Getränke, so each rate can change alone. See
  [[delivery-fee-tax-class]].

> **Built: 8b (2026-10-09, pushed and deployed to dev); Delivery class always
> used since 2026-10-13.** The delivery fee is its own invoice line, always at
> the country's **Delivery** class ("Delivery (19 %)" in Germany) — never
> Speisen. The per-shop setting `deliveryFeeTaxClassId` is deprecated and always
> null; the Settings → Delivery class picker is retired.

**Germany's seeded classes: three.** *Food* at 7%, *Beverage* at 19% and
*Delivery* at 19% (the delivery fee's own class) — and that is the whole table —
**no beverage gets the reduced rate.** Not milk-based
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
per-table codes and a "scan for menu" table picker were deferred (Manish,
2026-10-03/05) — every order is prepaid, so a prank order costs the prankster.
Revisit if prank orders appear; random codes can share the same `?t=` link and
orders keep their own copy of the table, so the swap is cheap. A generic QR
for the restaurant's plain menu link (no table) exists in admin Settings.

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
   without a refresh, with a 10-second poll kept as a fallback; the connection
   indicator turns red after 30 s without contact. The open connection (Azure
   Web PubSub) and push notifications (item 3) are **built**.
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
- **If the order is waiting because the platform's own Stripe key is unusable**
  (expired, revoked, missing a permission — see §8), the escalation email says
  so: the card is only held, nothing is charged, the owner need do nothing.

### Ready-time estimate

A **per-restaurant default per fulfilment mode** (20 / 45 / 20 min for
collection / delivery / table unless the owner changes it; 5–120 min, set in
Settings → "Kitchen timing" since 8a), plus busy mode, plus staff adjustment at
Accept. Per-item preparation times are
captured on each dish but **do not yet drive the estimate** — that waits until
there is real data to check them against.

### Thermal printers

Later. Cloud printers (Star CloudPRNT, Epson server-direct) poll the platform
over HTTPS for anything to print — one endpoint, no on-site software. Not
built (§22).

---

## 6. The menu

### What a dish carries

**Required:** name (per offered language, §12), price, one or more categories,
allergens, additives, and an available flag. **Optional:** description (defaults
to empty, so a dish can be created as a name-only draft and filled in later),
photo, dietary and spice tags, sizes, extras, availability window, preparation
time, per-mode availability, sort order. **The dish owns its own tax class**; a
category's class is only the suggestion for a new dish (§2).

Adding a dish uses the Add dish screen (below), the same screen as editing with a
required-items checklist; the old five-step wizard is gone.

The dish editor has no live preview: there is no embedded storefront and no
side-by-side preview of how a dish will look to customers while it is being edited.
Clicking a dish opens the editor in a right-hand drawer that slides in over the dish
list (a 1240 px panel on desktop, narrower windows get the full width; full screen on phones); the list stays visible and in place behind it. The drawer closes via its X
button, Escape, a click on the backdrop, clicking a different dish row (which instead
swaps the drawer to that dish), or browser back. Every close path goes through the
same unsaved-changes guard: if the editor has unsaved edits, closing prompts for
confirmation instead of discarding them silently.

Every API call any rs-admin control makes (editor, orders, lists, toggles, drag-and-drop
saves, uploads, downloads, sign-out) gives feedback: its trigger shows a spinner and is
disabled while the call is in flight, a success shows a specific toast, and a failure
shows the server's own error message (not a generic string) in a toast that stays up
longer than a success toast and can be dismissed early. A failed save or delete leaves
the drawer open with the user's edits intact so they can retry. The rs-admin test
`src/components/ui/pendingControls.test.ts` enforces the spinner automatically: it fails
if any source file calls a mutation without pending wiring.

### The edit-dish screen

The panel that opens from Admin → Dishes is one screen with a 72 px header, a
236 px section nav on the left, a scrolling main column (max 720 px) holding the
active section, and a 72 px footer. It is built as one shared dish-form component
(`mode: edit | add`) so the Add dish screen can reuse the same header, nav, sections
and footer; Add additionally gets a "Start from a similar dish" box above Basics
(see "The Add dish screen" below).

**Header.** A round close button (44 px), the dish name in the shop's original
language (truncated) as the title, and the subtitle "Edit dish · <categories>"
("No category" when none is chosen). On the right: the **On the menu / Hidden**
switch — this is the dish's existing `isAvailable` flag, and it is the only on/off
control on the screen (there is no "mark sold out" control anywhere) — and, when the
shop offers two menu languages, a language toggle. The toggle switches the Name and
Description fields between the languages; a small orange dot sits on the second
language's button while that language's description is empty.

**The four sections.**

1. **Basics.** Photo (176 px square, optional, "Replace photo"; the dish can only be on the menu with one, see "Photo rule" below), Name and
   Description for the language selected in the header (labelled "Name (German)" etc.;
   description capped at 160 characters with a live "n / 160" counter), Price and Tax
   class, and the categories as removable chips with "+ Add category". Below the price a
   line reads "Customers pay €X. That includes €Y VAT; net €Z.": X is the typed
   gross price, the rate comes from the dish's *effective* tax class (its own class, else
   the first chosen category's suggestion, §2), VAT is the portion extracted from the
   gross price and net is gross minus VAT. When the rates differ per way of ordering
   there is no single VAT figure, so only "Customers pay €X." is shown. In the
   second language, an empty description shows an orange border and "Missing
   translation"; the original text is displayed only as a grey placeholder and is never
   copied into the field, so saving an empty translation saves it empty. Beside the
   counter, a **"Use the German text"** button (the original language's name) appears
   while the extra-language description is empty: one click copies the original name
   and description into that language's fields. It is on both Edit and Add.
2. **Food info.** Allergens and additives, each a chip row with a status pill
   ("n selected", "None", or "Not confirmed") and a checkbox ("Contains none of the N
   allergens", "Contains no declarable additives"; N is the number of allergens in the
   shop's reference list, never a fixed number). `null` means not confirmed; the
   checkbox is the affirmative `[]`. Picking any chip clears the checkbox, ticking the
   checkbox clears all chips, and removing the last chip returns to `null`.
   Then dietary tags (a plain chip row) and spiciness (a single-select control: "Not
   spicy" is the unset state, `spiceLevel: null`, followed by the levels from the
   reference list). Every label, in both languages, comes from the reference data.
3. **Options and extras.** Two sections, **Variant** and **Extras**. Each group is
   shown as a card: group name, a badge ("Required · choose 1" for the variant; for
   extras "Optional · up to N" or "Required · choose …" from the group's own minimum and
   maximum), its options with their price deltas, and "Edit group". Groups are shared:
   editing one opens the library group editor and changes every dish that uses it.
   - *Variant* is a single slot holding at most one group; it is empty when none is
     attached. An empty slot offers "+ Attach existing group" (lists the library
     variant groups) and "Create new group" (creates one in the library and attaches
     it). Once filled, the action becomes **Replace**, which swaps the one variant
     group for a different library group; it never adds a second.
   - *Extras* holds any number of groups, drag-to-reorder: the order shown is the
     order customers see them in. It offers "+ Attach existing group" (library extras
     groups not yet attached), "Create new group" and, on each card, "Remove from
     dish", which only detaches the reference.
   - A dish that still carries groups saved on the dish itself (from before the
     library) shows them under "Only on this dish" and they stay editable there.
   - A legacy dish that already carries two or more variant groups shows the first one
     (the one the storefront uses) normally in the Variant slot. Any further ones
     appear in a read-only list marked **"Not shown to customers"**. They stay until
     the admin removes them (grandfathered), but no variant group can be attached
     while two or more already exist.
4. **Availability.** Switches for Collection, Delivery and Dine in (a switch is on
   when the way of ordering is *not* in the dish's `unavailableModes`), the
   Age-restricted (18+) switch (`ageRestricted`), and Preparation time in minutes
   (`prepMinutes`). Below them stays the schedule / special price card. **Delete dish** is not tied to this tab: it sits at the left of the footer and is reachable from every section (Basics included), even with unsaved edits. It is a soft delete (past orders keep the dish). Clicking it shows a confirm step with Cancel and a red confirm button; success shows a toast and closes the editor without the unsaved-changes prompt, and a failure shows a toast with the exact reason from the server and keeps the editor open.

**Section nav status lines.** Each nav item shows a label and a status line under it:

- *Basics* — "Complete", or, in orange, "English description missing" (the second
  menu language's name, e.g. "German description missing" in an English-original
  shop) when that language's description is empty. A shop with one menu language is
  always "Complete".
- *Food info* — "Complete" only when allergens **and** additives are each confirmed
  (something selected, or the "none" checkbox ticked); otherwise, in orange,
  "Confirm allergens".
- *Options and extras* — "<v> variant · <e> extras" (grey), v = 0 or 1 (whether a
  variant group is in the Variant slot) and e = the number of extras groups, e.g.
  "1 variant · 3 extras" or "0 variant · 2 extras". Groups saved on the dish itself
  count in the same way.
- *Availability* — "On the menu" (grey) or "Hidden from the menu" (orange),
  mirroring the header switch.

**Footer: Discard and Save changes.** The footer shows a status dot and text —
"Unsaved changes" (orange) while the form differs from what was last saved or a new photo
is waiting, "All changes saved" (green) otherwise. **Discard** and **Save changes** are
both `disabled` (not merely faded) until there is an unsaved change. Discard reverts
every field, and a pending photo, to the last-saved dish. Save changes first checks name,
description and at least one category (a failure jumps to Basics and says what is
missing; a missing photo is not one, it never blocks a save), then calls the existing dish update with every field above; a new photo is
uploaded after the update succeeds. A failed save leaves the panel open with the edits
intact. Leaving the page, or closing the panel, with unsaved changes still asks for
confirmation first. The footer's **Duplicate** button, next to Delete dish, starts a copy; see "Duplicate dish" below.

### The Add dish screen

Admin → Dishes → **Add dish** (the `?addProduct=1` query parameter) opens the same
1240 px right-hand drawer with the same shared dish form in `mode: add`. It differs
from Edit in these ways; everything else (sections, labels, languages, option groups)
is identical.

**Header.** Close button, the German name typed so far (or "New dish") as the title,
the subtitle "Add dish · not on the menu yet", and the language toggle, with English
marked "optional". There is **no On the menu switch**: a new dish has nothing to
toggle yet.

**Required list and "N required left".** Five things are required before a dish goes on
the menu: **German name, Price above 0, at least one Category, Allergens
confirmed, Additives confirmed** ("none" counts as confirmed, as in Edit). The **photo is
optional** (changed 2026-11-26): a dish can be added and saved without one, but is created
**off** and can only be turned on once it has a photo (Photo rule below). Under the nav
a "Before you add it" checklist shows the five rows (a round tick when done); each row is
a button that jumps to its section. Add mode's nav status lines are: Basics "N required
left" / "Complete"; Food info "Confirm allergens and additives" / "Complete"; Options
"Optional" / "N groups"; Availability "Available everywhere" / "Customised". Description
is **not** required when adding (it is in Edit). Labels carry "Required"/"optional"
badges only in Add.

The primary footer button is never disabled. While anything is open it reads "N required
left"; clicking it shows the inline errors ("Enter a German
name.", "Enter a price above €0.00.", "Choose at least one category.") and jumps to the
first open section (Basics before Food info). With all five done it reads **Add to
menu** and creates the dish (`createProduct`, then the photo upload; a failed upload
keeps the dish and the next press retries only the photo).

**Save as draft.** Disabled only while the German name is empty, never for any other
reason. It creates the dish with whatever has been entered, always with
`isAvailable: false`, so even a complete draft stays off the menu until "Add to menu".
Later saves update that same dish rather than creating another. The footer reads
"Draft · not on the menu yet", then "Draft saved" (green). Because the backend now accepts an empty
description (t_9c6b1042), a name-only draft succeeds; a backend older than that change
answers 400 "description is required".

**Start from a similar dish.** An optional select of the shop's own dishes. Choosing one
copies its **categories, tax class (the dish's effective class), option-group
references and any dish-only variant/addon groups**, and says "Copied category, tax
class and option groups from <dish>. Allergens and additives are not copied; please
confirm them yourself." It deliberately **does not copy allergens, additives, dietary
tags or the spice level**: those are declarations the owner must make for each dish.

**After adding.** A green banner at the top of the content reads "<dish> was added to
the menu." and the footer buttons become **View in menu** (closes the drawer back to the
list) and **Add another dish** (clears the whole form and photo, back to Basics, stays
open). Availability for a new dish reads "New dishes are available everywhere. Turn off
any way of ordering that does not suit this dish."

### Duplicate dish (Dishes screen and dish editor)

**Where.** Everyone with manage_menu sees a "Duplicate <dish name>" icon button (Copy icon, 44px touch target) on every dish row, and a "Duplicate" button next to "Delete dish" in the dish editor's footer. The row button does not open the editor. The editor button closes the editor first. Both open the Add dish screen pre-filled from the chosen dish. Nothing is created until the owner presses "Save as draft" or "Add to menu"; Cancel discards everything, exactly like an unsaved new dish.

**What is copied.** Description, price, categories, name and description translations, prep time, the ways of ordering the dish is hidden for, age restriction, tax class, variant groups, add-on groups (dish-only groups and their options get new ids), references to shared option groups, and the availability schedule / special price.

**What is not copied.** The dish's id, created/updated timestamps, order history and statistics, its position in the category (the copy goes to the end, like any new dish), and its availability. Also not copied: allergens, additives, dietary tags and spice level. These start unconfirmed/empty, exactly like a brand-new dish, and the screen says: "Allergens and additives are not copied; please confirm them yourself." The owner must confirm allergens and additives before the dish can be added to the menu.

**Starts OFF.** The copy always starts off the menu (draft), even if the original is on. It goes on the menu only via "Add to menu" once the required items are done.

**Name.** The name is pre-filled as "<original name> (copy)" ("<Name> (Kopie)" in German). The Name field is focused with its text selected, so the owner can overtype the suffix.

**Photo.** If the original has a photo, the admin downloads it and uploads it again as a new, independent image for the copy, so deleting either dish never affects the other. If the photo cannot be copied (for example the image host refuses the download), the copy is created without a photo: the photo field is highlighted, a message says "Could not copy the photo; add one and turn the dish on when you're ready.", and the dish stays OFF (it can be saved as a draft, but cannot be turned on without a photo).

**Backend.** No new endpoint. Duplicate uses the existing create-dish request; the new id is always generated by the server.

### Age-restricted dishes

A dish can carry **`ageRestricted: boolean`** (optional, defaults to
`false`) — set on alcoholic items (draught beer, house wine) so the
platform can treat them as 18+/Jugendschutz-relevant. It is settable
via the existing admin dish-editor update endpoint, included in the
storefront catalog response per dish/variant, and **snapshotted onto
the order line at order time** — like price and name — so a later
change to the dish's flag never retroactively changes what a past
order required. Existing dishes default to `false`. It now drives two
customer/staff-facing behaviors, described below.

**Checkout confirmation.** When the cart contains at least one
age-restricted dish — a plain dish, or a combo with an age-restricted
component — the storefront checkout shows a single confirmation checkbox
that the diner must tick before they can submit the order; the
place-order / continue-to-payment action stays disabled until it is
checked. The gate is enforced entirely client-side. The confirmation is
sent to the server as a timestamp (`ageConfirmedAt`) alongside the
checkout request and is stored on the placed Order as a compliance record
(not exposed on any admin order-read DTO).

**Handover reminder.** In the admin order board and order drawer, an
order containing one or more age-restricted items carries a clear visual
reminder (check ID on handover — the order contains alcohol), so staff
are prompted to verify age at pickup or delivery. It is driven by the
`ageRestricted` flag already snapshotted on the order lines, so it
reflects what the order required when it was placed.

### Sizes and extras

A dish has **at most one** size (variant group): the storefront only ever shows the
first, and the cart and the order line each hold a single size choice. Extras
(add-on groups) are unlimited in number. A dish saved before this rule with two or
more variant groups keeps the extra ones; nothing is silently deleted or migrated.
Only a save that *adds* another variant group where one already exists (inline or by
attaching a library group) is rejected, with `INVALID_INPUT`; a save that leaves the
count the same or reduces it still succeeds.

- **Sizes** (variant groups): named options each with a price difference
  (26cm +€0, 32cm +€3.50) and its own availability.
- **Extras** (add-on groups): one or more groups ("Choose a base", "Toppings"),
  each with a minimum and maximum number of picks, options with price
  differences and their own availability. An extra can also carry an optional
**category** (text, up to 40 characters: "Cheese", "Protein"). The storefront
groups the extras on a dish under these headings, in the order they first
appear, and puts extras without one under the add-on group's own name. It is
plain text, not translated per language. Set it in the dish editor or the
option-group library; it flows through library groups unchanged.

These already exist in the code and are the one thing that cannot be bolted on
later, because every historic order references them.

**Shop-level option-group library.** A group ("Choose a drink") can be defined
once per shop (`option_groups` container; `GET/POST/PUT/DELETE
/shops/{shopId}/option-groups`, plus `PATCH .../options/{optionId}` for the one
availability switch) and a dish reuses it through `optionGroupRefs`. On every
read that matters (storefront catalog, quote and checkout pricing) the referenced
groups are materialised alongside the dish's own inline groups, so everything
downstream is unchanged, and an option switched off in the library ("out of
Coke") disappears from every dish that uses it. Unknown or deleted refs are
skipped on read. Inline variant/add-on groups remain supported. Extras reach the
storefront catalog, the quote and checkout in the order the admin set them on the
dish, that is the order of the dish's own `optionGroupRefs` array, not any other
ordering (alphabetical, creation date, etc.).

A newly created shop starts with two library groups, seeded by `executeCreateShop`
through the same validation and repository code the manual create path uses: a
**Size** variant group (Small, Medium, Large; min 1 / max 1, as all variant groups
are) and an **Extras** add-on group (Extra cheese, Extra sauce, Extra portion;
min 0 / max 3). Every seeded price is a neutral `priceDelta` of 0 cents, since the
owner has not set real prices yet. Names are stored in the shop's original menu
language, with translations for the other supported menu language(s). Both are
ordinary option groups: the owner can rename, reprice, add or remove options, or
delete them. Nothing is locked, and deleting one does not bring it back. If seeding
fails, the shop is still created. Shops created before this change are not
backfilled, and restoring a wound-down shop does not seed again (it only flips
`isDeleted`).

The admin library page filters the groups by kind with **Variants** and **Extras** tabs (no "All" tab); Variants is the default tab when the URL has no `?kind=` (an invalid or stale `?kind=all` falls back to Variants, `?kind=addon` selects Extras). The Variants and Extras tabs show their group counts, and the active tab is kept in the URL. Each group's option list is a collapsible accordion that starts collapsed on load regardless of its option count, with an "N unavailable" badge in the header. Expand-all / collapse-all controls and the per-group toggle remain, and a user's explicit open/closed choice in the session overrides the default.

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

### Dish order within a category

The owner sets the order of the dishes inside each category. It is stored on the dish, **per category**
(`categoryOrder: { [categoryId]: position }`), so a dish that lives in two categories has an independent
position in each. A category never reordered sorts by name; a dish without a position in a category (newly
added to it, or never ordered) sorts **after** every ordered dish, by name — adding a dish to a category does
not assign it a position, so it lands last. Removing a dish from a category, or soft-deleting it, needs no
cleanup: the menu filters by `categoryIds` first, and gaps in the numbering are fine because only the
relative value matters. The public catalog (`GET /shops/{id}/catalog`) applies the order
(`sortByCategoryOrder`, `domain/product/Product.ts`); the admin dish list stays one shop-wide list and
carries each dish's `categoryOrder` so the client sorts per category tab. Combos are not part of the
reorderable set and sort as unordered.

`PUT /shops/{shopId}/categories/{categoryId}/dish-order` with `{ "productIds": [...] }` (permission
`manage_menu`) saves the order. The body must be **exactly** the category's current dishes — no fewer, no
more, no duplicates, none from another shop or category — in the intended order, otherwise `INVALID_INPUT`
naming the offending ids; an empty list is valid only for a category with no dishes. Position is the 0-based
array index. It is idempotent: a dish whose position is already right is not written (its `updatedAt` is not
touched), so resubmitting the same order writes nothing. The response is the saved order (`{ id, name }[]`).
It is **not transactional** across the dishes: two admins reordering at once is last-write-wins per dish, and
a failure partway can leave a mixed order (no rollback; the owner just saves again). Audited as
`category.dishOrder.update`.

In the admin (`rs-admin`) Dishes list each dish row inside a category group has a drag handle; one drag
reorders one category. There is no cross-category drag — moving a dish to another category is done in the dish
editor. The new order shows at once and is saved with the endpoint above; if the save fails the list reverts
and an error message is shown. Mouse, touch and keyboard dragging are supported.

Reordering a filtered subset is ambiguous, so while a filter chip other than "All" or a search query is active
the handles stay visible but greyed out, with a tooltip saying to clear the filter and search. The
"uncategorized" group has no handle at all, since there is no category to order within.

### Availability

- **Availability switch** per dish (on/off, permanent — there is no
  sold-out-until-a-time concept), and independently per size or extra option.
  The switch is read through `GET /products/by-shop` and toggled through
  `PATCH /products/{productId}/availability`, which needs the `manage_stock` or
  `manage_menu` staff permission. The route was never imported in `src/index.ts`
  until 2026-11-25 (every PATCH returned a bare 404); `src/index.test.ts` now
  fails if any `src/functions/**/index.ts` is left unregistered.
- **Removed 2026-11-25:** the dish-level sold-out-until-a-time control
  (`unavailableUntil`, `isSoldOut`/`isAvailableNow`, the catalog `soldOut`
  field, the admin "Sold out today" button). A dish's availability is now
  decided by `isAvailable` alone; any `unavailableUntil` previously stored in
  the database is no longer read. The availability PATCH route silently ignores
  an `unavailableUntil` field in its body rather than rejecting it, so a stale
  client does not start getting errors.
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
  Category times are **deliberately one window per day, no overnight window, and
  23:59 as an end time is never live**; widen only when a shop needs a
  late-night-only or split-lunch section (reuse the opening-hours format).
- **Offer labels** (a dish window's "Angebot des Tages") are translated like the
  other menu text: the shop stores one per menu language and a diner of another
  language sees it. A one-language shop shows the original string, as does any
  language the shop has not translated (§12).

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
- **A combo has one optional photo** (4:3, same crop and size check as a dish). It can be
  saved without one, but only while it is off; see "Photo rule" in §6 (`COMBO_IMAGE_REQUIRED_TO_ENABLE`). **Its name, description and choice-step names
  can be translated** into the second menu language. *(Built 2026-10-11.)*
- Not yet: time windows, offer prices or per-mode switches for combos. All three
  are **later, not v1** (decided 2026-11-16, §22): a combo is a fixed offer at a
  fixed price with no per-mode variant.

*Built 8e (2026-10-09, code-tested and pushed; browser checks pending). Why:
[[combo-pricing-and-refunds]].*

### Also in the core design

**Dietary tags are built:** vegan, vegetarian, halal, gluten-free and
lactose-free. **Spice level is built too**, as its own per-dish field
(`spiceLevel`: mild / medium / hot), not as a dietary tag. Customer notes on a
line ("no onions") and per-item preparation time are built. **Checkout upsell
("add a drink?") is parked — see §22.**

### Photos

**Photo rule (changed 2026-11-26; replaces "a dish/combo cannot be saved without a photo").**
A dish or combo can be created, edited and saved **without a photo, and its last photo
can be removed, but only while it is off** (`isAvailable: false`). A write that would
leave it **on with no photo is refused with 409 `{ error, code }` and changes nothing**;
the server never switches an item off on its own. Exact mapping:

| Situation | Code | Message |
|---|---|---|
| Dish: turned on (create with `isAvailable: true`; update or `PATCH .../availability` with `isAvailable: true`) with no photo | `PRODUCT_IMAGE_REQUIRED_TO_ENABLE` | "A dish can't be turned on without a photo. Add a photo first, then turn it on." |
| Dish: the write would leave it on with no photo without asking to turn it on (remove the last photo while it stays on; any edit of a legacy on-dish that has none) | `PRODUCT_IMAGE_REQUIRED` | "This update was refused because it would leave an available dish with no photo. Turn the dish off first, or keep a photo." |
| Combo: turned on with no photo (create, `PUT`, availability) | `COMBO_IMAGE_REQUIRED_TO_ENABLE` | "A combo can't be turned on without a photo. Add a photo first, then turn it on." |
| Combo: left on with no photo (last photo removed while on, or `PUT` of a legacy on-combo with none) | `COMBO_IMAGE_REQUIRED_TO_ENABLE` | "This update was refused because it would leave an available combo with no photo. Turn the combo off first, or keep a photo." |

"After the write" means the photos the request sends (else the stored ones) and the
`isAvailable` it sends (else the stored one). Removing the last photo and sending
`isAvailable: false` in the same request is allowed. Turning off is always allowed. The
photo check runs before the "needs a category" check; either can refuse. A combo removed
of its photo through the generic dish update (`PATCH /products/{id}`, `images: []`) gets the
combo code, picked by `combo` being set on the row.

**Create-time defaults.** A brand-new dish or combo can never have a photo yet (photos
are uploaded after create), so creation never produces an item that is on: an explicit
`isAvailable: true` is refused (the "turned on" row above), and leaving `isAvailable` out
creates it **off** (it used to default to on when the dish had a category). A combo `PUT` that
leaves `isAvailable` out keeps the stored value (it used to mean "on").

**Bulk and automatic paths (checked 2026-11-26).** Nothing else can turn an item on:
the only writers of a product's `isAvailable` are create, update, availability and the
combo create/update above. The admin's JSON dish import calls `createProduct` per row,
so imported dishes arrive off. Order, category, option-group (ref clean-up), tax-class
bulk-apply, shop restore and wind-down writes copy the product unchanged or delete it;
option-level `setOptionAvailability` switches an option, not a dish. A product `schedule`
is only an offer price and times; it never touches `isAvailable`. **Existing data:** rows
saved before this rule may be on with no photo; they stay as they are (the storefront
shows what is stored), but any edit that would keep them on is refused until a photo is
added or the item is turned off.

One per dish, one per option, a logo and a cover per restaurant. **Accept
anything up to 10 MB; auto-orient, resize and re-encode on upload**, with an
in-browser crop to a fixed ratio the owner can adjust. Storage is not gated by
tier. Owners will not produce correctly-sized images and should not have to.

**The server normalises every cover and dish upload** (built 2026-11-13): it
decodes by the file's real content (JPEG, PNG, WebP, GIF, TIFF, AVIF; HEIC/HEIF,
SVG and anything undecodable are refused), applies the EXIF orientation,
centre-crops to the exact stored size (§16), re-encodes in the declared format
and drops all metadata, including GPS. The minimum source size is judged after
orientation. The upload link still issues only JPG, PNG and WebP; accepting
other declared types is a product decision, not made. **The logo** (built
2026-11-15) gets the same 10 MB cap, JPG/PNG/WebP type check and decode, EXIF
orientation and metadata drop, but is never cropped: it is shrunk to fit inside
640 x 96 px (2x its §16 display box), never upscaled, with no minimum size.

**Uploads go browser → blob storage directly.** Dish photos, shop logos and shop
cover images are uploaded straight from the browser to Azure Blob Storage with a
short-lived SAS link the backend generates; the backend never proxies the image
bytes. Two things follow, and a missing one blocks uploads in the browser:

1. The storage account's CORS rules must list every front-end origin that
   uploads: the three deployed static apps, plus `http://localhost:5174` (admin)
   and `http://localhost:5175` (superadmin) in **dev only** (declared in
   `infra/main.bicep`, `env == 'dev'`). Production has no localhost origin in
   storage CORS, ever.
2. Every uploading front-end's CSP `connect-src` must include the storage blob
   host (`https://*.blob.core.windows.net`).

The fixed local dev port map is: storefront **5173**, admin **5174**,
superadmin **5175**, backend (Azure Functions) **7071**; port 5176 is retired.
Admin and superadmin must therefore run on exactly 5174 and 5175 (Vite
`strictPort`): those are the only local origins allowlisted for direct blob
uploads in the dev storage CORS rule. The storefront (5173) does no direct blob
uploads, so `http://localhost:5173` is deliberately not in that list.

### Where a dish lives

A product belongs to exactly one shop — never to a user — and carries its own
variants, extras, media, tags and allergen data. There is no separate
shop-to-product mapping: availability, price and ordering are edited on the dish
itself. Categories are per shop and flat (no nesting). Every stored document shares
one base contract (optional tenant marker, tags, metadata, version, soft
deletion via `archivedAt`/`isDeleted`), so backups, analytics and compliance
exports work the same across containers. Records are soft-deleted, never
destroyed. A soft-deleted dish is **not found** to every write — update,
availability and delete each answer `NOT_FOUND` rather than silently editing or
re-flagging it — while `findProductById` itself stays unfiltered so the combo
and pricing paths can still tell a missing dish from a deleted one.

### Menu content is typed by hand, or bulk-imported from JSON

No import from photos or competitor exports in v1; the model must not preclude
one.

The admin has one bulk path: Products page → "Import Products" → upload a JSON
array of `{ name, description, price }`. `name` and `description` are strings
(`description` may be empty); `price` is a plain number in the shop's major
currency unit (`12.5`) and is converted to cents on create. Photos are never
imported: any `image_url` is ignored and the photo is added afterwards in the
dish editor.

The modal offers a downloadable example file (`dishes-import-example.json`) so
a user starts from a working template.

Clicking the dimmed backdrop outside the dialog or pressing Escape closes the
modal, same as the close button. Both are ignored while an import is running.
On the preview step (parsed rows not yet imported) they ask for confirmation
before discarding.

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
delivery. An uncollected `READY` order auto-completes by age — **4 hours after
its promised time**, not at end of day.

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
directly (Connect direct charges; the restaurant is the merchant) without a
manual approval these platforms don't get. Later options: ask Stripe anyway, or
a separate PayPal integration — a second payment provider, so more work. **There is no pay in person** — the earlier
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

### When the platform's own Stripe key is unusable

One platform key serves every restaurant's captures. If it is expired, revoked
or missing a permission, taking the money fails for everybody — a fault of the
platform, not of the diner's card. **Such an order is held, not rejected:** it
stays `PLACED` with a marker, the capture is retried every minute (auto-accept
shops) or staff can press Accept, and the first successful accept clears the
marker. The wait is bounded by the shop's own decline timeout (§5): at that time
the order is rejected with the reason `payment_unavailable`, the reservation is
released, the diner gets a non-blaming email, and the rejection is **not**
counted as a missed order, so no restaurant is auto-paused by a platform fault.
An order past that time cannot be accepted; the diner must re-order. **A real
card decline is unaffected** — it still rejects at once with `payment_failed`.
The diner's order page carries a "payment held" flag only while the order is
still `PLACED` and marked. The failure raises a platform alert (a log line every
time, and an email to the platform alert address at most once per 15 minutes per
process), and every failed Stripe call on a money path logs whether it was a
permission/config fault, a card decline or a transient outage. Only a restricted
live key (`rk_live_…`) is ever used on the platform account, never the account's
secret key. Because Stripe refuses payment-method-domain registration to
restricted keys, **Apple Pay / Google Pay domains are not registered
automatically** in production: registration is best-effort, fails harmlessly,
and wallets need the domain registered per connected account in the Stripe
dashboard (a product decision, not yet taken).

### The restricted key's permission list

The platform account is driven by one **restricted** live key (`rk_live_…`), created in the Stripe
dashboard with exactly the permissions below and nothing more. The list is derived from the project's
own Stripe SDK calls (Stripe's documented way: map each call to a Dashboard permission). The Connect
resources must have their **connected-accounts** permission enabled, because the payment, refund and
account calls run with the restaurant's account (`Stripe-Account`).

| What the code does | Stripe call | Permission in the Dashboard |
|---|---|---|
| Reserve the money at checkout (direct charge on the restaurant's account) | `paymentIntents.create` with `Stripe-Account` | Payment Intents: Write (for connected accounts) |
| Read a payment (reconcile, verify a capture) | `paymentIntents.retrieve` | Payment Intents: Read (for connected accounts) |
| Read the charge behind a payment (`expand: ['latest_charge']`) | `charges` via expand | Charges: Read (for connected accounts) |
| Take the money on accept | `paymentIntents.capture` | Payment Intents: Write (for connected accounts) |
| Release the hold on reject | `paymentIntents.cancel` | Payment Intents: Write (for connected accounts) |
| Refund an order | `refunds.create` with `Stripe-Account` | Charges: Write (for connected accounts) |
| List a payment's refunds | `refunds.list` with `Stripe-Account` | Charges: Read (for connected accounts) |
| Create a restaurant's connected account during onboarding | `accounts.create` | Connected Accounts: Write |
| Read a connected account's status | `accounts.retrieve` | Connected Accounts: Read |
| Embedded onboarding session | `accountSessions.create` | Account Sessions: Write |
| Start a subscription checkout | `checkout.sessions.create` | Checkout Sessions: Write |
| Read a checkout session (confirm the subscription) | `checkout.sessions.retrieve` | Checkout Sessions: Read |
| Read a subscription (current period, price) | `subscriptions.retrieve` | Subscriptions: Read |
| Change, cancel, resume or schedule a subscription | `subscriptions.update`, `subscriptions.cancel` | Subscriptions: Write |
| Pay an open invoice (retry a failed payment) | `invoices.pay` | Invoices: Write |
| Open the billing portal | `billingPortal.sessions.create` | Customer portal: Write |
| **Not granted —** register the wallet domain | `paymentMethodDomains.list` / `.create` | none. Stripe refuses this endpoint to restricted keys by design, so it is deliberately omitted; the code skips it for restricted keys. |
| **Not needed —** verify a webhook signature | `webhooks.constructEvent` | none. It uses the endpoint signing secret, not the API key. |

Every call above is issued on the **platform account**, but the Connect ones are scoped to the
restaurant's connected account, so enable the connected-accounts permission for Payment Intents, Charges,
Connected Accounts and Account Sessions. When the key is created, cross-check this list against the key's
**request log** in the Dashboard (Developers → API keys → the key → View request logs): a `403` on any
call means a permission is missing, and never-used permissions can be removed.

### Direct charges, zero fee

Stripe Connect direct charges into the restaurant's own connected account. The
existing code already has embedded onboarding, an account-session flow, and
both the platform and the Connect webhooks. Each restaurant's Stripe account
is created in the restaurant's own country — a German restaurant gets a German
account in euros — whatever country the platform itself is registered in.

### No tips

Removed from scope outright (§22): a tip taken at checkout lands in the
restaurant's account as business income, and getting it to staff means payroll.

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

### Shops per owner

> **Built:** the shop-count limit is enforced when a shop is created.

Every owner account may own up to a number of shops. The default is **3**.

**Effective limit** = the owner's own `maxShops` if it is set (not null), else
the global `maxShopsDefault` (stored in system config, default 3).

- **Per-owner override:** superadmin `PATCH /platform/users/{userId}/limits`
  with body `{ "maxShops": <integer >= -1> | null }`. `-1` means unlimited (the
  shop-count check is skipped); `null` means follow the global default. Any
  other value (non-integer, below -1, not a number) is rejected with
  `INVALID_INPUT` and nothing changes.
- **Global default:** `maxShopsDefault`, changed by superadmin
  `PATCH /platform/config`. It must be an integer **>= 1**. `-1` is **not**
  accepted globally; unlimited exists per owner only.

**What counts.** The rule is the same when creating a shop and in
`GET /platform/owners` (both use `findOwnedShopIds`): a shop counts if it is
not deleted (`isDeleted = false`) **and** the owner has an active
(`isActive = true`) membership with role `owner` on it. Shop status does not
matter: live, paused, auto-paused and superadmin-suspended shops all count.
Deleted shops never count.

Platform staff (superadmin) are exempt from the check. If the system-config
read fails during shop creation, the check fails open to a default of 3.

**Lowering a limit never deletes, pauses or disables any existing shop.** It
only blocks creating new shops until the owner's count is under the limit.

This shop-count limit is separate from the monthly order limit earlier in this
section: "Superadmin can override any limit per restaurant" refers to order
limits, not shop count.

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
price and rate, totals, invoice number, date, the buyer's name and address,
the Stripe payment-intent id, and the **template version** — is copied into
one record that never changes. The PDF is rendered from it whenever asked.
Old template versions stay in the code so a 2026 receipt re-rendered in 2028
looks like a 2026 receipt.

Advantages over storing files: tiny, re-renderable in any language,
exportable as CSV for an accountant, searchable.

### Invoice language (reversed 2026-11-20)

- The snapshot's `language` is the **diner's page language at issue time**
  (`order.language`). An order with none (older orders) falls back to the
  shop's original menu language. This **reverses** the original design, where
  the shop's language decided; see §12.
- A **correction or cancellation always keeps the original invoice's
  language**. It is never re-evaluated from the order's current page language,
  so re-rendering an old document (monthly ZIP export, diner or staff
  download) is never affected by a later language change.
- **English invoices still print recognisable German legal terms**, for a
  German tax audit: "Steuernummer / Tax ID" and "USt-IdNr. / VAT ID" (always
  shown when set), and an English correction or cancellation is headed
  "Rechnungskorrektur / Invoice correction" or "Stornorechnung / Cancellation
  invoice" (German term first) — never "Gutschrift". A plain English invoice
  is headed "Invoice". Cross-references to other documents stay
  single-language. The footer is three columns wide, so the tax ids get their
  own column only while there is room, otherwise they are listed under the
  shortest existing column.
- **Money and dates are German-formatted on every `invoice-2026-11`
  document**, whatever the language: `29,80 €`, `20.11.2026`. Only the words
  are translated. (The frozen `receipt-2026-10` renderer is unchanged.)
- Labels are one branch per language in the renderer, so a third language is
  a new branch or translation entry, not a rewrite.

### Template versions: `receipt-2026-10` and `invoice-2026-11`

**Every new invoice and correction is stamped with the current template
version**, `invoice-2026-11` (the "Restaurant Ordering" design, built
2026-11-20) — a full redesign of the table, settlement and footer, not a
tweak:

- **Table:** columns are Pos. / Beschreibung / Menge / Einzelpreis / MwSt. /
  Betrag. Identical order-item rows (same dish, same modifiers, same rate,
  same unit price) are merged into one row with the quantity summed; the
  delivery-fee line and each dish of a combo are never merged.
- **Settlement:** one net line, one VAT line per rate, then a dark
  Gesamtbetrag/Korrekturbetrag bar, with a Bezahlt/Erstattet badge and the
  paid/refunded note (see below).
- **Footer:** three columns — managing director, commercial register, bank
  details — each omitted when empty, so a shop with none of the new legal
  extras (below) prints no fourth column at all.
- **Pagination:** a repeating header, a running "Seite X von Y" line, and the
  Einzelpreis column is dropped beyond 2 pages.
- The previous version, `receipt-2026-10`, keeps rendering unchanged — same
  code path, same layout — for every invoice snapshot already stamped with
  it. **Old template versions are never deleted from the code**: re-rendering
  an existing snapshot must reproduce the receipt exactly as issued, so a
  change to printed text or layout is always a new template version, never an
  edit to an old one (see below).

### The Stripe transaction id, on every invoice

**The Stripe payment-intent id is copied into the invoice snapshot at issue
time** (`payment.stripePaymentIntentId`) and printed inside the settlement
note — "Bezahlt am … per Online-Zahlung (Stripe, Transaktion pi_…)." on a
normal invoice, "Erstattet am … auf die ursprüngliche Zahlungsart (Stripe,
Transaktion pi_…)." on a correction — so the restaurant's own records and
Stripe's dashboard can be matched straight from the PDF, without opening
admin.

### Optional legal extras: Geschäftsführer, Amtsgericht/HRB, IBAN, BIC

Four further fields can be set on the Legal page, **independent of the
Impressum**: **Geschäftsführer** (managing director), **Amtsgericht + HRB
number** (an invoice-only register pair, separate from the Impressum's own
register fields), **IBAN** and **BIC**. All four are free text, optional, and
printed on the invoice only when set — an empty one adds nothing: no blank
label, no empty footer column. They print in the `invoice-2026-11` footer
only (the three-column layout above); `receipt-2026-10` ignores them, since a
re-rendered old snapshot predates their existence.

**They have no go-live effect.** They are not part of Impressum completeness,
the go-live checklist, or any §16 gate — a shop can go live, stay live, and
issue invoices with all four blank forever. They exist purely so a restaurant
that wants them on its invoice (bank details for a bank-transfer-minded
customer, a Geschäftsführer line some trade customers expect) can add them
without the Impressum's own fields having to carry invoice-only information.

**Kept for eight years** — the retention German tax law imposes on invoices
since 1 January 2025 (it was ten). The archive outlives the restaurant's account
and any customer anonymisation (§15): an invoice is a tax record the restaurant
is legally required to hold. Owners can download any invoice from admin, and a
month's invoices and correction invoices in one download: a ZIP of the PDFs
(`invoices-YYYY-MM.zip`, owner only) rendered from the snapshots, grouped by the
date each document was issued in the restaurant's local month, so a November
correction for an October order is in November's batch. The ZIP of the documents
was chosen over a CSV of the data: it replaces fetching the same single PDFs one
by one, and the receipt is the record to keep. Invoices and corrections are also
inside the owner's data export.

**Backup is not archive.** The database's 30-day point-in-time restore (§20)
does not satisfy the eight-year duty. Orders and invoice snapshots are
therefore also exported to a write-once archive store and verified against
checksums: a daily `archiveTimer` Function in the backend (02:17 UTC) writes a
timestamped JSONL + manifest archive of `orders` and `invoices` to the private
`records-archive` blob container, each run under its own prefix so no blob is
ever overwritten, then downloads it again and checks it against the manifest's
SHA-256 checksums and counts. The deployment identity carries Cosmos data read
(Built-in Data Reader on the app database) and blob write (Storage Blob Data
Owner), both from `infra/main.bicep`. The container's 2922-day (eight-year)
retention policy is still **unlocked**: the period is to be confirmed with a
tax adviser before that policy is locked, because locking is irreversible. Re-rendering an old invoice must not change its content: a change
to the invoice's printed text requires a new template version.

**Business buyers and e-invoices — parked (Manish, 2026-10-13).** Every buyer is
a private customer; there is no company-name / VAT-ID field and no XRechnung or
ZUGFeRD output. Revisit before the German B2B e-invoice duty (2027 for sellers
over €800k prior-year turnover, 2028 for all) or when a shop asks for
catering/office orders. Invoices of €250 or less are exempt (§27(38) UStG, §33
UStDV), which covers almost every takeaway order.

---

## 11. Accounts, roles and people

### Owners sign in with Entra; everyone else is local

- **Owners** register and sign in through **Microsoft Entra External ID**
  (self-service sign-up; the existing MSAL integration). Registration comes
  first; creating a restaurant is a separate step afterwards, which is what
  makes one identity holding several restaurants natural. **A restaurant has
  exactly one owner**, the person who created it (Manish, 2026-10-13): no
  co-owner invite and no superadmin "add owner"; helpers get a staff login with
  a role, so billing, Stripe and legal stay with one clear person.
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
orders, mark ready, turn dishes on/off, and **see full customer details on every
order** — name, email, phone, notes, billing and delivery address, on
collection, dine-in and delivery orders alike, so staff can call or hand off
correctly; still no prices, never reports, no refunds). This was decided
2026-11-21: staff always saw this in practice, so the restriction was corrected
in the spec, not the code. Multiple
people in each. **Manish defines what each role can do, globally, from
superadmin; owners cannot change it in v1.** The existing per-shop custom role
CRUD is removed. No Driver role until own-driver delivery has real users.

### Interface language is per person

Each account carries its own language (`'de' | 'en'`), stored on the account and used on every
device/sign-in — not a per-browser or per-device choice. A German owner and an English-speaking
manager work on the same restaurant in their own languages.

- **First sign-in** (no language stored yet): default to the browser's language if it's `de` or
  `en`; otherwise **fall back to the restaurant's language** (never a hard-coded `'en'`), derived
  from the shop's country the same way as the legal page (§15): `de` for `DE`/`AT`/`CH`, `en`
  otherwise. The chosen language is persisted back to the account immediately so it sticks for
  every later sign-in.
- **Every later sign-in**: the stored language wins outright; the browser's language is never
  consulted again.
- **Staff on a shared tablet**: logging in always applies that staff member's own language (by
  the same first-sign-in-then-persisted rule above), overriding whatever the previous person on
  that device left active.
- **Changing it**: either account can change its own language at any time from account settings;
  the change is saved immediately.

API shape, implemented end to end:
- **Owner** (`GET /users/me`, `PATCH /users/me/language`): `language?: 'de' | 'en'` (absent until
  chosen); `GET /users/me` additionally returns `restaurantLanguage?: 'de' | 'en'` — the language
  of the earliest shop this owner belongs to, absent for platform operators and for an owner with
  no shop yet. The frontend uses `restaurantLanguage` as the first-sign-in fallback.
- **Staff** (`GET /staff/me`, `PATCH /staff/me/language`, and the `POST /staff/login` result):
  `language: 'de' | 'en' | null` (null until chosen) plus `shopLanguage: 'de' | 'en'` — the
  shop's language, always present since a staff account always belongs to exactly one shop. The
  frontend uses `shopLanguage` as the first-sign-in fallback.
- Only two codes exist platform-wide (the same `MenuLanguage` type menus already use) — there is
  no separate "supported languages" list to keep in sync.

### Superadmin

Only Manish at first, with the full set: see everything, change subscriptions,
suspend a restaurant, edit a restaurant's content — **every use written to the
audit log and visible to that restaurant.** A superadmin permission model exists
from the start, everyone defaulting to full access, so an invited helper can be
restricted later without a rewrite. **Impersonating an owner is not offered**
(parked, §22). A per-owner `maxShops` override set here is durable: it survives the owner's own sign-ins and audited actions, not just the moment it was set.

- **Owners API (built):** `GET /platform/owners` (read level; any platform
  role) lists restaurant owners, paginated (`page` default 1, `pageSize` default
  20, max 100) and searchable by email or name. Owners with zero shops are
  included. Each row: `userId`, `email`, `name`, `maxShops` (null = follows the
  global default), `effectiveLimit`, `shopCount`.
- **Owners page in superadmin (built):** route `owners`, reachable from the
  sidebar nav. Server-paginated, debounced-search table of owners (email/name),
  showing `maxShops`, `effectiveLimit`, `shopCount`, and an "At limit" badge
  when `shopCount >= effectiveLimit` (never shown when `effectiveLimit` is
  unlimited). A "Default max shops" card on the page reads and writes the
  global default (integer ≥ 1; -1/unlimited is not offered for the global
  default). Per-row "Edit shop limit" dialog offers **Use global default**
  (clears the override, i.e. sends `maxShops: null`), **Unlimited** (`-1`), or
  **Custom** (integer ≥ 1); it shows the current global default inline and, if
  the chosen limit is below the owner's current `shopCount`, a note that this
  never deletes or disables existing shops — it only blocks new ones. Invalid
  values are rejected client-side before any request is sent.
- **Audit entries (built):** every change writes an audit entry with shopId
  `platform` and actorType `superadmin`. A per-owner change is action
  `user.limits.update`, entityType `user`, change field `maxShops` (from/to). A
  global default change is action `config.maxShopsDefault.update`, entityType
  `systemConfig`, entityId `global`.
- Lowering a limit below the owner's current shop count never deletes or
  disables shops (§9).

**Who counts as platform staff is decided by where the identity comes from.**
The API trusts two token issuers and they mean different things: the **customer
tenant** (Entra External ID) signs in restaurant owners and grants normal
product access; a separate **workforce tenant** signs in the platform's own
operators and is the only route to the superadmin console. Every token is
checked for signature, issuer, audience and expiry; the workforce issuer is
optional per environment (an environment without it simply accepts customer
tokens). The API accepts only v2.0 access tokens, deliberately — accepting
the v1.0 form too would mean trusting every tenant's `sts.windows.net` URL. A
customer-tenant token can never buy platform access by claiming a platform
role, and there is no database flag that makes anyone a platform operator (the
old `systemRole: 'superadmin'` route for customer tokens was removed
2026-11-10). **Granting and revoking is an Entra app-role assignment** — never a
row in our database — so it is auditable and takes effect on the operator's next
token refresh. Each environment (dev, prod) has its own pair of app
registrations, so a dev operator's token is not valid against prod.

| Role | Level | Reaches |
|---|---|---|
| `Platform.Owner`, `Platform.Support` | write | every platform endpoint |
| `Platform.ReadOnly` | read | only handlers that opt in to read access |
| none, other, or a customer-tenant token | — | nothing |

**Write is the default.** Anything that may change something refuses ReadOnly
until someone deliberately opts it in; a handler opts in only if it changes
nothing, whoever the caller is — a covered read must never lazily create,
back-fill or sync a record. Read-level: the platform lists (shops, plans, plan
pricing, usage, rejection watch, system config, role permissions, platform legal
identity, "me") and shop-scoped reads of a single shop (shop, products,
categories, orders, queue, order documents, order limit, subscription, audit
entries, sales report, staff list, shop legal, promotions, combos). Any caller
reading a shop's subscription gets the derived default plan without it being
stored. **Deliberately not read-level:** the go-live status check (it syncs
Stripe and patches the shop) and the owner data export (it exports customer
personal data and writes an audit entry). The API returns the operator's level
so a console can hide write controls; the API enforces it regardless.

### Who may call what

Every HTTP operation checks authorisation itself — the host gates nothing. Each
operation has an authorizer or a stated reason for having none.

- **Public on purpose:** the public shop list and shop-by-slug, the legal pages
  (shop, platform, DPA), the diner catalogue (refuses deleted or offline shops),
  reference lists by country, price quote, diner checkout, staff login
  (credentials), and the two Stripe webhooks (signature-verified before any
  work). The three diner order-page routes are authorised by the order's secret
  access token.
- **Closed, because the data is not public:** a payment-intent lookup requires
  `view_orders` on the order's shop (a PaymentIntent id is not a secret and the
  response carries the diner's name; the route is kept only so the published
  contract does not change); a shop's product list requires `manage_menu`; a
  single product and a shop's categories require membership of that shop (owner
  or its own active staff) or a platform operator — plain staff keep access
  because the order screens need dish names.
- **Kitchen writes are gated by `view_orders`:** accept, reject, ready,
  dispatch, complete and busy mode. There is deliberately no `manage_orders`
  permission: the plain staff role's default is exactly `view_orders`, running
  the kitchen is the job of the role that sees the orders, and a separate write
  permission would either lock plain staff out or be granted to every role that
  already has `view_orders`. Money movement is separate (`refund_orders`).
  Revisit only if a role should see orders but not act on them.

### Audit log

**Append-only, permanent, no edit or delete path in any app.** Present in admin
(the restaurant's own history) and superadmin (everything). Records who, what,
which restaurant, when. **Entries hold identifiers and actions, never personal
content** — "user a7f3 refunded order 1042", not names or addresses — so a GDPR
erasure can blank the identity table while the trail stays intact and true.
The existing entry's TTL (self-deleting) and `actorEmail`/`actorName` fields
are removed.

The admin Activity page can filter the log by **area** and by **who** (actor),
server-side. Filters combine, `total` and pagination reflect the filtered set,
and with no filter the result is identical to before. The area is derived from
the action rather than stored on the entry, so it cannot drift from the entries
it labels: `menu`, `orders`, `shop`, `discounts`, `staff`, `subscription`. Every
action the backend writes is mapped to exactly one of them in
`src/domain/audit/auditAreas.ts` (the source of truth; a test fails when a new
action is left unmapped). The actor filter accepts `actorType:actorId` for one
specific person, or a bare `actorType` for Platform/System. The "Who" dropdown is
served from a cheap `DISTINCT` projection over `actorType`/`actorId`, not by
reading every log entry, to keep Cosmos RU cost down.

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
**shows its original text**.
Nothing is ever hidden from a customer because of missing data entry.

**What carries translations, and in what shape.** Every restaurant-typed menu
text can be translated, and the translations are stored as a map of language
code → string: `nameTranslations` and `descriptionTranslations` on a dish,
`offerLabelTranslations` on a dish window's offer label, `nameTranslations` on a
size, extra, option or category, and both on a combo. Each translation is
capped: 120 characters for a dish, size, extra, option or category name, 2,000
for a dish or combo description, 60 for a combo's choice-step name, 50 for an
offer label. The map is read only where the shop's menu offers that language; a
field the shop has not translated returns the original text, as above.

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
- **Invoices and corrections are issued in the diner's page language**
  (Manish, 2026-11-20 — reverses the earlier "shop's original language" rule
  of 2026-10-10). The diner reads the invoice, and consumer platforms issue
  receipts in the customer's language. An order with no page language
  (older orders) falls back to the shop's original language. A correction
  always keeps the ORIGINAL invoice's language, even if the diner's page
  language changed since — it is the same document family (§10). German
  legal terms stay printed on English invoices too, for a German tax audit
  (§10).
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
  row carrying an effective-from date (§2). Germany has three classes — *Food*
  7%, *Beverage* 19% and *Delivery* 19% (the delivery fee's own class). Food and
  Beverage are identical across all three fulfilment modes; no beverage gets the
  reduced rate.

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

The public legal-pack endpoint (`GET /api/shops/slug/{slug}/legal`) returns
**200 for any shop that exists, even one with no legal data yet** — impressum,
terms, withdrawal and privacy notice are then `null`. 404 is reserved for an
unknown shop slug. A retired slug (§16's rename flow) resolves the legal pack
the same way it resolves the shop page: to the shop's current record, returning
its current slug.

- **Frontend:** a failed or empty legal-pack fetch never renders "restaurant
  not found" — that page is reserved for an unresolvable shop slug. A missing
  individual document shows "This restaurant has not published this page yet."
  The storefront footer's "Ordering by <platform>" line uses the platform-wide
  legal identity endpoint (`GET /api/legal/platform`), not the per-shop legal
  pack, so legal data is only fetched where it's actually needed (the legal
  pages and checkout).

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

**As built in t_f66b62b5 (admin Legal page redesign):**

- The admin Legal page shows a **go-live summary** at the top: "N of 5 required
  items complete" (DPA, Impressum, Terms, Withdrawal policy, Privacy notice),
  with the missing ones linking straight to their section. All complete shows
  "Ready to go live".
- The page shows **one section at a time** via a left-hand nav (persisted in
  the URL as `?section=`), each item carrying a live status line (e.g.
  "Accepted 12 Jan 2026, version 2", "2 fields missing", "IBAN set"). Invoice
  details is optional and never shown as incomplete; required items and the
  go-live gating rule (§16) are unchanged.
- **Erasure confirmation** is typed, not a browser dialog: the owner must type
  the customer's email again in an inline panel before the anonymise button
  enables, replacing the old `window.confirm`.

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
  - **What "storefront and menu deleted" covers** (wind-down completeness,
    2026-11-16): the **images go too** — every blob under `shops/{shopId}/` in
    the `product-media` container (product media, cover and logo), so storage
    stops billing and "menu deleted" is not a half-truth. The shop's **staff
    logins are hard-deleted** (`staff_accounts`): usernames and password hashes
    are the last shop-scoped personal data, so they are **erased, not
    anonymised**; deleting the row (not anonymising in place) is also what frees
    the `/username` unique key. **Commercial records are kept** — promotions,
    `shop_subscriptions` and `shop_usage` are not personal data and the
    wind-down does not touch them. `checkout_sessions` are left alone;
    unfinished checkouts self-clean on the container's 3600-second TTL. Shops
    soft-deleted before `deletedAt` existed are **not backfilled**:
    `isDueForWindDown` keeps failing safe for them.
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
  on the invoice and never in the activity log.** A daily timer
  (`deliveryAddressRetention`) blanks it **180 days** after the order is placed
  (confirmed by the owner 2026-11-19); it clears that one field only and never
  writes `anonymisedAt`.
- **Erasure also removes the kitchen notes** on that customer's orders; the
  personal fields are anonymised and the order itself stays for the restaurant's
  records.
- **Any restaurant leaving for any reason — including suspension — can export
  its menu, orders and customer list first.**

### Processor duties and hosting duties, designed in

- **Security:** encryption at rest and in transit, access control, a breach
  procedure with the 72-hour clock, instructions-only handling written into the
  DPA.
- **Two obligations written now, not at go-live** (both still **draft — not
  lawyer-reviewed**, owner Manish):
  - **Breach procedure.** As processor the platform must tell each affected
    restaurant "without undue delay"; the restaurant, as controller, has 72 hours
    from becoming aware to notify its data-protection authority, so every hour
    the platform spends improvising comes out of the restaurant's clock. Anyone
    who suspects a breach tells Manish at once. Manish decides (a named deputy is
    still to be appointed): is personal data involved, was it lost, altered,
    disclosed or accessed without permission, is it still happening — and if so
    contain first (revoke keys, disable the endpoint, rotate secrets). Affected
    restaurants are identified from the shop id on orders and the audit log, and
    each owner gets a notice saying what happened, which data, what was done and
    what they must do; the EU representative is told too. **Every incident is
    logged, including ones judged not reportable** (dates, what happened, data and
    restaurants affected, the decision and why, actions, closure), kept at least
    as long as the retention in the record of processing; afterwards the cause is
    fixed and the procedure updated.
  - **Record of processing (Article 30).** The platform is processor; each
    restaurant (named in its Impressum) is controller; the EU representative
    holds a copy. Processed: diner name, email and phone, order contents, totals,
    payment method and status, optional kitchen notes (not meant for health
    data); owner sign-in identity and email; staff names and sign-in details.
    Card, Apple Pay and Google Pay data is processed by Stripe as independent
    controller and never passes through the platform. Sub-processors, all
    Microsoft Ireland Operations Ltd. in the EU: Azure (hosting, database, files),
    Entra External ID (owner sign-in) and Communication Services (order email).
    Location: the dev environment is West Europe, production Germany West Central
    (§20) — the record must say which before go-live. Security measures:
    encryption in transit and at rest; owners reach only their own restaurants,
    staff are limited by role, platform admin is limited to superadmins; every
    change to legal settings, exports and erasures is audit-logged with no
    personal content; instructions-only handling under the DPA. The record is
    reviewed when a sub-processor changes, a new kind of data is processed, and at
    least yearly.
- **Notice-and-action:** a reachable way to report illegal content on a
  storefront, a recorded decision, and the suspend switch — the EU hosting
  liability shield depends on acting once notified.
  Built (mini-slice before slice 6): a public `POST /shops/{shopId}/content-reports`
  (anonymous; returns a receipt id as the acknowledgement of receipt) writes a record
  to the `content_reports` container; platform staff read them with
  `GET /platform/content-reports` and record the decision once with
  `POST /platform/content-reports/{reportId}/decision`, which is audit-logged
  (`content_report.decided`). The suspend switch is the existing
  `POST /shops/{shopId}/superadmin-offline`.

### Cookies

**No non-essential cookies, no banner.** Session, basket and table code are
strictly necessary; Entra's authentication cookies are exempt; analytics come
from the platform's own order data. A restaurant wanting its own advertising
pixel is a later opt-in that switches a banner on for that storefront only.

---

## 16. Storefront, URL and going live

### URL

`<domain>/shops/<slug>` (the `/shops/` prefix is fine — Manish, 2026-09-30; e.g. Ma Pasta is `/shops/ma-pasta`). **The owner types the slug at restaurant creation with a
live availability check, first-come-first-served.** It is **changeable only by
asking Manish**, and the old slug redirects permanently — the existing
request-and-approve rename flow implements exactly this. Custom domains: never.

What is built: `GET /shops/slug-available/{slug}` (anonymous, same trust level as the
public slug lookup) answers `{ slug, available }` so the admin form can check live
while the owner types; an invalid slug is `INVALID_INPUT`. `POST /shops` takes an
optional `slug`, which is validated and checked again at submit (a taken or
malformed one is `INVALID_INPUT`); callers that send none still get one generated
from the name. A slug is ASCII only, matches `^[a-z0-9][a-z0-9-]{0,63}$` (at most 64
characters, starting with a letter or digit). A shop name is 3 to 80 characters, on
create and on rename. When generating from a name, German umlauts and ß are
transliterated (ä→ae, ß→ss) and other Latin diacritics stripped (é→e). A name with
no Latin letters or digits (e.g. "寿司屋") generates nothing: the API refuses with a
clear error and never guesses, so the owner must type a slug; a rename request whose
name generates no slug is refused the same way. A generated slug is cut to 64 characters.

**What creating a restaurant asks for.** The owner provides the shop name, the web
address (slug, with the live-availability check above, or left blank to generate one),
the country, and ticking acceptance of the current data processing agreement (§15).
There is no industry picker — the platform is restaurants only. `industry` remains an
optional, unused field on `POST /shops` for backward compatibility with older clients;
it is no longer collected or shown anywhere, and existing shops keep whatever value
they already have stored.

The root domain is the sales site. Storefronts carry **`noindex`**; no SEO
work. One exception that is not SEO: a page title and a **link-preview card**
(image, name, one line) injected into the storefront's HTML shell by a small
Function, so a URL pasted into WhatsApp renders as a card and not a grey box.

**How the card and `noindex` work (built 2026-11-13 in the storefront repo;
live-verified on dev 2026-11-15 — the per-shop `<title>` on a full load is the
one remaining gap, ticketed).** Link-preview crawlers do not run JavaScript, so a
client-side hook alone cannot produce the card; the Function is the mechanism. It
also owns the `<title>` on a **first load** of a shop page — the shop name, so
the tab and the unfurl card say the same thing. A
small client hook owns the title on **in-app navigation** only (shop name only —
never the order id, token or any path text — reverting to the platform name on
non-shop routes); it leaves a first load's title alone because the Function
already set it.

- The Function is an SWA-managed function in the storefront repo, served for
  every `/shops/*` and `/legal/*` path (a rewrite, never a redirect), fetching the
  current HTML shell live — never a baked copy, whose asset hashes would go stale
  and leave diners an unstyled page.
- **`noindex` is derived from the path alone**, on every `/shops/*` and
  `/legal/*` response, unconditionally and before any backend call — so a backend
  outage can never strip it, and the diner's order-page URL (which carries the
  secret token in `?t=`) is never indexable. The front page `/` is routed through
  the Function too but is the exception: it **stays indexable** (it is the sales
  site) and serves a generic **platform** card — the route rule is path-exact
  `/`, never `/*` (which would swallow `/assets/*` and break the site).
- **Link-preview tags:** a shop card on exactly `/shops/<slug>` — title = shop
  name, description = name plus city (a fixed fallback string when there is no
  city, never empty, never "undefined"), image = hero, else logo, else a static
  raster card (social crawlers do not render SVG), always an absolute https
  URL, with the canonical URL; all values HTML-escaped. The front page `/` gets a
  generic **platform** card: `og:title` = the platform name (§15), a generic
  description, a static raster image, canonical URL = the bare origin — and no
  `noindex`. Checkout, order and legal pages get no card.
- **The `<title>` on a full load** (decided 2026-11-15): exactly one `<title>` in
  the head. On `/shops/<slug>` the Function sets it to the **shop name** — the
  same value as `og:title`, so the tab and the card agree — so a shared or
  refreshed link shows the restaurant's name, never the shipped fallback string.
  On `/` the title is the **platform name** (the client hook today; the Function's
  head injection once `/` is routed through it). If the shop read fails, the
  title stays the shipped fallback (the fail-open rule above); the client hook
  does not correct a first load, so nothing flickers after paint.
- **It fails open:** every failure (shop read slow or failing, shell fetch failing,
  malformed data) still answers **200** with `noindex` at the same URL — never a
  3xx (a redirect to `/index.html` would escape `noindex`) and never a 5xx; if both
  hops fail a self-contained minimal page is served that references no assets and
  never echoes the request path or query. Hops have hard timeouts (about 1 s for
  the shop read) so a hang can never block the SPA from loading; per-shop meta and
  the shell are cached on separate lifetimes, and one shop's card is never served
  for another. The Function trusts the original-URL header only when its host
  matches the host the request arrived on.
- Admin and superadmin carry `noindex` and a `robots.txt` as plain static files.
- The platform name shown in the browser tab of the front page should come from
  the platform legal identity (§15), not a hard-coded string; the platform's
  name, its domain, its operator's legal name and each restaurant's own legal
  name are four different things and are never forced to be one word.

### The LIVE toggle

Every restaurant has a switch. **Off** — the storefront shows the restaurant's
name and "not currently taking orders"; no menu, no basket; the link never
looks broken. **On** — refuses to switch unless the minimums exist: a shop
**name**, one published dish, **at least one category**, opening hours, one
fulfilment mode, a contact phone number, **a full address (street, town,
postcode and the country's state field where the country uses one)**, the legal
pages, a **connected Stripe account** (every order is paid online — §8), and a
**tax number or VAT ID** for its invoices (§10).
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
  missing staff): Settings → Shop status → "Accepting orders" switch (on =
  taking orders, off = paused; switching off asks how long), with an optional
  message for diners (`ordersPaused`, `ordersPausedMessage`). The menu
  stays visible; a popup says orders are paused and appears on every page load.
  At checkout, a paused shop shows a calm notice card in place of the details
  form, not a form error: "Ordering is paused", the owner's message or a generic
  one, the resume time for a timed pause, a "Back to menu" action and "Call us"
  when the shop has a phone. The diner's cart stays visible, but there is no
  retry button and no Pay button while paused. This covers the price quote's own
  `orderLimitReached` flag, a 409 `ORDERS_PAUSED` from quoting and the same
  refusal when the diner presses Pay: one state, one card. Genuine checkout
  failures (network, pricing unavailable, below minimum, invalid discount code)
  are unchanged. Reaching the monthly order limit, and auto-pause, show the same
  popup and card.
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
  - **Storefront signal:** while orders are paused the header shows a red
    "Ordering paused" badge in place of the open/closed status pill, in addition
    to the popup. There is no separate paused banner under the header; the badge
    and the popup are the only two signals. The owner's message and the timed
    pause's "we take orders again" time appear in the popup and the checkout
    notice card, not in the badge. This is the same whether the owner paused, the
    monthly order limit was reached or auto-pause fired: all three set
    `ordersPaused` and get the same badge.
- Closed outside opening hours keeps its own popup, shown once per visit.
- The "Accepting orders" switch is on the Settings page **and** in the sidebar
  (Manish, 2026-10-13), both using the same wording (on = taking orders, off =
  paused) and both asking for the duration when switched off. The online switch
  is on Settings and the Shops list, and the Shops list asks before taking a
  shop offline.

**Settings page layout (built 2026-11-26, rs-admin, t_fd82152e).** The owner
Settings screen is organised into seven sections, chosen one at a time from a
left nav (232 px on desktop; below `md` the nav becomes a horizontal scrolling
chip row above the content). The selection is kept in the URL as
`?section=<key>` (keys: `status`, `details`, `look`, `hours`, `orders`, `pay`,
`danger`), set with replace, not push; a missing or unknown key falls back to
Shop status. On desktop each nav item shows a live one-line status under its
title (the chip row shows titles only):

- **Shop status:** "Offline" / "Orders paused" / "Online, taking orders".
- **Details:** "<shop name> · /<slug>".
- **Look:** "Banner on" / "Banner off".
- **Hours and closures:** "N of 7 days open".
- **Orders:** "Auto-accept" / "Auto-accept at set times" / "Manual accept", with
  " · delivery" appended when delivery is on.
- **Payments and tax:** "Stripe connected", or the real Stripe state
  ("Stripe pending" / "Stripe not connected").
- **Danger zone:** no status line; its title is in the danger colour. It is
  listed only for the owner (`canDeleteShop`).

Only the active section's cards render. Cards in each section:

1. **Shop status:** "Shop online" switch card; "Accepting orders" switch card
   (see §16 above); "Storefront link" card (real storefront URL, Copy link).
2. **Details:** "Shop details" card (ID, slug, name with "Request name change",
   currency, time zone read-only; editable minimum order); "Address" card;
   "QR Code" card (preview, storefront URL, Download PNG).
3. **Look:** Logo; Cover image (with the "Show banner" switch); Accent colour;
   Menu languages.
4. **Hours and closures:** Opening hours; Closures.
5. **Orders:** Order alerts; Automatic acceptance; Kitchen timing; Orders for
   later; Delivery; Dine in.
6. **Payments and tax:** Payments; Tax classes.
7. **Danger zone:** Delete shop (inline confirm: type the shop name to enable
   the red Delete button, plus Cancel).

Save model. Each card keeps its own save button, spinner and inline error, as
before. There is no page-wide "unsaved changes" bar and no generic
leave-confirm. The switches for Shop online and Accepting orders act
immediately with no save step. "Accepting orders" is on = accepting, off =
paused, same wording as the sidebar status chip.

Tax classes card. Shown in Payments and tax. It lists the shop's active tax
classes with their rates from the country tax data. When the shop has no active
tax classes, it shows an empty-state note naming the country, with no rates
shown.

### Branding

**Logo, cover image and one accent colour, with an automatic contrast check**
so nobody ships pale-yellow buttons on white. **The logo is optional** (Manish,
2026-10-01): without one, the storefront shows the shop's first two letters
("MA" for Ma Pasta) on the accent colour, and going live never requires it. Nothing more: full theming is a
website builder and every storefront becomes a support surface. The existing
four-colour branding is reduced to one.

**Built so far (2026-10-06):** cover image upload in admin → Settings (upload,
preview, remove; JPG/PNG/WebP up to 10 MB; guidance for a ~3:1 banner); the
storefront ships its own default cover instead of loading Unsplash. Resize,
re-encode and orientation on upload are done server-side for cover and dish
photos (§6). A restaurant can set and remove a logo, and set and remove a cover.

**How banner and logo are shown (Manish, 2026-10-10, decided live in the UI;
merged to `dev` in storefront + admin, not yet pushed):**
- **Banner shape — fixed, cropped at upload** (Manish, 2026-10-11; replaces the
  2026-10-10 "always whole, blurred sides" rule; merged to `dev` in backend,
  admin and storefront, not yet pushed):
  - Stored size exactly **1920 × 640 (3:1)**. The owner crops in admin before upload, in a
    crop window with a fixed 3:1 frame, zoom, keyboard moves, desktop and phone previews, and
    the centre 2:1 dimmed-outside "Visible on phones" area. Sources under 1200 × 400 refused.
    Only the cropped JPEG is uploaded.
  - The backend normalises the upload to exactly this size (§6) and refuses a
    source below the minimum (`COVER_IMAGE_WRONG_SIZE`), deleting the upload and
    keeping the old cover.
  - Storefront: 2:1 full width on phones, 3:1 from tablet width up, at most page-content
    width, picture fills the box (cropped centre). No blurred backdrop. Old covers of other
    shapes still fill the box, centre-cropped; no migration.
- **Dish photos — same approach, 4:3** (same date and status): stored exactly
  **1200 × 900**, min source 800 × 600, cropped in the same crop window with a centre-square
  "Phone list" area; backend refuses others (`PRODUCT_IMAGE_WRONG_SIZE`). The dish popup
  shows the photo at 4:3. A combo also has an optional photo (needed only to turn it on), cropped and stored
4:3 like a dish (§6).
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
**subject starts with the restaurant's name**. **Diner emails** are sent with the
**restaurant's Impressum email as reply-to**, use the language the diner browsed
in and end with the restaurant's Impressum. **Staff emails** (escalation, limit
warnings) also carry the restaurant's name in the subject but are sent with **no
reply-to**. Without email configured, emails are written to the log only (kind
and order ref, never contents or addresses).

---

## 18. Growth features

All per restaurant, always — platform-wide value would make Manish a clearing
house between businesses.

- **Discount codes and promotions.** Per restaurant: percentage or fixed,
  optional minimum, dates, total limit and per-email limit (default 1; counted
  per customer e-mail address), on/off;
  not editable once made. One code per order; never off the delivery fee; at
  least €0.50 always charged. On the invoice each dish keeps its menu price and
  the discount is one "Rabatt CODE" line per VAT rate. *Built 8d (2026-10-09).*
  Offer prices (a dish's lunch price) were fixed separately on 2026-10-08.
- **Discounts page UI (admin → Menu → Discounts), redesigned 2026-11-26:** full-width
  page with a filterable code table, search, and a drawer for new codes. The page
  header spans the full content width and carries a "New code" button. It is
  disabled once the shop has 50 codes, with the reason "You've reached the limit of
  50 codes." There is no delete, so the page never says that switching a code off
  makes room.
  **Discount codes card:** title, a green "N active codes" count, and a right-aligned
  "N of 50 codes" count, then the helper line. Below it, status filter chips with
  live counts (All / Active / Not started / Expired or used up / Off) and a "Search
  codes" box that matches the code text (case-insensitive substring). Filter and
  search combine (AND) and run client-side over the codes already loaded.
  Codes render as a real table with columns Code, Discount, Min. order, Valid, Uses,
  Per customer, Status, On. On narrow screens the table scrolls inside the card; the
  page itself never scrolls sideways. Min. order shows "None" when zero. Valid shows
  "Always" when there is no date range, otherwise "From d" / "Until d" / "d – d".
  Uses shows "N of M" with a thin progress bar when there is a total-use limit,
  otherwise the count. Per customer shows "Unlimited" when there is no per-customer
  limit. The status badge uses the shared badge tokens: Active green, Not started
  amber, Off / Used up / Expired neutral. Rows that are neither Active nor Not
  started use the muted text colour, not reduced opacity, to keep AA contrast. Each
  On switch is labelled "Switch on/off CODE", shows a spinner while pending, and
  rolls back on error.
  If no code matches the filter and search, the table shows "No codes match this
  filter." A shop with no codes at all keeps the "No codes yet." empty state with
  its own "New code" button. The footer reads "Up to 50 codes."; at the limit it
  shows the "limit of 50 codes" line above. That is the only explanation of why
  "New code" is disabled.
  **New code** opens a right-hand drawer (a modal dialog), not an inline form. Esc,
  the close button, and Cancel close it; focus is trapped inside and returns to the
  trigger. Fields, validation and submit are unchanged: Code, Percentage / Fixed
  amount pills, value, optional minimum order (with the €0.50 minimum-charge note),
  optional first and last day, optional total uses, and uses per customer (default
  1). "Create code" and "Cancel" sit in a footer pinned to the bottom of the drawer.
  If the form has unsaved input, closing asks for confirmation before discarding.
  **Loyalty vouchers card:** the on/off switch sits in the card header with a one-line
  status ("On, earns €X every N orders." / "Off."), and the fields are hidden while
  off. The consent note ("Vouchers are only emailed to diners who tick an unticked
  consent box at checkout — never sent without it.") is always visible, whether
  loyalty is on or off.
  No change to any validation, limit, or API behaviour — layout and copy only.
- **Loyalty as emailed single-use vouchers.** No balance, no account: the
  restaurant sets a rule ("every 5th order earns €5 off"), the platform counts
  accepted orders against the customer's email, and when they qualify it emails
  an expiring single-use `L-` code. The code only reaches the real mailbox.
  **A voucher email is advertising (BGH VI ZR 225/17), so it needs consent: an
  unticked box at checkout, and only ticked orders get the email.** *Built 8d
  (2026-10-09).* Why: [[discount-codes-and-loyalty-vouchers]].
- **Multi-location dashboard** for owners with several restaurants — the owner
  **Overview** after sign-in: today's takings and orders, waiting orders, and
  each restaurant's month against its own limit. Owners only. *Built 8f.* As of
  2026-11-25 (Manish's decision) `/` no longer routes to this Overview — it
  redirects to `/shops` (the shops list) — and the Overview page component is
  left unrouted at `src/pages/DashboardPage.tsx` pending a separate decision on
  deleting it.
- **Owner's order app** — a phone-shaped page for managing orders: `/phone`,
  the board one column at a time, installable to the home screen, for anyone
  who sees orders. *Built 8f.*
- **Naming: "Overview" vs "Dashboard" (decided 2026-11-23, reversed 2026-11-26).** The
  account-level `/` is no longer an Overview landing page: it redirects to `/shops`. The
  Overview page itself (still called "Overview" in its own UI, just unrouted) is currently
  reachable nowhere. The per-shop sidebar top item (`ReportsPage.tsx`) is renamed back from
  "Reports" to **"Dashboard"** and is now the shop's default landing page, routed at
  `/shops/:id/dashboard` (`/shops/:id/reports` redirects there for old bookmarks). i18n key
  `nav.dashboard` in `common.json` (already present) is used instead of `nav.reports`; the
  page's own `reports.title` locale value is now "Dashboard".
- **Per-shop sidebar order (decided 2026-11-26):** Dashboard (ungrouped, first, default landing) →
  Service: Orders → Menu: Dishes, Combos, Categories, Option groups, Discounts → Shop: Tables & QR
  codes, Legal → Business: Subscription, Staff, Activity → Settings (ungrouped, last, no group
  header — same visual pattern as Dashboard). Every sidebar item has a `lucide-react` icon. Settings'
  permission rule (`manage_shop`) is unchanged; it simply moved out of the Shop group to a trailing
  position.
- **Reports, v1 set:** daily takings, orders by hour, top dishes, collection vs
  delivery vs dine-in split, month-to-date orders against the limit, VAT per
  rate, CSV. "Professional but not everything." An order counts on the day it
  was accepted (restaurant's time zone); a refund on the day it was made; VAT
  per rate matches the invoices and correction invoices to the cent. Owners
  and managers (`view_reports`), never staff. **One consolidated report, not
  five** (confirmed 2026-11-16): the audit's five separate reports were
  deliberately merged into this one report plus the owner Overview — they read
  from the same order data and an owner who wants takings, top dishes and VAT
  wants them together. Splitting them again needs a reason from a real owner.
  *Built 8f (2026-10-09,
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

Tailwind 4 is already in use in all four apps. The React-hooks lint plugin is at
7.x in admin and superadmin; the storefront stays on 5.x until this design pass,
because 7.x's compiler rules would fail its current clean lint gate.

Both the admin app (`rs-admin`) and the storefront (`rs-storefront`) use
self-hosted Roboto (via `@fontsource/roboto`) for all text, page titles included.
Titles were previously set in Fraunces Variable in both apps; both have now moved
to Roboto throughout, so there is no remaining visual distinction between the two
on fonts. No third-party font requests are made: the font files are bundled by Vite
and served from each app's own origin, so each app's CSP `font-src 'self' data:`
is unaffected.

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

  ⛔ The product has its own Stripe **test** sandbox (since 2026-10-06), but its
  own **live** account is not yet set up. No real payment can be taken until it
  is. The backend's Stripe library is on **major 23** (since 2026-11-15, tested
  against the dev sandbox); it is no longer held at 20. The storefront's Stripe
  packages follow the backend's bump, never precede it.
- **Same Azure subscription, its own resource group**, EU region.
- **The dev environment was recreated in `westeurope`** on 2026-09-23 under
  `restaurant-ordering-*` names, replacing one that sat in `australiaeast` and
  `eastasia`. Three Static Web Apps and a Flex Consumption Functions app, all
  deployed by GitHub Actions using stable secret names.
- **`infra/main.bicep`** in the backend repo describes one environment, so a
  second is one command; it is parameterised (function app, storage and Cosmos
  names, backup tier, log workspace, blob soft-delete, GitHub federated
  credential) and production has its own parameter file with no secrets. The old
  `australiaeast`/`eastasia` resource groups still exist and are Manish's to
  delete.
- **Dev data was wiped and reseeded for Germany** (currency EUR, Europe/Berlin);
  the dependency upgrade was ticket zero, before any feature work.

### Production environment (decided 2026-11-10; nothing created yet)

Production mirrors dev one-for-one (same resource types and SKUs), with these
deliberate differences:

- **Region: Germany West Central** for compute, data and telemetry — a German
  product holding diners' personal data as processor for German restaurants. Dev
  stays in West Europe. Static Web Apps are in West Europe because the service
  is not offered in Germany West Central; they serve only static bundles and hold
  no diner data. All data, including backups, stays in the one region, which
  keeps the data-residency statement simple.
- **Own identities everywhere.** Its own deploy identity (a user-assigned managed
  identity with GitHub federated credentials for the `production` environment
  only, least-privilege on the prod app alone — never a second credential on the
  dev identity), its own workforce app registrations (§11), and its own
  customer-auth app registration, never dev's client id, because the API checks
  issuer and audience. **Open decision: whether production's customer-auth
  (External ID) tenant is shared with dev or separate** — copyshop uses separate
  tenants; sharing puts real owners next to test accounts and lets a dev-tenant
  mistake hit prod sign-in.
- **The database starts empty and the dev seed never runs against it** (the seed
  wipes containers and refuses any non-dev account). Before the first restaurant
  signs up, an operator provisions through the superadmin console: the three
  plans (§9), their euro pricing with the live Stripe price ids, the German
  reference lists saved once (so a future rate change is an attributed edit, not
  a deploy), the platform legal identity (without it no restaurant can go live),
  and a review of role permissions. Plans created this way get new ids; nothing
  may depend on dev's plan ids.
- **Payments:** live Stripe with a restricted key only (§8), two webhook
  endpoints (connected-account events and platform events) each with its own
  signing secret — mixing them up rejects every webhook, so a non-2xx-on-webhook
  alert exists in production.
- **Monitoring alerts:** prod must carry four Azure Monitor scheduled-query rules,
  all severity 1, `PT5M`/`PT5M`, firing on count `> 0` — non-2xx on
  `/api/webhooks/*`, Stripe credential failure (`kind=permission_or_config`),
  order-intake 5xx, and paid-without-order. The payloads live in `infra/alerts/`
  and are applied and read back with `scripts/alerts/apply-alerts.sh prod`. Every
  query filters on `cloud_RoleName == 'restaurant-ordering-system'`, which must
  equal the app name or the rule can never fire. Prod's Stripe rule matches the
  greppable `[stripe:failure] … kind=permission_or_config` line (the form dev
  already deploys, plus the role filter), not the app's own `[alert:platform]
  kind=stripe_permission_or_config` line. `ag-restaurant-prod-webhooks`
  (one email receiver) must exist first, because ARM rejects a rule pointing at
  a missing action group.
- **Hardening dev lacks:** HTTPS-only function app, 30-day blob soft-delete,
  Cosmos delete lock, Cosmos TLS 1.2, no localhost CORS origin.
- **Backups:** Cosmos **continuous 30-day point-in-time restore** (not periodic —
  periodic could lose up to four hours of orders), restored only into a new
  account, with a restore drill once after go-live and quarterly after. App
  settings are not backed up by Azure; their values live in the vault. This is
  not the eight-year invoice archive (§10) — that copy now exists separately:
  the daily `archiveTimer` Function exports `orders` + `invoices` to the private
  `records-archive` container (timestamped JSONL + manifest, verified against
  the manifest's SHA-256 checksums after upload), using the deployment
  identity's Cosmos data read and blob write. Still open: the 2922-day retention
  policy is unlocked. The Cosmos point-in-time restore drill **was run on
  2026-11-15** against the dev account `restaurant-ordering-system-db-dev`
  (continuous / `Continuous30Days`, serverless, West Europe): `az cosmosdb
  restore` into a temp account at `2026-11-15T08:25:00Z` finished `Succeeded`
  (`restoreMode: PointInTime`, whole command ≈19 min), and the restored data
  matched the source as of that timestamp — 527 documents across the 14 declared
  containers (plus an empty undeclared `items`), with the only source-side
  differences being documents written after 08:25Z. The temp account was deleted
  afterwards (`ResourceNotFound` confirmed) and the source account left
  untouched. Still owed: the same drill on the **production** account once it
  exists (only dev exists today).
- **Email:** without Azure Communication Services configured, order emails and
  invoice PDFs are only logged, never sent, and diners would receive nothing.
  Going live with real email is an explicit go-live decision, with the sending
  domain authenticated (SPF, DKIM, DMARC).
- **Idle cost is not zero:** the three timers (orders every minute, checkout
  reconciliation every two minutes, subscriptions hourly) bill a few dollars a
  month per environment and grow with the number of shops.
- **Secrets** are never echoed, logged, committed or kept in local settings; the
  function app's settings are written with output suppressed, and the platform
  secret for staff tokens is generated fresh per environment (changing it signs
  out every staff login).

### Release pipeline

**There is no `dev` branch in any of the four repos** (flow corrected
2026-11-15, card `t_0ba138d2`; `dev` removed 2026-11-19, card `t_3d37bfe7`).
`main` is the only integration branch in every repo, and a `main` push drives
both the dev deploy and the artifact `promote.yml` promotes:

- **`rs-backend` — `main` → dev environment → promote, same as the front-ends.**
  There is **no `dev` branch** on `origin`; `main` is the only integration
  branch. A `main` push builds, tests and deploys the dev Function App, and that
  same `main` run is the artifact `promote.yml` promotes to production.
- **`rs-admin`, `rs-superadmin`, `rs-storefront` — `main` → dev environment →
  promote.** There is no `dev` branch in these repos; `main` is their only
  integration branch. `azure-static-web-apps.yml` triggers on `push` and
  `pull_request` for `main` only and deploys that build to the dev Static Web
  App; `promote.yml` takes a successful `main` run of that workflow
  (`workflow_run`, `branches: [main]`) and rebuilds the commit for production
  behind the `production` environment's reviewer. The front-ends have no
  separate pre-`main` integration branch, and none is planned: `main` already
  deploys to the dev environment, so a second branch would add no safety.

For `rs-backend`, production receives the **same artifact dev built and tested**
for that commit (artifacts are kept 90 days, so an older commit cannot be
promoted — push a fresh one through dev). Promotion waits for the `production`
environment's required reviewer.
It **fails closed**: production reads its identity or deployment token
from a secret name that exists only on the production environment (the backend's
`AZURE_CLIENT_ID_PROD`, each front-end's deployment token), because GitHub falls
back to a repo-level secret of the same name and a same-name secret would
silently deploy as dev. Rollback after real data exists is re-promoting the
previous tag; **production is never torn down once it holds data**, since
deleting the Cosmos account destroys its continuous backups.

**Front-ends bake their configuration in at build time** (Vite inlines every
`VITE_*` value), so a front-end promoted unchanged from dev would call the dev
API with the test Stripe key. **No front-end is promoted to production until its
promote job rebuilds the tagged commit under the production environment's
variables.** Every variable a front-end reads must also be mapped in its
workflow's build step, or it silently becomes `undefined`.

### Dev-only test-clock routes

The backend exposes `POST /platform/test-clock/...` routes that advance the
platform clock in tests. They are registered **only** when the
`ENABLE_TEST_CLOCK_ROUTES` setting is `true`, so they never exist in production.

### Observability

No failure path is silent: every internal-error response and every swallowed
failure logs a line naming the handler or service, and a missing-configuration
failure logs the names of the missing settings, never their values.

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
   - **Branches and deploys** (Manish, 2026-10-01; flow corrected 2026-11-15,
     card `t_0ba138d2`; `dev` branch removed 2026-11-19, card `t_3d37bfe7`) —
     `main` is the only integration branch in **all four repos** and deploys to
     production via `promote.yml` (still to be enabled here). There is **no
     `dev` branch anywhere**: a `main` push deploys the dev environment (the dev
     Function App for the backend, the dev Static Web App for the three
     front-ends) and that same `main` run is what `promote.yml` can promote. See
     §20 "Release pipeline".
     No hand-deploys. No separate `test` branch for now.
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
     and minimum, the fee as its own invoice line at its own Delivery class
     (19 %), delivery address and phone for all order staff, "Out for delivery"
     → "Delivered" on the board.
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
   for future discussion. Reasons and trade-offs in §22.

**Start with the order model.** Everything in intake, scheduling, tax-by-mode
and reporting hangs off it, and every day it waits is another feature built
against the wrong shape.

---

## 22. Explicitly out of scope

Everything ruled out during the design interview of 2026-08-26/27 and later,
with the reason, so a parked idea is never thought through twice. If one comes
back, read the reason first — it usually still applies, and where it doesn't, the
reason says exactly what changed. **Later** = deliberately not in the first
releases and the design already accommodates it. **Never** = actively rejected;
bringing it back means undoing a decision something else depends on.

### Never — rejected on principle

- **Platform-wide customer accounts** (cross-restaurant order history). It would
  make Manish a data *controller* of diners' data, with his own privacy policy,
  erasure duties and liability, while he is in Australia with no EU
  establishment and wants to be processor only. Bringing it back is a legal
  decision (controller status, an EU-facing privacy policy, direct regulatory
  exposure), not a feature decision.
- **Customer accounts of any kind.** Guest checkout only; it removes passwords,
  resets, lockouts, account pages and a category of stored personal data. Order
  status and receipts reach the diner through the secret token link in their
  email; "remember my details" is browser-local; reordering is from a link in a
  past email; loyalty is emailed single-use vouchers, not a balance.
- **Platform-wide loyalty points** (earn at one restaurant, spend at another).
  Settling value between two businesses makes the platform a clearing house,
  breaking the rule that no customer money touches it. Loyalty is per
  restaurant, always.
- **Cross-restaurant shopping carts.** One payment split across Stripe accounts
  makes the platform a money transmitter. One restaurant per cart.
- **Custom sending domain for email.** One sending reputation to protect instead
  of hundreds, and restaurants that cannot configure DNS would never find out
  their confirmations were failing silently (§17).
- **Editing an order after it is placed.** It means recalculating totals,
  adjusting the payment and re-issuing the receipt for a diner who picked the
  wrong dish; cancellation until acceptance covers the real need (§7).
- **Dine-in "pay at the till" and running tabs.** A tab across orders, one bill,
  split payments — and probably German cash-register law (the certified security
  element and its record-keeping) once the platform records a dine-in sale.
  Table ordering is pay now, table attached (§3).
- **Tips / digital tipping.** A tip at checkout lands in the restaurant's account
  as business income rather than the tax-free cash gratuity an employee gets
  directly, and passing it to staff means payroll. A tax question shipped on for
  everybody becomes the platform's support burden.
- **Search-engine indexing and SEO features.** Storefronts carry `noindex`, no
  structured data, no per-restaurant switch: the storefront is a destination for
  people following the restaurant's own link and must not compete with its own
  website. Kept anyway, not as SEO: page title and link-preview card (§16).
- **Custom domains for storefronts.** Per-tenant DNS verification, certificates
  and routing for a cosmetic gain; the embed widget (below) would solve the same
  "look like my site" need better.
- **Hardware and adjacent products:** POS/till, self-order kiosks, digital menu
  boards, drive-thru, branded per-restaurant customer apps, driver apps with live
  tracking and route planning — each a hardware business in a software coat that
  would double the support burden for one customer segment.
- **Cash / pay-in-person.** Built 2026-10-02 and deliberately deleted 2026-10-05
  (§8); not a gap.
- **A second owner per restaurant** (§11).

### Later — designed for, not yet built

- **Embedded ordering widget** (a snippet for the restaurant's own website). Out
  of scope for now (Manish, 2026-10-09), kept as a topic for future discussion.
  It mostly wins restaurants that already have a website, while the first release
  targets small restaurants for whom a plain "Order online" link does the job;
  it also brings Safari's blocking of storage in embedded frames, per-restaurant
  Apple/Google Pay domain setup and an "it looks off on my site" support load.
  The cost of omitting it: the main sales argument for restaurants with their own
  site, diners leaving the restaurant's site to order, and no home for "make the
  storefront look like my site" requests. Coming back is cheap — it sits on top
  of the existing storefront.
- **Native mobile apps** (React Native, same API) once the web version has real
  users. Until then the owner's order screen is an installable web page.
- **Live order-status page for diners** beyond the self-refreshing order page
  (§7); the full state machine is recorded from day one so it is cheap.
- **Menu import** (from a photo or a competitor export); the menu model must not
  preclude it.
- **Review collection and marketing emails.**
- **Buyable add-on modules** alongside the tiers (candidates: invoicing,
  reservations, advanced promotions). v1 is tiers only; plans are data, so this
  is a reversible pricing-page decision. Capability keys are not stored yet —
  plans carry numeric limits only — and the key list is added with the first
  module, because a list nothing reads is dead configuration.
- **Reservations and deposits.** Cut from v1 after detailed design: deposit
  charged to the restaurant's own Stripe account, auto-refunded when staff mark
  the party arrived, kept on a no-show after a grace period.
- **Owner-editable role permissions**: per-restaurant editing waits until real
  owners say which permission they wanted to move. (The platform's own roles —
  `Platform.Owner`, `Platform.Support`, `Platform.ReadOnly` — exist, §11, so
  "superadmin roles beyond Manish" is no longer parked.)
- **Superadmin impersonating an owner** (§11): a large, security-sensitive
  feature nobody needs yet, and it sits against §8's rule that superadmin never
  acts on a restaurant's behalf. If support later needs it, start with a
  read-only view-as-owner, audit-logged.
- **Per-item preparation times driving the ready-time estimate**: captured from
  day one, but a computed estimate is only as good as numbers nobody fills in
  accurately at signup; it earns its place once there is real data (§5).
- **Multi-location billing discount.** Each restaurant keeps its own
  subscription, limits never pool; a discount for owners running several is a
  later pricing move.
- **Storage-based tier limits.** Storage is not gated; the menu is already
  unlimited and policing a megabyte number nobody understands is not worth the
  support.
- **Advertising pixels and the cookie banner that follows.** No non-essential
  cookies in v1, hence no banner; a restaurant's own Google or Meta pixel
  becomes an opt-in that switches the banner on for that storefront only (§15).
- **A public directory beyond the plain root list** (§1). Genuinely unsure it
  will come. A directory that only lists restaurants and links out holds
  business data and leaves the processor-only structure intact; it becomes a
  controller problem the moment the platform uses diner data for its own
  purposes (cross-restaurant accounts, "your orders everywhere", marketing to
  diners). The moderation argument for not having one still applies.
- **Thermal printers** (§5) and **secret per-table codes** (§3).
- **Business buyers and e-invoices** (§10).
- **Combos with time windows, offer prices or per-mode switches** (§6). Decided
  later, not v1 (2026-11-16): a combo stays one fixed offer at a fixed price.
  Revisit only if a restaurant asks for a lunch-only or per-mode combo, and do it
  without touching the combo price rule — an item refund still takes the whole
  combo (§7).
- **Ideas parked on 2026-10-11 (Manish chose these for later):** an "add a
  drink?" upsell before checkout; menu search on the storefront (Ma Pasta has 50
  items); diet and allergen filters for diners; an "order again" that refills the
  basket from the order's secret link; "popular" badges from the
  sales report; suggested translations on a two-language menu.
- **Parked from the 2026-10-13 triage (real but someday):** resolving staff and
  shop names, instead of ids, in the activity log. (Since built, so no longer
  parked: the option-group library admin screens; translated offer labels; removing a
  logo once set — see §6.)
- **Parked 2026-11-25 (Manish chose to stay with polling for now): instant
  order updates over Azure Web PubSub in the admin.** Today the admin polls:
  `order-queue` every 10 s on the Orders page and phone view, every 30 s from
  the sidebar badge, and `order-limit` every 60 s on every shop page. The
  backend half already exists (`publishToShop` sends `{type:'new-order'}` to the
  shop's group; `GET /shops/{id}/realtime/negotiate` hands out a 60-minute
  connection token; `main.bicep` provisions Web PubSub, Free in dev, Standard
  S1 elsewhere), but on 2026-11-25 a search of `rs-admin/src` found nothing that
  opens the connection, so the item-1 "open connection ... built" claim in §6
  holds for the backend only. To pick it up: have the admin negotiate, open the
  WebSocket, refetch the queue on `new-order`, fall back to polling when
  negotiate returns `url: null`, and slow the poll to about 60 s while the
  socket is healthy (keep the poll as a safety net). Cost: Standard S1 is a flat
  fee, guessed at about 50 EUR a month and unconfirmed; polling for 20 shops was
  guessed at about 10 EUR a month; break-even is around 100 shops. Worth doing
  for speed more than for savings, and only needs the Standard unit once there
  are real shops. Cheap polling trims to do first: skip the sidebar poll while
  the Orders page is open, and stop the fixed `order-limit` timer.
- **Dependency majors:** admin i18next 26 / react-i18next 17 /
  i18next-http-backend 4 are **adopted** (browser pass done, commit `83deaad`);
  the backend is on Stripe **23** (§20); Tailwind **4** is in use in all four
  apps (§19). The storefront's React-hooks lint plugin stays on **5.x** until the
  §19 design pass (admin and superadmin are on 7.x).

---

## 23. Configuration numbers held only in the code

Product numbers that live in the code and were not written into the sections
above. Recorded here so a change to one is noticed:

| What | Value |
|---|---|
| Busy-mode minutes | 5 to 120 (default 20) |
| Auto-reject timeout | 5 to 30 minutes (default 10) |
| Delivery postcode, non-Germany | 3 to 10 letters, digits or dashes |
| Delivery zones per shop | at most 200 |
| Discount codes per shop | at most 50 |
| Loyalty rule | every 2 to 20 orders, reward €1.00 to €50.00 |
| Discount per-email limit | 1 to 100 |
| Staff lockout after failed logins | 15 minutes |
| Failed-payment warning emails | on days 0, 3 and 6 after a failure |
| Default manager permissions | also `view_audit` and `manage_stock` |
| Table label | must start with a letter or digit |
