Velo V1.5 — Billing & Collections Design
Created: 2026-06-27
Stage: 3 (operational essentials) — this is the concrete form of the locked
"receipts day-one + adjustment model with audit trail (no hard deletes)" decisions.
Author: Claude (architecture), pending Ali review + Saif confirmation on ledger semantics.
Bar: Saif said "data is most important" twice. A billing system that loses or
miscounts money is unrecoverable. This design is correct-by-construction on the
balance, append-only on corrections, and currency-safe by default.
---
1. The workflow (Ali's description, formalized)
Doctor finishes a procedure → enters a charge (price for the service rendered).
The charge appears on a reception collections worklist (patient now has an
outstanding balance).
Reception records a payment through the system when the patient pays.
Payments may be partial — the unpaid remainder is carried as a due balance
on the patient, drawn down by future payments.
---
2. Non-negotiable principles
These are the integrity guarantees. Everything else bends to keep these true.
Balance is DERIVED, never stored. There is no `balance` column anywhere. The
amount a patient owes is always computed: `SUM(charges) − SUM(payments)`, per
currency. A stored balance can drift; a derived one cannot.
Append-only. No edits, no hard deletes. A charge or payment entered wrong is
never updated or deleted. It is corrected by appending a reversal/adjustment
row that references the original. The full history is the audit trail.
Currency is stamped on every row and never auto-summed across currencies.
IQD stored as whole dinars (×1), USD as cents (×100), per `src/lib/money.js`.
A patient can owe an IQD balance and a USD balance simultaneously; they are two
separate numbers, never added together.
Amounts stored positive. Direction (does this add to or subtract from what's
owed) comes from the row's kind, not from a negative number. No negative-number
data-entry foot-guns.
---
3. Schema (two tables, both org-scoped)
Patients live in `patients` (NOT `contacts` — confirmed against live schema).
Doctors are `profiles` rows with `role='doctor'`.
3.1 `charges` — what was billed
Column    Type    Notes
`id`    uuid PK    `gen_random_uuid()`
`org_id`    uuid    FK orgs, RLS scope
`patient_id`    uuid    FK patients
`treatment_id`    uuid NULL    FK treatments — links to the clinical plan item if one exists
`doctor_id`    uuid    FK profiles — who rendered the service
`kind`    text    `'charge'` | `'void'` (CHECK constraint)
`reverses_id`    uuid NULL    self-FK; set on `'void'` rows, points to the charge being voided
`description`    text    what the service was
`amount_minor`    bigint    positive, minor units for `currency`
`currency`    text    `'IQD'` | `'USD'` (CHECK)
`created_by`    uuid    FK profiles
`created_at`    timestamptz    default now()
3.2 `payments` — what was collected
Column    Type    Notes
`id`    uuid PK    
`org_id`    uuid    FK orgs, RLS scope
`patient_id`    uuid    FK patients
`charge_id`    uuid NULL    reserved for V1.6 — optional charge-level allocation; unused in V1.5 (patient-level ledger)
`kind`    text    `'payment'` | `'reversal'` (CHECK)
`reverses_id`    uuid NULL    self-FK; set on `'reversal'` rows
`amount_minor`    bigint    positive
`currency`    text    `'IQD'` | `'USD'` (CHECK)
`method`    text    `'cash'` | `'card'` | `'transfer'` (Saif is mostly cash)
`collected_by`    uuid    FK profiles — which reception user took the money
`collected_at`    timestamptz    default now()
`note`    text NULL    
Why two tables, not one ledger: charges (what was billed) and payments (what was
collected) are different domain events with different authors and different UI. Keeping
them separate is more legible and maps cleanly to roles. The balance joins both.
Why `charge_id` is reserved but unused: V1.5 uses a patient-level ledger —
payments reduce the patient's overall balance, not specific charges. This matches the
informal reality of an Iraqi cash clinic (Stage 1 found ~6 structured payments total;
history lives in note prose). Charge-level allocation ("this filling is paid, that crown
is half-paid") is a real feature but it's V1.6 refinement. The nullable column means we
can add it later without a migration.
---
4. The balance formula (the heart of it)
Per patient, per currency, "active" = a row whose `id` is not referenced by any
`reverses_id` AND whose own `kind` is not a reversal:
```
owed(patient, CUR) =
    SUM(charges.amount_minor  WHERE active AND currency = CUR)
  − SUM(payments.amount_minor WHERE active AND currency = CUR)
```
`owed > 0` → patient owes that amount.
`owed < 0` → patient has credit (overpaid; drawn down by future charges naturally,
because it's all SUM). UI shows "credit," not "owes."
`owed = 0` → settled.
Computed in two currencies independently. If both are non-zero, the UI surfaces two
numbers (e.g. "Owes 120,000 IQD · Owes $40") — never one blended figure.
This is the correct-by-construction property: there is no path by which the displayed
balance can disagree with the underlying rows, because it is the underlying rows.
---
5. Corrections (no hard delete, audit trail)
Voiding a charge (doctor billed wrong / wrong patient): append a `charges` row
with `kind='void'`, `reverses_id` = the original's id, same amount/currency. The
balance formula nets it out. The original stays visible, marked voided in the UI.
Reversing a payment (reception keyed it wrong / refund): append a `payments` row
with `kind='reversal'`, `reverses_id` = original. Same mechanism.
Discounts / write-offs: modeled as a `charges` void (partial: void the original,
re-issue a charge at the discounted amount) OR a dedicated adjustment — confirm the
exact UX during the build slice. Either way, append-only.
No row is ever UPDATEd or DELETEd. The history is the receipt of truth.
---
6. Roles (fixed roles, V1.5 — maps to the locked decision)
Action    doctor    reception    owner    operator
Create charge    ✅ (own patients)    —    ✅    ✅
Create payment (collect)    —    ✅    ✅    ✅
View balances / worklist    ✅    ✅    ✅    ✅
Generate receipt    —    ✅    ✅    ✅
Void charge / reverse payment    —    —    ✅    ✅
The integrity gate: only owner + operator can void or reverse. Reception collecting
wrong is escalated to the owner to correct — money corrections are privileged. This is
the whole reason fixed roles are safe here.
---
7. The "notification to reception" — a worklist, not a push system
Ali described a notification firing to reception when a doctor enters a charge. For
V1.5 this is a derived collections worklist, not push infrastructure:
> **Outstanding Collections** view = all patients where `owed(patient, *) > 0`,
> newest charge first, showing patient, amount(s) due, doctor, and date.
Real-time push notifications are Stage 4 automation territory (Vercel-Pro-gated,
cron/realtime). A worklist delivers the same operational value — reception sees who
owes money the moment they open the screen — with zero new infrastructure and no way
for a "notification" to be missed or lost. Push is a later enhancement layered on top.
---
8. Receipts (day-one, locked)
A receipt is a printable/exportable record generated from immutable payment rows:
patient, date, amount + currency, method, what it was for (linked charges or free-text),
who collected, and the patient's balance snapshot at that moment. Because payments are
append-only, a receipt can never silently disagree with the ledger.
---
9. RLS (follows the working ownership pattern — NOT the orgs operator-only trap)
Both tables get org-scoped RLS modeled on `treatments`/`patients` (which work),
not on `orgs` (which is operator-only and silently blocked owner writes — see the
SB-8 finding). Pattern:
SELECT: `org_id = public.current_org_id()` for all org members.
INSERT: `org_id = current_org_id()` AND role check — charges require doctor/owner,
payments require reception/owner. Void/reversal rows require owner.
UPDATE / DELETE: none granted. Append-only is enforced at the DB layer, not just
convention.
This must go through the CLAUDE.md net-new-schema protocol: `/plan` + RLS review +
dry-run before the migration touches a real Supabase project. It is built and verified
on staging first, never authored directly against production.
---
10. Build slices (each: trace → build → Ali verifies money math on real data → next)
Schema migration — `charges` + `payments` + RLS + CHECK constraints. Staging.
Verify: insert a charge + partial payment by hand, confirm the balance formula
returns the right number across a void and a reversal.
Data layer — `src/lib/billing.js`: `createCharge`, `recordPayment`,
`voidCharge`, `reversePayment`, `getPatientBalance`, `getOutstandingCollections`.
Currency-stamped, errors thrown (matches `database.js` convention).
Doctor charge entry — UI on the treatment/visit flow to enter a charge.
Reception collection — the Outstanding Collections worklist + record-payment UI
with partial-payment support and live remaining-balance display.
Receipts — generate/print from payment rows.
Corrections UI — owner-only void/reverse.
SB-2 (server-side patient search) and the import pipeline (SB-1) come before this —
billing sits on top of trustworthy patient data, not the other way around.
---
11. OPEN — needs Saif before ledger semantics finalize (defaults baked in now)
The architecture is locked and unblocked; these only tune the ledger rules. The design
ships with my best-judgment defaults so we're not blocked — if Saif contradicts one, we
adjust that single rule, not the architecture.
#    Question for Saif    Default if no answer
1    Do you carry running balances per patient today, or pay-as-you-go (no debt)?    Carry balances (the whole point of this)
2    Is "remaining due" shown to the patient, or internal only?    Internal; receipt shows it
3    Can reception collect for a doctor who already left?    Yes — async charge→collect is the core flow
4    Do patients ever overpay to keep credit on account?    Allowed → becomes credit balance
5    Cross-currency: when a patient pays USD against an IQD bill (or vice versa), do you convert at the desk or keep them separate?    Separate sub-balances, no conversion. ⚠️ Highest-value question — if Saif converts at the desk, we add an optional `applied_rate` to payments so a USD payment can settle an IQD balance at a recorded rate. Do NOT build conversion until he confirms he needs it.
6    Who may give a discount / write off a balance?    Owner only (matches §6)
---
This doc is the spec. Build slices reference it. Update it (overwrite) as decisions
land, same as MEMORY.md discipline.
