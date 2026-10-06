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

## Live run as every office role, 2026-10-05

`scripts/testbed-role-logins.sql` gives Testbed one console login per role (HR,
finance, IT, and management as Rajesh Verma with team scope; addresses in the
gitignored `.env.testbed`). Each was signed in live and sent to all 51 pages.

| Role | Menu | Pages open | Refused, with the reason |
|---|---|---|---|
| Admin | every section | 50 | Payroll |
| HR | Home, Approvals, Field, Team, Expenses and pay, Reports, Settings | 21 | 30 |
| Finance | Home, Approvals, Sales, Team, Expenses and pay, Reports, Settings | 18 | 33 |
| IT | Home, Team, Settings | 12 | 39 |
| Management | Home, Field, Clients, Sales, Team, Expenses and pay, Share with field, Reports | 31 | 20 |

Every open page loaded with no error and no failed request, for every role, and what
each role may open is the old console's grant matrix. Found and fixed on the way:

- **"Add a person" for a role without onboarding** fell into a person's record and asked
  the database for an employee called "new" (eleven failed reads). Forbidden actions
  now have their own refusal, named for the action.
- **HR's Today said "Nobody is on the roster yet"** over "14 people on the roster" in the
  early morning: the database leaves today out for anyone who has not declared, because
  today is never a missed day. Today is now measured against the roster, the gap named
  "not declared yet".
- **Finance's Today counted ₹1,000 claimed** for September where Expense claims counted
  ₹1,980: it left out a rejected ₹980 day, and so also said no day was claimed above the
  allowance. Claimed now means sent (waiting, approved or rejected) on both, with the
  rejected amount shown.

## Two managers, writes and a full look, 2026-10-05

**Team scope, proven.** The seed now carries a second manager, Lakshmi Prasad (TBM9002,
Vijayawada) with two reps of her own, Kiran Kumar and Meena Reddy. Signed in as
management (Rajesh Verma's team), the console shows 14 people and 13 in the field, and
none of Lakshmi's three anywhere: Today, People, Managers, Field, Day plans, Attendance,
Tour plans and search. The Admin sees all 17 and 15. The seed no longer holds the
Testbed password; it is given as `mrsales.testbed_password`, like the role logins.

**58 writes, run live.** Every form and decision in the console was run against Testbed
and checked in the database, then removed again. Not run, on purpose: the invitation and
the password reset (they send real email, and Testbed addresses receive none), and a
request to the Mr Sales team (it would reach the platform's own queue).

Two backend faults found and fixed (Mr_Sales_Web migrations, applied):

- **0097** An export's copy is a CSV and the documents bucket refused CSV, so every
  export was recorded as failed and Recent exports had nothing to offer again.
- **0098** Sent notifications was empty for every office login: a person could read only
  their own. Owner, admin and management now read those of the people they may see
  (checked: admin 203, management its team, HR none, a rep their own).

**Every page, looked at.** 220 page views as the Admin on live data, at 1440 in light and
dark and at 390 on a phone, plus 1024: no sideways page scroll, no console error, no
failed request; axe passes in light and dark. Fixed from the look:

- Large figures used tabular numerals, which spaced "₹3,000" as "₹3 , 000"; the headline
  figure now uses proportional numerals (columns keep tabular).
- Exports queued by the app's own tests and never finished read "Being made" for days;
  after an hour they read "Not finished".
- Labels that left a period or a tax basis to guess: Managers' "At the client, 30 days",
  and on a person's record "Order value, with GST" against "Field orders, before GST".
- The attendance grid's cells carried an aria-label on a plain span (axe); the reason is
  now visually hidden text.

## Phases 5 and 6 (6 October 2026)

Checked on the demo company only. The live run waits on migration 0112 being applied
(see NEXT_WORK.md, "Left for the owner"); Your account needs no migration but has not
been signed into live from this session.

**Import people (Team, People, "Import from a sheet"; `/team/import`).**
*Question:* I have 40 reps in a spreadsheet; how do I get them all in without typing each
one? *Hero:* the check: one sentence ("2 rows need fixing; 1 of 3 rows are ready") over
a table of every problem, by row and column, saying how to fix it. *Density:* working,
in a wide drawer beside the roster. *States:* reading, checking, a file with no rows or no
code column, problems (the add button stays disabled), clean, adding, done, sending
logins with a progress line and any failures named; a role without the right is told who
may import. *Avoided:* a stepper of numbered circles and a green "success" panel: the
three steps are one quiet line of words, the verdict is plain text, no status colour
where nothing is a status.

**Your account (`/account`, first in the account menu).** *Question:* is my account safe,
and can I change my password myself? *Hero:* the line under the title (who is signed in,
and whether two-step sign-in is on), then the sections. *Density:* reading, set like the
settings on a Mac: each part's name and purpose on the left, the thing itself on the
right, separated by space and one hairline. *States:* two-step status loading, unreadable,
off, enrolling (QR code, the key as text with copy, the code), on (with "since"), turning
off (asks for a code); recent activity loading, error, empty. *Avoided:* a card per
section and a "security score". The QR code sits on white in every appearance (a token,
`--qr-ground`), because a camera reads it.

`console-review`, both screens:

| Check | Result |
|---|---|
| Hard rules | Accent only on buttons, links and focus; "On" is a good-toned pill beside the word, "Off" neutral; no dashes, sentence case, counts through `count()`. `check:rules` passes. |
| Finish | One hero each; three type sizes at most in any area; problem rows right-align the row number in tabular figures. |
| States | As above. Long names wrap; a 200-problem sheet is capped with "And n more". |
| Roles | Import: owner, admin, HR (pay column for owner and HR only); IT reaching the address is told who may. Your account: every role. |
| Accessibility | Every input labelled; errors in words; the drawer and the confirm trap focus and close on Escape; axe passes in light and dark (`npm run check`). |
| Widths | 1440 and 390 light, 1280 dark, 1024 with the dark menu, looked at; no sideways scroll (`every-page.spec.ts`). |
| Motion | Nothing new: the existing drawer and dialog surfaces, and Arrive on the activity list. |

Fixed from the look: the step numbers were set in tabular figures and read "1 . Get the
sheet"; the one-person case read "Send logins to the 1 new person" and now names them.

The password rules are the ones the console already holds office passwords to (12
characters, upper and lower case, a digit), stricter than the "at least 10" in
NEXT_WORK.md, so a password chosen here passes the first-password screen too.

## Still open

- The invitation and password-reset emails, sent to a real inbox from the new console.
- `seam.spec.ts` (the console and the phone agree), which needs the phone.
- The owner's review of each screen, and the decisions listed in `FEATURE_CHECKLIST.md`.
