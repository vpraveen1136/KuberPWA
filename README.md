# Kuber PWA

Local-first PWA version of the Kuber iOS app, currently scoped to Phase 1 and Phase 2.

## Phase 1: Foundation

- Dependency-free browser app targeted first at iPhone Safari.
- Installable PWA shell with `manifest.webmanifest` and `service-worker.js`.
- INR-only formatting.
- IndexedDB database named `kuber-local`.
- Offline app shell caching.

## Phase 2: Migration

- Imports the iOS full backup JSON shape:
  - cards
  - categories
  - budgets
  - transactions
  - EMI plans
  - statements
  - statement payments
  - wishlist
  - statement PDF attachments
- Preserves IDs and dates from the iOS backup.
- Stores statement files in IndexedDB with their base64 payload and metadata.
- Exports a full backup JSON with data and statement files.
- Backup health is overdue after 7 days.

## Phase 3: App Shell And Navigation

- Recreates the iOS-style top-level navigation:
  - Dashboard
  - Add action
  - More
- Add opens an iPhone-style bottom sheet for purchases.
- Add Purchase writes a migrated-compatible transaction into IndexedDB.
- More opens full-screen feature panels for:
  - Budget
  - Transactions
  - Statements
  - EMI Plans
  - Backup & Restore
  - Spending Analysis
  - Wishlist
  - Settings
- Deeper feature behavior remains scoped to later phases.

## Phase 4: Dashboard

- Adds month selection and card filtering.
- Shows migrated-data dashboard cards:
  - Spent
  - EMI Due
  - Payable
  - Next Due
  - Payment Recommendation
  - Cash-Out Forecast
  - Due Soon
  - Budget Alerts
- Adds lightweight iPhone-friendly bar charts:
  - Spending Trend
  - Payable Trend
  - Card Spend
  - Category Spend

## Phase 5: Core Screens, Slice 1

- Transactions screen:
  - Search by title/card/category
  - Filter by card
  - Filter by category
  - Edit transaction
  - Delete transaction
  - Record/update refund
  - Convert transaction to EMI
  - Revert EMI from a transaction
- Statements screen:
  - Filter by card
  - Show status, due date, paid, balance, and progress
  - View migrated statement PDFs inside the PWA
  - Fallback open/download actions for statement PDFs

## Phase 5: Core Screens, Slice 2

- EMI Plans screen:
  - List active EMI plans
  - Show monthly EMI, tenure, first/last installment dates, and remaining installments
  - Edit EMI amount, tenure, and first installment date
  - Revert EMI and restore the linked transaction to one-time status
- Budget screen:
  - Select budget month
  - Filter spend progress by card
  - Show total budget, spent, and remaining/over
  - Create budgets
  - Edit budgets
  - Delete budgets

## Phase 5: Core Screens, Slice 3

- Settings screen:
  - Add cards
  - Edit card nickname, bank, network, last 4 digits, statement day, and notes
  - Auto-calculate due day from statement day
  - Prevent deletion of cards already used by transactions, statements, or EMI plans
  - Add categories
  - Rename categories and update related transactions/budgets
  - Delete categories, moving related transactions to General and removing matching budgets

## Phase 5: Core Screens, Slice 4

- Statement payment management:
  - Open payment detail screen from any statement
  - Add payment with amount, paid date, and notes
  - Edit existing payments
  - Delete payments
  - Statement paid/balance/status values update after payment changes

## Phase 5: Core Screens, Slice 5

- Statement management:
  - Add/upload statement
  - Edit statement card, month, statement date, due date, total due, and minimum due
  - Replace stored statement file
  - Delete statement with related payments and stored file
  - New/replaced files are stored locally in IndexedDB as backup-compatible base64 attachments

## Phase 6: Backup & Restore Hardening

- Importing a full backup now confirms before replacing existing local PWA data.
- Backup status shows last import, last export, records, PDFs, and 7-day health.
- Local edits mark the app as having unexported changes.
- Dashboard and Backup & Restore show a backup-needed warning when changes have not been exported.
- Export records the last exported file name and timestamp.
- Reset Local Data requires typing `RESET` and clears only this browser's IndexedDB data.

## Phase 7: Spending Analysis

- Adds a working Spending Analysis screen.
- Financial year selector.
- FY category spend ranking.
- Six-month average spend ranking.
- Category selector for trend analysis.
- Twelve-month category spending trend.
- Uses lightweight CSS charts for iPhone Safari performance.

## Phase 8: Wishlist

- Adds a working Wishlist screen.
- Shows wish count, total saved, target, and remaining amount.
- Add wishlist items with title, category, target amount, saved amount, priority, and notes.
- Edit existing wishlist items.
- Delete wishlist items.
- Shows progress bars and priority styling.

## Phase 9: Budget Intelligence

- Adds Copy Previous Month budgets.
- Adds Smart Forecast budget suggestions.
- Forecast uses recent average, six-month history, and trend projection.
- Suggestions show confidence and observed history before applying.
- Applying forecast skips categories that already have a budget for the selected month.

## Phase 10: CSV Import

- Adds a downloadable backfill CSV template from Settings.
- Imports old purchase rows from CSV into local IndexedDB.
- Matches backfill card names to existing cards and creates a local placeholder card when needed.
- Adds new categories found in CSV files.
- Adds statement-level CSV import from each statement row.
- Statement CSV rows are attached to the selected statement and its card.

## Phase 11: CSV Import Safety

- Skips duplicate CSV rows on repeated imports.
- Duplicate matching checks description, amount, purchase date, card, and statement.
- Import summaries show how many duplicate rows were skipped.
- CSV import copy now explains the repeat-import behavior before import.

## Phase 12: Storage Health

- Adds local storage health to Backup & Restore.
- Shows estimated Kuber backup data size.
- Shows browser storage used, browser storage limit, and usage meter when available.
- Shows whether the browser reports persistent or browser-managed storage.
- Adds a persistent-storage request button on browsers that support it.
- Shows the last local data-change date from app metadata.

## Phase 13: Migration Integrity Check

- Adds a Migration Check card to Backup & Restore.
- Checks broken links between cards, transactions, statements, payments, EMI plans, and stored files.
- Flags missing statement files and unused stored files.
- Flags transactions that look duplicated.
- Keeps issue output to counts and short labels, without exposing private transaction details.

## Phase 14: PWA Readiness

- Adds a PWA Status card to Settings.
- Shows app version, network status, offline cache status, and display mode.
- Detects whether Kuber is running from the Home Screen or a Safari tab.
- Updates online/offline status as the browser state changes.
- Adds a Check For Update button for the service worker cache.

## Local Preview

Serve this folder over HTTP so the service worker and file import APIs behave like Safari:

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

Then open:

```text
http://127.0.0.1:4173/
```
