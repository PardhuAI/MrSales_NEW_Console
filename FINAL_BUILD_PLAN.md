# The final version: build plan

Written 6 October 2026, from the owner's brief: "everything a company needs to
control its people is here, wired to the database, perfect." Each phase is built
whole (database, console, phone where needed, tests), checked live on Testbed,
committed, and ticked here before the next starts. The rules in `CLAUDE.md` and
`DESIGN.md` apply to every screen.

Who sees pay, everywhere (database and screens): **owner, HR, finance**. Admin
and IT never see salary or payslips (the old console's grant, now enforced in
the database too).

---

## Phase 1. Pay: from salary to the payslip on the phone

**Database (migration 0106)**
- `salary_components`: the company's own earnings and deductions, each fixed (₹)
  or a percentage of basic. Seeded: HRA 40% of basic, Conveyance ₹1,600, Special
  allowance ₹0, PF 12% of basic, Professional tax ₹200. Editable, retire not delete.
- `salary_structures` (per role, from 0104) become templates: a basic and a value
  for any component that differs from the company default.
- `employee_salaries`: each person's salary, dated (a revision is a new row; the
  history stays): basic, the structure it came from, and their own overrides.
- `payslips` gain the breakdown: gross, deductions, working days, loss-of-pay
  days, paid days, and every line.
- `payroll_preview(year, month)`: the month for everyone, computed in the
  database: each line, pro-rated for loss of pay (absent days with no leave, and
  unpaid leave), from the salary in force that month.
- `release_generated_payslip`: stores the database's own figures (never the
  browser's), with one-off additions or deductions (bonus, advance recovered),
  and tells the person on their phone.
- Release and read: owner, HR, finance only (admin removed from both).

**Console**
- Settings, HR rules: salary components (add, edit, retire) and role structures
  as components, with the gross, deductions and net worked out as you type.
- A person's record, Pay: their salary now, the history of revisions, "Revise
  salary" (from their role's structure or their own figures, from a date).
- Expenses and pay, Payroll: pick a month; everyone's payslip computed, with loss
  of pay shown and why; people with no salary listed; add a one-off line; review;
  **Generate and release**: each payslip becomes a PDF (company name, address,
  GSTIN and logo; earnings, deductions, days, net in words) and reaches the phone.
  Re-releasing a month replaces it, on purpose and with a confirmation.

**Phone (next APK)**
- Payslips show gross, deductions and net, and open the PDF.

## Phase 2. Expenses: complete control per role and per person
- Per-person expense rule (overrides the role's): allowance, bill threshold,
  monthly ceiling. Order: person, role, company. One resolver for all of it.
- Travel rates per km (local and outstation, by mode): set by the office per
  role and per person; the table and the phone's call already exist.
- A person's record, Expenses: their rule in force and where it came from.

## Phase 3. Company profile
- The company's name, address, state, GSTIN, PAN, website and logo, read from
  what Mr Sales keeps (ops `org_profiles`), shown in Settings and printed on
  payslips. Changes go through Mr Sales (Help), so invoices and payslips agree.
- The ops console's invoice logo brought up to the current mark.

## Phase 4. Leave balances
- Per person per type: allowed, taken, waiting, left, on Leave, the person's
  record and Approvals; and on the phone when applying.

## Phase 5. Bulk import of people
- Upload a sheet, see every row checked (role, territory, manager, email,
  duplicates), import the good ones; the same pattern as clients and products.

## Phase 6. Account security for office logins
- Change your own password; sign out on every device; two-factor sign-in
  (authenticator app), optional per person, and required for owners if the
  company chooses.

## Phase 7. Announcements
- One message to the whole field, a team, or a role, through Messages; it reaches
  every phone as a conversation they can reply to.

## Phase 8. The final pass
- Every page for every role, light and dark, phone and desktop; the design rules;
  accessibility; live checks of every write; the old-console parity list; one
  APK with every phone change; the checklist ticked.

---

### Progress
- [x] Phase 1 (console; phone payslip screen pending the APK) · [x] Phase 2 (travel rates are per person: the table has no role column, and the phone's daily allowance is flat, so per-role rates would change nothing) · [x] Phase 3 (console; ops invoice logo pending) · [ ] Phase 4 · [ ] Phase 5 · [ ] Phase 6 · [ ] Phase 7 · [ ] Phase 8
