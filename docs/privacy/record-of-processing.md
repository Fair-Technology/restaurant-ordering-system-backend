> DRAFT — not reviewed by a lawyer. Owner: Manish.

# Record of processing activities (Article 30 GDPR, processor)

The platform keeps this record as processor for restaurants. The EU representative holds a copy.

## Controller and processor

| | |
|---|---|
| Controller | Each restaurant that uses the platform (named in its Impressum) |
| Processor | The platform operator (legal name, address and contact are set under Platform legal details in superadmin) |
| EU representative | Set in the same place; to be appointed before launch |

## What is processed, and why

| Category of data | Data subjects | Purpose |
|---|---|---|
| Name, email address, phone number | Diners who place an order | Take, prepare and hand over the order; contact the diner about it |
| Order contents, totals, payment method and status | Diners | Fulfil and account for the order |
| Optional kitchen notes (not meant for health data) | Diners | Pass the diner's wishes to the kitchen |
| Sign-in identity and email | Restaurant owners | Access to the admin |
| Staff names and sign-in details | Restaurant staff | Access to the restaurant's orders |

Card and PayPal data is processed by Stripe as an independent controller and does not pass through the platform.

## Sub-processors and location

| Sub-processor | Purpose | Location |
|---|---|---|
| Microsoft Ireland Operations Ltd. — Microsoft Azure | Hosting, database and file storage | EU (West Europe region, Netherlands) |
| Microsoft Ireland Operations Ltd. — Microsoft Entra External ID | Sign-in for restaurant owners | EU |
| Microsoft Ireland Operations Ltd. — Azure Communication Services | Sending order emails | EU |

The list is kept in `src/domain/legal/platformDocuments.ts`.

## Retention

Order records are kept as long as tax and commercial law requires the restaurant to keep them. A restaurant can ask for a customer to be erased: the personal fields on that customer's orders are anonymised, and the order itself stays for the restaurant's records. Kitchen notes are removed on erasure.

## Security measures

- Encryption in transit (HTTPS) and at rest (Azure platform encryption).
- Access control: owners reach only their own restaurants; staff access is limited by role; platform admin access is limited to superadmins.
- Every change to legal settings, exports and erasures is written to the audit log, which holds no personal content.
- Breach procedure: see `breach-runbook.md`.
- Handling on the restaurant's instructions only, as set out in the data processing agreement.

## Review

Review this record when a sub-processor changes, a new kind of data is processed, or at least once a year.
