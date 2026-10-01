# Legal documents

Everything the platform writes as legal wording lives in code, so a change is one reviewed commit.

| What | Where |
|---|---|
| Data processing agreement (DPA) text, versions | `src/domain/legal/platformDocuments.ts` |
| Sub-processor list (Microsoft services) | `src/domain/legal/platformDocuments.ts` (`SUB_PROCESSORS`) |
| Privacy-notice template shown on each restaurant's storefront | `src/domain/legal/privacyNotice.ts` |
| Impressum rules (what counts as complete) | `src/domain/legal/impressum.ts` |

## Draft status

All platform-written wording is a placeholder marked "DRAFT – not reviewed by a lawyer". `isDraft: true` on a document makes the admin and storefront show it as a draft. Nothing here is lawyer-approved yet.

Sign-off: Manish, after the lawyer review. Replace the placeholder clauses in `platformDocuments.ts`, set `isDraft: false` on the reviewed version, and review `privacyNotice.ts` the same way.

## Publishing a new DPA version

1. Append a new `PlatformDocument` to `DPA_VERSIONS`. Never edit a published one: restaurants accepted a specific version, and that record has to stay true.
2. Use a new `version` string (the convention is the publish date, `YYYY-MM-DD`, plus `-draft` while it is a draft).
3. `CURRENT_DPA` is always the last entry.

What happens next:

- Restaurants already live stay live, and checkout keeps working (any accepted version is enough there).
- Admin shows "new version available" to the owner.
- A restaurant that is paused cannot go live again until its owner accepts the current version.

## Changing the privacy-notice template

Bump `PRIVACY_TEMPLATE_VERSION` in `privacyNotice.ts` when the wording changes. The notice is generated on request from the restaurant's Impressum and the platform operator details, so it is never stored per restaurant.
