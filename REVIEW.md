# Review record: every screen, its plan, and how it meets the rules

The workflow in `CLAUDE.md` asks, for each screen: a five-line plan before building
(`console-design`), a browser check at 1440, 1280, 1024 and 390 and in dark mode, and the
`console-review` gate before it is called done. This file is that record, kept in the
repository so it can be checked rather than taken on trust.

The plans were made before each section was built. Those for Today, Field, Clients and
Sales were kept in the working session and are written down here on 2026-10-04; those
for Team onwards were written the same way and copied here unchanged in substance.

**Everything below was checked on the demo company, not the live testbed.** The live
run waits on network access to the Supabase project and the testbed login; until then no
box in `FEATURE_CHECKLIST.md` is ticked.

---

## How each rule is checked

| Rule (CLAUDE.md, console-review) | How it is checked | Result, 2026-10-04 |
|---|---|---|
| No banned fonts or icons, no gradients, glass, emoji; no raw colours outside the tokens; one shadow, floating surfaces only | `npm run check:rules` over all 98 source files; proven to catch a planted break of each kind | Passes |
| No em or en dashes on screen; no "Overview", "At a glance", "Key metrics", "Insights", "Welcome back" | the same script, on every visible string | Passes |
| Every page opens for every role it is granted, and says which permission is missing otherwise | `e2e/every-page.spec.ts`, all 41 menu pages for all six roles, against the old console's grant matrix | Passes |
| No sideways scroll at 390 | `e2e/every-page.spec.ts`, every page | Passes |
| Contrast 4.5:1, labels, names, roles, landmarks (WCAG 2.1 AA) | `e2e/accessibility.spec.ts`, axe on every page, light and dark | Passes, after darkening muted and faint text (DESIGN.md section 5) |
| Every button, form and filter does what it says | `e2e/team.spec.ts`, `e2e/work.spec.ts`: 23 flows end to end | Pass |
| Keyboard: radio groups move by arrows, dialogs trap focus, Escape closes and returns focus | Radix dialogs; the strip, the month picker and the segmented control tested by keyboard in `e2e/work.spec.ts` | Pass |
| Loading, empty, error, no permission on every list | `components/States.tsx` used by every list; no-permission page tested above | Built on every list; error states not yet forced in a test |
| 1440, 1280, 1024, 390 and dark | screenshots of every screen at those widths while building | Checked by eye, fixes listed below |
| Motion: one ease, token durations, nothing moves with reduced motion | tokens only; accessibility suite runs with reduced motion and finds content in place | Checked |
| Sentence case, counts with the right noun | `count()` in `lib/format.ts` for every count; read through on screen | Checked by eye |
| Never invent figures; demo data labelled | every figure is read from a table; "Demo data" shown beside the freshness of every list | Checked; findings below |

`npm run check` runs the rule script, the typecheck and all 31 browser tests.

---

## Today

**Dashboard (`/`).** *Question:* what needs me today, and is the field working? *Hero:*
the day in one sentence (who is out, calls done against planned) and the people who need
a look. *Density:* reading screen, spacious. *States:* a week off, a holiday, early
morning, a new company and a company without targets each say so, never "0 of 0".
*Avoided:* a grid of metric cards. The HR, finance and IT roles get their own Today.
Fixed in review: the setup card sat over the hero; managers were counted as field people.

**Approvals (`/approvals`, `/approvals/decided`).** *Question:* what is waiting for my
decision, oldest first? *Hero:* the people waiting, then one person's requests by kind.
*Density:* working. *States:* nothing waiting, error with retry. *Avoided:* a table of
every request with a checkbox wall. A rejection needs a written reason, as the database
does.

**Attention (`/attention`).** *Question:* who needs a call from me, and why? *Hero:* a list
of named people with the reason and the place to act. *Avoided:* alert badges without a
person behind them.

## Field

**Activity.** *Question:* how did the field do on a day, and whose location needs a look?
*Hero:* the people table, those needing a look first. *Density:* working. *States:* the
week off and holidays say so and point to the last working day. *Avoided:* a map as
decoration. Days are picked from the strip (owner decision, DESIGN.md).

**A person's day.** *Question:* what exactly did this person do on this day? *Hero:* the
day's line and the visits in order, with a plotted map (scale bar, no basemap, no dot
grid). Fake locations named first. **Day plans, Tour plans, Coverage** follow the same
pattern: one sentence, then the working table. Fixed in review: sideways scroll at 390,
an early-return hook bug in Coverage.

## Clients

