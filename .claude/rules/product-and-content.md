---
paths:
  - "packages/shared/src/i18n/*.json"
  - "apps/web/app/globals.css"
  - "packages/shared/src/theme/**/*.ts"
---

# Product and content constraints

`DESIGN.md` is authoritative for all UI and wins over anything here. No gate can check these rules.

## Copy and i18n

1. Use one term per concept, in both locales. Use "Delete", never "Remove" or "Trash" for the same action. Use "Settings", never "Preferences" or "Options". Never vary a term for variety.
2. Keep an interpolated number out of the sentence structure. Write `"New messages: {count}"`, not `"You have {count} new messages"`. Keep a full sentence as one string, never as joined fragments. A joined fragment cannot be localized, because pt-BR word order differs from English.

## Structured data

3. Never invent a rating, a review, a price or an organization detail in JSON-LD. Add a structured-data block only when it maps to content that the page renders. Verify a social card against a deployed URL, never localhost, because a scraper cannot reach localhost.
