# Development Roadmap

This file tracks the next major improvements for My Finance. Keep entries brief and update statuses and checkboxes as work progresses.

## Current Status

- Web app: active; built with Next.js and Supabase.
- iOS and Android apps: planned.

## Upcoming Work

### Import Bank and Credit Card Statements

**Status:** Planned
**Priority:** High
**Platform:** Web, iOS, Android
**Dependencies:** File upload and transaction import workflow

#### Description
Let users upload bank or credit card statements, extract transactions, and suggest income/expense types and categories. Match suggestions to existing categories where possible and let users create a category when needed. Users must review and approve imported transactions before they are saved.

#### Tasks
- [ ] Identify supported statement formats (such as CSV, PDF, or images) and define upload limits.
- [ ] Prototype transaction extraction with deterministic parsing/OCR where suitable and compare small or low-cost language-model APIs for categorization.
- [ ] Match extracted merchants and transactions to existing categories; offer category creation for unmatched items.
- [ ] Build a review and correction step before importing transactions.
- [ ] Test accuracy, duplicates, malformed files, and privacy/security of uploaded statements.

#### Notes
Treat AI output as a suggestion, never as an automatic financial record. Avoid sending statement data to an external model until privacy, retention, and cost are understood. Do not store uploaded files longer than necessary.

### Mobile Apps and UI Improvements

**Status:** Planned
**Priority:** High
**Platform:** iOS, Android, Web
**Dependencies:** Mobile architecture decision

#### Description
Plan and build iOS and Android apps for core finance workflows, while improving the responsive web experience.

#### Tasks
- [ ] Choose native or cross-platform architecture and define the first release scope.
- [ ] Implement sign-in, dashboard, transaction entry, reports, and settings.
- [ ] Adapt navigation and transaction entry for small screens and accessibility.
- [ ] Connect apps to Supabase using existing access controls; identify any backend/API changes.
- [ ] Decide whether offline access, push notifications, and deep links are needed for the first release.

#### Notes
Never include privileged backend keys in a client app. Keep the initial mobile scope focused; track store publishing and CI/CD when implementation is underway.

### Testing and Release Quality

**Status:** Planned
**Priority:** High
**Platform:** Web, iOS, Android
**Dependencies:** Features under development

#### Description
Use repeatable checks to protect data integrity, privacy, and core workflows as the product grows.

#### Tasks
- [ ] Test authentication, transaction creation/editing, recurring transactions, currency conversion, and user data isolation.
- [ ] Add mobile device/OS coverage and accessibility checks when mobile apps begin.
- [ ] Test statement-import accuracy, duplicate detection, and user approval before saving.
- [ ] Run the existing web checks: privacy check, typecheck, lint, tests, and production build.

#### Notes
Block release on critical security, privacy, or financial data-integrity failures.

## Backlog Template

### Feature Name

**Status:** Planned
**Priority:** High / Medium / Low
**Platform:** Web / iOS / Android / Both / Backend
**Dependencies:** None

#### Description
What needs to be implemented.

#### Tasks
- [ ] Task 1
- [ ] Task 2

#### Notes
Important technical decisions or considerations.
