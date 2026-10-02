---
id: SPEC-review-reference-categories
companions: [contract.md]
sources: []
---
# Correct review reference categories
## Why
Human-confirmed crops enter the library in the accreditation category even when their code belongs to a nutritional, dietary, usage or hazard category. The confirmed investigation records 121 active category deviations and 319/430 review-confirmed rows without a GS1 field.
## Capabilities
- **CAP-1**
  - **intent:** Review acceptance and annotation register references in the category belonging to their canonical code.
  - **success:** Nutritional A–E, usage, diet, GHS and generic codes persist the matching category and declaration field.
- **CAP-2**
  - **intent:** Registration rejects inconsistent category metadata before changing the library.
  - **success:** API sends resolved fields; ML validates code and field pairing; invalid or ambiguous metadata fails without storage or embedding work.
- **CAP-3**
  - **intent:** Re-registering the same crop repairs category metadata without creating another reference.
  - **success:** Existing same-code rows receive only field_type and gs1_field changes, without new embeddings, label, source or active-state changes; different-code requests cannot relabel rows.
## Constraints
- One authoritative code mapping consumed consistently by TypeScript and Python, with parity tests.
- Keep source idempotency and same-code near-duplicate guards for new crops.
- Include dedicated seed/live reference writers so no affected incorrect write path remains.
- Local code, offline mocked tests and one local commit only; preserve unrelated work.
## Non-goals
- No external data updates, deployment, restart, push, merge, migration, model or threshold changes.
## Success signal
Offline contract and registration tests pass, including invalid requests and same-path repair. Existing data correction is documented using the existing idempotent backfill in dry-run mode.
