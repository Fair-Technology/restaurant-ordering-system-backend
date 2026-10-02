> DRAFT — not reviewed by a lawyer. Owner: Manish.

# Personal data breach runbook

The platform is the processor for each restaurant's diner data. When a breach affects that data, the platform must tell the affected restaurants "without undue delay". The restaurant, as controller, has 72 hours from becoming aware to notify its data-protection authority, so every hour the platform spends improvising comes out of the restaurant's clock.

## 1. Noticing

Ways a breach comes to light: an alert or anomaly in Azure, a report from a restaurant or a diner, a report from a sub-processor (Microsoft, Stripe), or a team member spotting something wrong. Anyone who suspects a breach tells Manish straight away, with what they saw and when.

## 2. Deciding

Owner: Manish (deputy: to be named).

Within the first hours, answer:

- Is personal data involved (names, emails, phone numbers, order contents, notes)?
- Was it lost, altered, disclosed or accessed without permission?
- Is it still happening? If so, contain it first (revoke keys, disable the affected endpoint, rotate secrets).

Write the answers in the incident log (section 5) even if the conclusion is "not a breach".

## 3. Identifying affected restaurants

Use the shop id on orders and the audit log to list which restaurants' data was involved, and which fields. Find each restaurant owner's contact from the sign-in records.

## 4. Notifying restaurants

Send each affected restaurant owner a message without undue delay. Template:

> Subject: Security incident affecting your restaurant's data
>
> What happened: [short description and when it was discovered]
>
> What data is affected: [which fields, how many diners, which period]
>
> What we have done: [containment and fixes so far]
>
> What you need to do: [for example, assess whether to notify your data-protection authority within 72 hours of reading this, and whether diners must be told; we will give you any detail you need]
>
> Contact: [name, email, phone]

Also tell the EU representative.

## 5. Incident log

Record every incident, including ones judged not reportable:

| Date found | Date it began | What happened | Data and restaurants affected | Decision (reported or not, and why) | Actions taken | Closed on |
|---|---|---|---|---|---|---|

Keep the log for at least the retention period set in the record of processing.

## 6. Afterwards

Review what failed, fix the cause, and update this runbook.
