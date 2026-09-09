# TaxGuard SA — restore, then upgrade

## Stage 1 — Get the uploaded app running as-is

- Copy the uploaded source (pages, components, tax logic, database migrations, homepage image) into this project. No `.git` metadata is present in the archive, so nothing risky is carried over.
- Turn on Lovable Cloud so the app gets its own database, logins and file storage, and apply the supplied database migrations (profiles, business profiles, salary records, deposits, expenses, alerts, provisions, evidence packs, tax rate tables).
- Confirm the app builds and every page loads before changing anything.

## Stage 2 — Accounts and onboarding

- Email/password sign-up and sign-in plus Google sign-in, with the session kept in sync so the header always reflects who is signed in.
- Onboarding after first sign-in: name, language, and whether the person is an individual or runs a business. Business users additionally give business name, VAT status and tax election.
- Everything business-only (ledger, provisional tax, evidence packs) is hidden for individual users and appears for business users, in both the sidebar and on the dashboard.

## Stage 3 — Payslips, camera and receipts

- Live camera capture on phones plus file upload as a fallback, for both payslips and till slips.
- The captured image is read automatically and the extracted figures are shown for confirmation first. Nothing enters the books until the user confirms; the photo stays attached as the evidence.
- Confirmed payslips feed the PAYE check; confirmed slips post straight into the expense ledger with a category and VAT split.

## Stage 4 — Real numbers only

- Remove all sample/demo rows and pre-filled calculator values. Empty states explain what to add rather than showing invented figures.
- Business ledger and tax preparation compute from the user's own recorded deposits, expenses and payslips: turnover, deductible expenses, profit, provisional tax estimate, VAT position.
- Strict validation on every form: required fields, sensible amounts, valid dates and periods, no negative or nonsense values, clear inline error messages.

## Stage 5 — Dashboards, charts and exports

- Charts driven only by stored records: income vs expenses over time, PAYE estimated vs deducted, expense category breakdown, tax set aside vs estimated liability.
- Exports: CSV for the ledger and salary history, and a printable evidence pack for any date range.

## Stage 6 — Homepage and navigation

- Rotating carousel of the key features, and inline expandable explanations of tax terms in plain language.
- SARS branch locator using Google Maps, with search and pins. This needs the Google Maps connector linked — I'll open that step when I get there.
- Responsive navigation: proper mobile menu, no overflow, tidy on tablets.
- Remove the duplicated floating icon.
- TaxGuard favicon and no Lovable branding anywhere.
- The existing homepage image stays.

## Stage 7 — Look and feel

No colour palette reached me, so I'll apply a restrained neutral system — off-white page, near-black text, soft grey surfaces and borders, one calm accent for actions, with matching dark mode — used consistently across every page. Say the word if you have exact colours and I'll swap them in.

## Stage 8 — Testing

I'll create a throwaway test account and walk the whole app in a real browser: sign up, onboarding both as an individual and as a business, capture and confirm a payslip and a receipt, ledger and tax figures, charts, exports, and the homepage on phone and desktop widths. Test data is removed afterwards.

## Technical notes

- Stack stays TanStack Start + Lovable Cloud; existing components are edited in place, not rebuilt or duplicated.
- Image reading uses the Lovable AI gateway's vision model in a server function; the raw image goes to private storage with per-user access rules.
- All tables keep row-level security scoped to the signed-in user.