**All clients, a client's record, Data quality, Complaints.** *Question:* who are our
clients, who is not being seen, and what is wrong with the records? *Hero:* the client
table; on the record, the visit history. *Avoided:* a card per client. Found: the old
console's client edit wipes a client's saved position; the new one sends it back.

## Sales

**Sales, Orders, Targets, Prescription audit, Products, Stockists, Stock.** *Question:*
what was sold against target, and what is waiting to be approved? *Hero:* twelve months
against target, then the people. *Avoided:* a dashboard of tiles. Found: the old
console's "secondary sales" was 80% of primary, a figure nobody recorded; here it is the
approved field orders.

## Team

**People.** *Question:* who works here, and who cannot sign in? *Hero:* the roster.
*Avoided:* profile cards. **A person's record:** five tabs; *hero* the month in one line,
then figures grouped by meaning, never a card grid. **Add a person:** one column, three
groups; *states:* no roles, no geography. **Managers, Org chart:** *hero* the reporting
line; a move is read back before it is saved. **Attendance:** *question* who was present
each day and why; *hero* the month grid, each cell's reason spoken to screen readers.
**Leave:** *question* who is away and what waits; *hero* Who is away on the strip, then the
requests. Attendance picks its month from the month strip. **Tasks:** *hero* open tasks, the late ones named. Fixed in review: default `dd`
indent, form fields misaligned, a hidden label escaping its scroll box, leave on a day
with a day plan in the demo.

## Expenses and pay

**Expense claims.** *Question:* whose claims wait, and does each day claimed have work
behind it? *Hero:* the claims table; a claim day by day in a drawer. Both pick the month from the month strip. *States:* no claims,
a month not yet claimed. **Payroll.** *Question:* has everyone got this month's payslip?
*Hero:* the month's payslips with the change from last month. Found: the old console's
gross, basic and deductions were made up from net pay; only net and the PDF are shown.

## Share with field

**Resources, Surveys, Sent notifications.** *Question:* what is on every phone, what are
we asking clients, and who has read our messages? *Hero:* files by where they sit on the
phone; the open question with the clients' own words; messages grouped as sent.
*Avoided:* a thumbnail grid.

## Reports

**Reports, Downloads.** *Question:* the figures for a month, for everyone or one team, as a
sheet. *Hero:* one table with its total, the same rows as the sheet. Found: the old
console showed the same table under every report name.

## Settings and account

**Company rules.** *Question:* what rules does the phone apply? *Hero:* the rules as one
sentence, then the form; a change is read back before saving; read-only for roles that
may not change it. **Geography, Roles, Logins and access, HR rules, Field ownership, Audit
log, Help, Plan and billing** follow the same pattern: one sentence that answers the
question, then the list, every refusal from the database shown in words. Found: the
database lets any office user save the company rules; the console offers it to owner
and admin only. Fixed in review: account pages had no title; a page outside a role was
named after the wrong page.

---

## Live run, 2026-10-05 (Testbed Pharma, signed in as its Admin)

- **Every page opens on live data.** All 51 pages in `nav.ts` were opened signed in to
  the live project: no page error, no failed request, about two seconds each. Payroll
  says it is not open to an Admin, as the role matrix says.
- **Figures checked against the database** with SQL: the Dashboard (Saturday 24 of 24
  calls by 1 of 13 people; October 30 calls, 0 of 30 checked at the client; 3 of 13
  clients visited, 6 new, 7 without a location; ₹3,000 against ₹30 L), Field activity,
  Expense claims (₹1,980 by 2 people for September; 1 waiting, ₹250; 1 day with no day
  plan; 1 day above ₹500 with no bill), Clients (6 of 13 listed), Team (14 people, 10
  without a login), Orders and Sales.
- **Every write matches the database.** All 56 functions the console calls were
  compared, parameter by parameter, with their signatures in the live project: no
  unknown parameter, no missing required one.
- **Writes exercised live:** a leave decision through Approvals, read back from
  `leave_requests` and `approval_events`.
- Found and fixed: Sales counts orders before GST and Orders showed them with it, so the
  two disagreed by the GST; both now say which. The date and month pickers lost a key
  pressed straight after opening, and an arrow key on a strip could move two days.

## Still open

- Live runs as the other office roles (HR, finance, IT, management). Testbed has an
  Admin console login only; the others need one each.
- Writes other than a leave decision, run live end to end (signatures are checked).
- `seam.spec.ts` (the console and the phone agree), which needs the phone.
- The owner's review of each screen, and the decisions listed in `FEATURE_CHECKLIST.md`.
