# New console: feature checklist

Every feature of the current console (`Mr_Sales_Web`, live at app.mrsales.in), so nothing
is lost in the redesign. Tick a box only when the feature works in the new console
**against the live backend**, not when the screen is drawn.

The domain moves to the new console only when every box is ticked, or the owner has
signed off an item as dropped (write the decision next to it).

Inventory taken 2026-10-04 from `Mr_Sales_Web/src` (21 page files, 45 routes,
140 data functions in `src/data/live.ts`). The "Old" column names the source so the
behaviour can be checked against it. The "Data" column names the function in
`live.ts` that does the work; the new console must call the same RPC or table.

> **Live run 2026-10-05:** every page opens against Testbed Pharma with no error, key
> figures match the database, and all 56 write functions match their signatures
> (`REVIEW.md`, "Live run"). Boxes are ticked after the owner's review of each screen.

> **Parity audit 2026-10-05, before the switch to app.mrsales.in.**
> - *Data:* every database function and table the old console uses is used by the new one,
>   except `decide_expense` and `decide_order` (replaced by the batch `decide_expenses` and
>   `decide_orders`, so each person gets one message) and `apply_for_leave` (defined in the old
>   console, never on a screen). All 66 calls match the live database's argument names.
> - *Found missing and added:* crash reporting (off until `VITE_SENTRY_DSN` is set, as before);
>   a page error inside the shell instead of a white tab; pages loaded on demand; the past-due
>   notice; booked manager moves and covers ("Moves to Rajesh Verma on 15 October") on the board,
>   the tree and the person's record.
> - *Old form fields never saved:* the old "Add an employee" asked for blood group, address,
>   areas, cluster, dotted line, salary, leave and expense settings, but `create_employee` stored
>   none of them. The new form asks only what is kept.
> - *Superseded by design:* "Menu remembers which sections were left open" (every section is
>   always visible now, at the owner's request); "Clear demo world" (demo mode is a separate
>   company, never mixed with live data).
> - *Ops console (ops.mrsales.in):* organisation status (`active`, `past_due`, `suspended`,
>   `closed`), plan modules, seats, invoices, support tickets and the owner's invite all reach the
>   new console; checked against the database's own vocabulary.
> - *App:* tasks (with client), chat both ways (office and field), notifications, manager moves,
>   products on sale, overall targets and plan switches checked live end to end.

---

## 0. Across the whole console

### Sign-in and accounts
- [ ] Sign in with work email and password · Old: `app/SignIn.tsx` · Data: Supabase auth
- [ ] Optional company code on the sign-in form
- [ ] "Forgotten your password?" sends a reset email · Data: `auth.resetPasswordForEmail`
- [ ] Expired or used email link explains itself ("That email link has expired or was already used")
- [ ] First sign-in from an invite: choose a password, confirm it, rules shown · Old: `app/Welcome.tsx`
- [ ] A field (phone) login trying the console is told to use the app · Data: `FieldLoginOnConsole`
- [ ] An organisation that is suspended or blocked is told so · Data: `OrgAccessBlocked`
- [ ] Sign out
- [ ] Shows who is signed in, their role and the organisation name

### Roles, permissions and scope
- [ ] Six office roles: Owner, Admin, HR, IT, Finance, Management · Old: `data/store.ts` `GRANTS`
- [ ] Menu shows only the modules the role may open (hidden, never disabled)
- [ ] A page opened without permission explains which permission is missing (not a blank page)
- [ ] Scope: Management sees its team only; the rest see the company
- [x] Salary visible only to Owner, HR and Finance (`canSeeSalary`), enforced in the database since 0106
- [ ] Modules switched off in the organisation's plan are hidden (`disabledModules`)
- [ ] Role access matrix kept exactly:
  - Owner: everything
  - Admin: everything except payroll and salary
  - HR: dashboard, attention, people, org, roles, attendance, leave, documents, tours, HR config, onboarding, payroll, ownership, reports, exports, config, approvals, help
  - IT: dashboard, people, org, users, roles, audit, health, config, onboarding, help
  - Finance: dashboard, attention, expenses, approvals, sales, orders, targets, people, payroll, reports, exports, config, help, billing
  - Management (team scope): dashboard, attention, field, clients, sales, orders, targets, people, resources, surveys, complaints, tours, RCPA, coverage, stock, stockists, tasks, notifications, reports, exports, expenses, help

### Shell
- [ ] Global search across employees (name, code), clients (name), orders (number), with ⌘K / Ctrl K to focus · Old: `app/Shell.tsx` `GlobalBar`
- [ ] "Nothing matches" result state
- [ ] Pending approvals count in the top bar, linking to Approvals
- [ ] Badge with the pending count on the Approvals menu item
- [ ] Live data freshness ("refreshed 2 min ago") and a Refresh button, with a visible failure message
- [ ] Light, dark and follow-the-system theme
- [ ] Mobile menu (open, close, focus kept inside)
- [ ] Menu remembers which sections were left open
- [ ] Opening a page opens its menu section
- [ ] Crash reporting (Sentry) · Old: `app/crashReporting.ts`
- [ ] Pages load on demand (code split) with a page error boundary · Old: `app/lazyPage.tsx`, `PageError.tsx`
- [ ] Every list has loading, empty, error and permission-denied states

### Demo mode
- [ ] Runs with no backend on generated sample data (for demos and tests) · Old: `data/seed.ts`, `store.ts`
- [ ] In demo mode, a role picker switches between the six roles
- [ ] "Clear demo world" · Data: `clearDemoWorld`

---

## 1. Today

### Dashboard (`/`) · Old: `pages/Dashboard.tsx`

> **2026-10-04: built in the new design** (`src/pages/Dashboard.tsx`, `TodayRoles.tsx`,
> `src/live/dashboard.ts`, `src/live/home.ts`). Owner, admin and management see the field view;
> HR, Finance and IT each get their own view, redesigned around one sentence instead of four
> metric tiles. Setup checklist with "Not now" stored on the organisation
> (`dismiss_setup_step`). Range switch on the calls chart (last 20 working days, this month, last
> month). Checked on the demo company at 1440, 1280, 1024 and 390, light and dark, for all four
> views. Not yet run against the live testbed. Dropped from the old IT view: "MFA enabled" (the
> database does not record it; the old figure was always zero) and the hard-coded "6 mobile
> devices" (now read from `employees.last_device_id`). Admin now sees the owner's field view
> instead of the IT view.
- [ ] First-run setup checklist, in order, with progress and "Not now" per step · Data: `dismissedSetupSteps`, `dismissSetupStep`
  1. Name the roles in your company
  2. Give your office access
  3. Set up your geography
  4. Add your managers (named by the company's own role)
  5. Add your field people (named by the company's own role)
  6. Check everybody reports to somebody
  7. Give them phone logins
- [ ] Owner / Admin / Management view:
  - [ ] Field active today, planned calls today, calls completed, pending approvals
  - [ ] Next actions
  - [ ] Sales this month, target achievement, active clients, new clients added
  - [ ] Field activity, last 21 days (chart) with a month range switch
  - [ ] Target vs sales, manager-wise (chart)
  - [ ] Top and low performers
  - [ ] Needs attention: low call frequency, no field activity, GPS not reporting
- [ ] HR view: headcount, present today, leave requests, documents expiring; leave awaiting a decision; documents expiring soon
- [ ] Finance view: claims pending, approved this cycle, average per rep, daily allowance; claims by state; by category
- [ ] IT view: system users, MFA enabled, mobile devices, audit entries; recent changes; data freshness

### Attention (`/attention`) · Old: `pages/Attention.tsx` · Data: `pullAttention`

> **2026-10-04: built in the new design** (`src/pages/Attention.tsx`). Reads the same list as
> the Dashboard (`src/live/dashboard.ts`: `fake_location_attempts`, mocked visits, RPC
> `travel_exceptions`, unfinished visits, quiet today, silent for a week, no GPS, out of radius,
> client master gaps) plus the decisions waiting from the approvals store. Checked on demo data
> at 1440, 1024 and 390; not yet run against the live testbed, so boxes stay unticked. Action
> links to a person's day go to Field, which is not rebuilt yet.
- [ ] Ranked list of exceptions, critical first, each with a reason and an action link
- [ ] Phone reported a simulated (mocked) location during a visit → opens that day
- [ ] Journeys that do not add up (too fast, identical position, clock ran backwards) · Data: RPC `travel_exceptions`
- [ ] Decisions waiting
- [ ] Clients that need fixing in the master (no location, no owner)
- [ ] "Nothing needs you" empty state

### Approvals (`/approvals`) · Old: `pages/Approvals.tsx`

> **2026-10-04: built in the new design on demo data** (`src/pages/Approvals.tsx`,
> `ApprovalsDecided.tsx`, `src/data/approvals.ts`). Boxes stay unticked until it runs on
> the live backend. Added beyond the old console: grouped by person (oldest wait first),
> expense claims split into days above the allowance (shown first) and routine days
> (approved in one go), orders above the stockist's discount slab and tour months with
> unplanned days marked to look at, approve-all with a summary that names what is
> flagged, common reject reasons, a Decided history, and one call per kind
> (`decide_expenses`, `decide_orders`) so each person gets one message.
- [ ] One queue for expenses, leave, tour plans and orders, filter by kind
- [ ] Figures: waiting, value, older than 5 days, decided this session
- [ ] Each row: employee, request, summary, value, submitted, overdue flag
- [ ] Open the underlying record
- [ ] Approve
- [ ] Reject with a required reason
- [ ] Data: `decideExpense`, `decideLeave`, `decideTour`, `decideOrder`; reads `pullExpenses`, `pullLeave`, `pullTourPlans`, `pullOrders`, `pullNotifications`
- [ ] "Nothing is waiting" empty state

---

## 2. Field

> **2026-10-04: the Field section is built in the new design** (`src/pages/field/`,
> `src/live/field.ts`): Activity, a person's day (timeline, map from captured positions only,
> call drawer with location evidence, call report, products, prescription audit and signed
> photo links), Day plans, Tour plans (with approve and send back through `decide_tour`, and a
> month calendar) and Coverage. Checked on the demo company at 1440, 1280, 1024 and 390. Not yet
> run against the live testbed, so the boxes stay unticked.

### Field activity (`/field`) · Old: `pages/Field.tsx` `FieldActivity`
- [ ] Every field person for a date: planned, completed, missed, verification
- [ ] Search by name, employee ID or HQ
- [ ] Filters: date, region, territory, area, HQ, manager, GPS status
- [ ] "Nobody matches these filters" state

### A person's day (`/field/:employeeId/:date`) · Old: `pages/Field.tsx` `FieldDay`
- [ ] Day plan: filed or not filed
- [ ] Every call in order: client, purpose, planned or unplanned, verified, out of range, mocked location, missed
- [ ] Map of visit locations, open full size
- [ ] Location evidence per call: captured position, distance, fence, verdict
- [ ] Call report: products, samples, promotional material, feedback, next visit
- [ ] Prescription audit per call: product, ours, theirs, competitor
- [ ] Photos taken at the call (signed URLs) · Data: storage `createSignedUrls`
- [ ] "No calls recorded", "No positions to plot", "No such employee" states

### Day plans (`/dayplans`) · Old: `pages/Planning.tsx` `DayPlans` · Data: `pullDayPlans`
- [ ] Declared, calls planned, completed, with an address
- [ ] Per person per date; no day plan, Sunday or holiday, planned working day

### Tour plans (`/tours`) · Old: `pages/Planning.tsx` `TourPlans` · Data: `pullTourPlans`
- [ ] Plans in scope, approved, waiting on you, not submittable
- [ ] Months that cannot be submitted, and why
- [ ] Tour plan detail: each day, work type, planned clients, status
- [ ] "Working day, still unplanned", "Nothing planned" states

### Coverage (`/coverage`) · Old: `pages/Insight.tsx` `Coverage`
- [ ] Areas in scope, quiet last week, untouched all period, calls plotted
- [ ] Area by week grid
- [ ] Occasions worth a call (client birthdays and anniversaries in the next month)

> **2026-10-04: the Clients section is built in the new design** (`src/pages/clients/`,
> `src/live/clients.ts`): all clients with search and filters, add and edit (one form), listing
> and retiring, specialties, sheet download and import (dry run first, the old console's rules
> and file readers carried over unchanged), a client's record, data quality and complaints
> (assign, resolve with a written resolution, close, reopen). Checked on the demo company at
> 1440, 1280 and 390, light and dark; add, edit and retire run end to end on the demo.
> **Fixed against the old console:** editing a client there sends an empty position to
> `update_client`, which erases the registered location for office roles; the new console
> sends the position on record back unchanged. Not yet run against the live testbed.

### Clients (`/clients`) · Old: `pages/Clients.tsx`
- [ ] Client list with search by name, filter by type and listing
- [ ] Add a client (doctor, hospital, chemist, stockist), with specialty, area, owner · Data: `createClient`
- [ ] Edit a client · Data: `updateClient`
- [ ] Listed / unlisted switch · Data: `setClientListing`
- [ ] Specialties list: add, delete · Data: `clientSpecialties`, `createClientSpecialty`, `deleteClientSpecialty`
- [ ] Import clients from a spreadsheet · Data: `importClients`
- [ ] Download the client sheet · Data: `clientSheet`
- [ ] Client detail (`/clients/:id`): total visits, orders, category, location, recent visits, orders

### Client data quality (`/clients/quality`) · Old: `pages/Clients.tsx` `DataQuality`
- [ ] Probable duplicates
- [ ] No registered location
- [ ] No assigned employee
- [ ] Not visited in 30 days
- [ ] Unlisted but marked inactive
- [ ] "Nothing to fix" state

### Complaints (`/complaints`) · Old: `pages/Support.tsx` `Complaints` · Data: `pullComplaints`, `decideComplaint`
- [ ] List with status filter and counts
- [ ] Decide or resolve a complaint
- [ ] "Nobody owns these" (unassigned complaints)

---

## 3. Sales

> **2026-10-04: the Sales section is built in the new design** (`src/pages/sales/`,
> `src/live/sales.ts`): Sales (month picker, twelve months against target, by person with a
> drawer per person), Orders (status, stockist and search; lines, totals and the approval trail;
> approve and reject through `decide_orders`), Targets (six months and next, assign to one
> person or everyone through `assign_target`), Prescription audit, Products (add, edit, on sale,
> draft, retired, sheet), Stockists (add, edit, on and off the list) and Stock (record, write off).
> **Corrected against the old console:** its "secondary sales" was 80% of primary, a figure
> nobody recorded; here secondary sales are the approved field orders the database records with
> source `order`. Fulfilment is the order's own status (approved or fulfilled); the old
> console's accepted and dispatched stages exist only in its demo data. Checked on the demo
> company at 1440 and 390. Not yet run against the live testbed.

### Sales (`/sales`) · Old: `pages/Commerce.tsx` `Sales` · Data: `pullSales`, `pullTargets`
- [ ] Primary sales, secondary sales, target, achievement
- [ ] Twelve months against target (chart)
- [ ] By employee, click to drill in

### Orders (`/orders`) · Old: `pages/Commerce.tsx` `Orders` · Data: `pullOrders`
- [ ] Order list with filters: approval status, fulfilment, stockist
- [ ] Order lines, tax and totals

### Targets (`/targets`) · Old: `pages/Commerce.tsx` `Targets` · Data: `assignTarget`
- [ ] Employee by month achievement grid
- [ ] Assign the same target to every field rep for one product and one month

### Products (`/products`) · Old: `pages/Commerce.tsx` `Products`
- [ ] Product master: code, name, pack, prices
- [ ] Add a product (pack size fixed after creation) · Data: `createProduct`
- [ ] Edit a product · Data: `updateProduct`
- [ ] Activate or retire · Data: `setProductStatus`
- [ ] Import products · Data: `importProducts`; download sheet · Data: `productSheet`

### Stockists (`/stockists`) · Old: `pages/Commerce.tsx` `Stockists`
- [ ] Figures: on the phone, off the list, orders with no stockist
- [ ] Filter by status and territory
- [ ] Add a stockist (code fixed after creation): name, contact, phone, email, GSTIN, city, state, address · Data: `createStockist`
- [ ] Edit, and take on or off the list · Data: `updateStockist`, `setStockistStatus`

### Prescription audit (`/rcpa`) · Old: `pages/Insight.tsx` `Rcpa`
- [ ] Our share, products behind, readings, calls carrying an audit
- [ ] Share by product; units against us by competitor
- [ ] "No audits recorded", "No competitor named" states

### Stock (`/stock`) · Old: `pages/HrConfig.tsx` `Stock` · Data: `pullStock`, `pullStockBatches`, `recordStock`
- [ ] Batches, units in the market, value at risk, stock value
- [ ] Stock in: record a batch arriving; a negative figure writes stock off

---

## 4. People

> **2026-10-04: the Team section is built in the new design** (`src/pages/team/`,
> `src/live/team.ts`): People (search, role, manager, territory and joined filters, who has no
> login), a person's record in five tabs (the month, field work, sales and orders, HR and pay,
> changes) with edit, change manager, hand over clients, mark as left and reopen, documents
> (upload with category and expiry, open, remove), Add a person (who they are, where they work,
> who they report to; a draft is kept in the browser), Managers and a manager's page, the Org
> chart (tree, move one person, move a whole team after a read-back), Attendance (month grid,
> each day's reason on hover and to screen readers), Leave (decide, with a reason required to
> decline) and Tasks (assign, open, past their date, done).
> **Not carried over, for the owner to decide:** the old onboarding's Leave, Salary and Expenses
> steps and its leave policies have no table in the shared database (checked: only
> `leave_requests` exists), so nothing was being saved; the new form says so instead of
> pretending. Dotted-line reporting, alternate mobile, address, areas and home cluster are not
> in `create_employee` either. Checked on the demo company at 1440, 1280 (dark), 1024 and 390,
> and the flows (decide leave, assign a task, add a person, change manager, mark as left, move
> a team) were run in the browser. Not yet run against the live testbed.

### Employees (`/people`) · Old: `pages/People.tsx` `People`
- [ ] Employee list with search by name or ID
- [ ] Filters: role, manager, joined, territory, band, level
- [ ] Change manager from the row · Data: `reassignManager`
- [ ] Replace an employee (hand their clients to someone else) · Data: `handOverClients`
- [ ] Deactivate an employee, with a reason ("Mark as left") · Data: `setEmployeeStatus`

### Employee record (`/people/:id`) · Old: `pages/People.tsx` `Employee360`
- [ ] Sections: Overview; Field (field activity, clients, attendance); Commercial (sales, targets, orders); HR and finance (leave, expenses, documents); Administration (audit)
- [ ] Overview for a month: achieved, still to sell, calls completed, claimed
- [ ] Days: working, in the field, leave, non-field
- [ ] Calls: planned, completed, missed; who was seen (clients, hospitals)
- [ ] Orders and order value; primary and secondary sales; sales against target over 12 months
- [ ] Recent calls
- [ ] Edit the employee · Data: `updateEmployee`
- [ ] Documents: list, open, upload (with category and expiry date), remove · Data: `pullDocuments`, `uploadEmployeeDocument`, `removeEmployeeDocument`, `signedUrlFor`
- [ ] Salary panel (only for roles that may see salary)
- [ ] Audit of changes to this person

### Add an employee (`/people/new`) · Old: `pages/Onboarding.tsx` `NewEmployee` · Data: `createEmployee`, `inviteFieldEmployee`
- [ ] Seven steps: Identity, Posting, Reporting, Leave, Salary, Expenses, Documents
- [ ] Identity: name, employee code, role (the company's own), joining date, department, blood group, email (required, logins arrive by email), mobile, alternate mobile, address
- [ ] Posting: region, territory, headquarters, areas, home cluster
- [ ] Reporting: reporting manager, dotted line
- [ ] Expenses: daily allowance, bill required above, monthly ceiling
- [ ] Monthly pay preview: gross, net
- [ ] "Set up your geography first" when there is none
- [ ] Half-finished joiners (drafts) list

### Manager-wise view (`/people/managers`, `/people/managers/:id`) · Old: `pages/ManagerView.tsx`
- [ ] Managers, people managed, largest team, unmanaged
- [ ] Expand a manager to see the team
- [ ] Manager page: total calls, clients added, listed, unlisted, field work days, leaves, expenses, target, sales, target vs sales, team
- [ ] Monthly sales trend; top performers and weakest in the team; the team figure by figure

### Attendance (`/attendance`) · Old: `pages/PeopleOps.tsx` `Attendance` · Data: `pullAttendance`
- [ ] Present today, on approved leave, company holidays, week off
- [ ] Month grid per person (every day, the reason each day is what it is)

### Leave (`/leave`) · Old: `pages/PeopleOps.tsx` `Leave` · Data: `pullLeave`, `decideLeave`, `applyForLeave`
- [ ] Requests from the phone, with status
- [ ] Leave policies

> **2026-10-04: Expenses and pay is built in the new design** (`src/pages/money/`,
> `src/live/money.ts`). Expense claims: each person's month day by day against their day plans,
> holidays and the week off, flags for days claimed with no day plan and days above the bill
> threshold with no bill, bills opened from the receipts bucket, and a claim decided through
> `decide_expenses` (reject needs a reason). Payroll: the month's payslips with the change from
> last month, release one through `release_payslip` with an optional PDF in the documents
> bucket's payslips folder (the folder the phone may read), and the month as a sheet.
> **Corrected against the old console:** its payslip gross, basic and deductions were made up from
> the net figure (62% and 12%); the database stores only the net pay and the PDF, so only those
> are shown. Its "release all open" released drafts that exist only in its demo data; live there
> are no drafts to release. Checked on the demo company at 1440, 1280 (dark), 1024 and 390, flows
> run in the browser. Not yet run against the live testbed.

### Expenses (`/expenses`) · Old: `pages/PeopleOps.tsx` `Expenses` · Data: `pullExpenses`, `decideExpense`
- [ ] Month claims: claims, total claimed, awaiting decision, daily allowance
- [ ] Claim detail: every day, worked, no intimation, receipts, status

### Payroll (`/payroll`) · Old: `pages/Bridge.tsx` `Payroll` · Data: `pullPayslips`, `releasePayslip`
> **2026-10-06: pay is built properly** (migrations 0106 to 0109; `src/live/pay.ts`,
> `src/pages/money/{Payroll,Salaries,SalaryDrawer}.tsx`, `src/pages/settings/{PaySetup,Company}.tsx`,
> `src/pages/team/PersonPay.tsx`). The database works out each month (`payroll_for`): the salary in
> force, loss of pay from attendance (days with nothing declared, unpaid leave, days before
> joining), earnings pro-rated, PF on the basic paid. HR corrects loss of pay with a reason, adds
> one-off lines, and **Generate and release** draws the PDF (company name, address, GSTIN, PAN,
> logo; every line; net in words), stores it where the phone reads payslips, and notifies the
> person. Someone paid outside Mr Sales still gets an uploaded PDF. Pay is seen by owner, HR and
> finance only, enforced in the database (admin is refused). Checked live on Testbed as HR, finance
> and admin; demo and e2e tests cover every flow.
- [x] Payslips, released, net paid, loss of pay for a month
- [x] Release a payslip, release all open
- [x] Download
- [x] Salaries: each person's salary split into basic and components, dated revisions with history
- [x] A person's own expense rule over their role's and the company's (0109), and their travel rates
- [x] Company details and logo printed on payslips (`/settings/company`)

### Assigned tasks (`/tasks`) · Old: `pages/Bridge.tsx` `AssignedTasks` · Data: `pullTasks`, `assignTask`
- [ ] Open, not started, past their date, completed
- [ ] Assign a task: one job, one person, a due date

### Field ownership (`/ownership`) · Old: `pages/Bridge.tsx` `FieldOwnershipPage`
- [ ] Who owns which field (data ownership rules)

### HR configuration (`/hr`) · Old: `pages/HrConfig.tsx` `HrConfiguration`
- [ ] Tabs: Roles, Leave, Salary, Holidays, Expenses
- [ ] Roles: mobile roles, depth of the tree, web roles, nobody above them
- [ ] Leave types
- [x] Standard salary structure: basic, gross, deductions, net (now components and a structure per role, in Pay and expenses)
- [ ] Holidays: fixed, optional, falling on a Sunday; add or edit a holiday · Data: `pullHolidays`, `upsertHoliday`
- [x] Expense rules (per role in Pay and expenses; per person on their record)

---

## 5. Broadcasts

> **2026-10-04: Share with field is built** (`src/pages/share/`, `src/live/share.ts`): resources
> by where they sit on the phone (send, replace as a new version, take off, delete for good),
> surveys (the open question, the rating spread, answers in the client's words; start, close,
> reopen) and sent notifications (one message to many phones is one line, with who read it).
> Survey answers are read from the keys the phone writes (`rating`, `feedback`, `remarks`,
> `client_name`); the old console's pull read the same. Checked on demo data at all widths, flows
> run. Not yet run against the live testbed.

### Resources (`/resources`) · Old: `pages/Support.tsx` `Resources`
- [ ] On the phones, superseded, archived, last published
- [ ] Upload a resource (title, description, category, file type and size checks) · Data: `uploadResource`, `resourceFileProblem`
- [ ] Open a file · Data: `resourceFileUrl`
- [ ] Take it off every phone (archive) · Data: `archiveResource`
- [ ] Delete for good · Data: `deleteResource`

### Surveys (`/surveys`) · Old: `pages/HrConfig.tsx` `Surveys` · Data: `surveyCampaigns`, `createSurvey`, `setSurveyActive`, `pullSurveys`
- [ ] Create a campaign, open or close it
- [ ] Responses: count, average score, clients covered, unscored, answers in the client's words

### Notifications sent (`/notifications`) · Old: `pages/Bridge.tsx` `Notifications` · Data: `pullNotifications`
- [ ] Events, decisions, people reached; each notification on record

---

## 6. Reports

> **2026-10-04: Reports and Downloads are built** (`src/pages/reports/`, `src/live/reports.ts`):
> eleven reports and seven sheets from one engine (a month, whose data: everyone, a manager's
> whole line or one person), the table on screen and the sheet being the same rows, with totals.
> Every download is recorded through `request_export` and `complete_export`, with a copy in
> `documents/{org}/exports/{user}/`, as the old console did.
> **Corrected against the old console:** its report catalogue showed the same management table
> under every report name, and its Downloads wrote a staff list for any sheet it had no builder
> for (DCR, expenses, tour plan, overview). Each report and sheet here reads its own records.
> Checked on demo data at all widths, downloads run in the browser. Not yet run against the live
> testbed.

### Reports (`/reports`) · Old: `pages/Evidence.tsx` `ReportCenter`
- [ ] One filter (employee, period), one table, one export path
- [ ] DCR, Daily activity, Visit report, Call adherence
- [ ] Sales, Target vs sales, Product sales
- [ ] Attendance, Leave
- [ ] Expense report
- [ ] Client report, Order report
- [ ] Management overview (planned, completed, missed, adherence, unverified, sales, achievement, expenses by person)
- [ ] Export a report

### Exports (`/exports`) · Old: `pages/Evidence.tsx` `ExportCenter` · Data: `requestExport`, `completeExport`, `pullExportJobs`, `uploadExportCsv`, `signedUrlFor`
- [ ] Choose whose data and the month
- [ ] Sheets: DCR, Expenses, Tour plan, Client list, Sales, Orders, Attendance (in the office's own workbook shape)
- [ ] Request, recent exports, download

---

## 7. Setup

> **2026-10-04: Settings is built in the new design** (`src/pages/settings/`, `src/live/settings.ts`).
> The organisation tree and hierarchy are Team, Org chart (built with the Team section). Company
> rules (allowance, bill threshold, week off, visit check off, warn or block, and radius, read
> back before saving through `update_org_settings`); geography (regions, territories with HQ,
> areas and clusters, who is posted where, add and remove with the database's in-use refusal);
> roles (add, edit, retire, offer again, delete when nobody holds it); logins and access (a phone
> login for each person through `set_field_login` and the `field-password-reset` email, office
> logins invited through `invite-user`, switch off and on with a reason through
> `set_login_status`, only the roles the actor may grant); HR rules (holidays through
> `upsert_holiday`, leave types in use); field ownership (the old console's reference, unchanged);
> the audit log (by period, person and words).
> **For the owner:** `update_org_settings` checks no role in the database, so any signed-in office
> user could change the company rules; the console offers the change to owner and admin only.
> There is no database function to delete a holiday or a region, so neither is offered. Leave
> allowances, salary structures and per-role expense rules have no table; the old console's HR
> configuration showed demo values for them, and the new one says they are not stored.
> Checked on demo data at 1440, 1024 (dark) and 390, flows run in the browser. Not yet run against
> the live testbed.

### Organisation tree (`/org`) · Old: `pages/Hierarchy.tsx` `OrgTree`
- [ ] Everyone in scope as a tree; reporting is dated, so a change leaves a trail

### Hierarchy (`/hierarchy`) · Old: `pages/Hierarchy.tsx` `Hierarchy` · Data: `reassignManager`
- [ ] Area managers, largest team, managers with nobody, reporting to nobody
- [ ] Move people between managers on a board, review, confirm with a reason ("Nothing is saved until this is confirmed")
- [ ] Move everyone from one manager at once

### Roles (`/roles`) · Old: `pages/Roles.tsx`
- [ ] The company's own role names and which app each opens (field or manager)
- [ ] Add, edit, activate or deactivate, delete a role · Data: `createDesignation`, `updateDesignation`, `setDesignationActive`, `deleteDesignation`

### Geography (`/geo`) · Old: `pages/Admin.tsx` `Geography`
- [ ] The tree: regions, territories, areas, clusters
- [ ] Add a region, territory, area, cluster · Data: `createRegion`, `createTerritory`, `createArea`, `createCluster`
- [ ] Delete a territory, area, cluster · Data: `deleteTerritory`, `deleteArea`, `deleteCluster`
- [ ] Pick a territory to see who is assigned

### Users (`/users`, `/users/new`) · Old: `pages/Admin.tsx` `Users`, `pages/Logins.tsx`, `pages/Onboarding.tsx` `NewUser`
- [ ] System users with login status; suspend or restore with a reason · Data: `pullSystemUsers`, `setLoginStatus`
- [ ] Invite an office user: name, work email, role, linked employee, data scope, modules · Data: `inviteUser`
- [ ] Phone logins for the roster: create, reset, email a password reset · Data: `setFieldLogin`, `emailFieldPasswordReset`
- [ ] Who may manage logins is checked · Data: `canManageLogins`, `GRANTABLE_ROLES`

### Configuration (`/config`) · Old: `pages/Admin.tsx` `Configuration` · Data: `updateOrgSettings`
- [ ] Settings grouped, with filters: all, not yet read by the app, fixed in V1
- [ ] Organisation settings saved to the live project: daily allowance, week-off weekday, bill threshold, geo-fence policy (off, warn, strict), geo-fence radius

### Audit log (`/audit`) · Old: `pages/Admin.tsx` `AuditLog` · Data: `pullAudit`
- [ ] Append-only list, filter by actor; no edit, no delete, owner included

---

## 8. From Mr Sales

> **2026-10-04: Help and Plan and billing are built** (`src/pages/account/Account.tsx`): requests
> to the Mr Sales team (raise, read the conversation, reply) through the platform ticket
> functions, and the plan, field seats used and invoices through `my_org_access` and
> `my_invoices`. Checked on demo data; not yet run against the live testbed.

### Help (`/help`) · Old: `pages/MrSales.tsx` `HelpPage` · Data: `myPlatformTickets`, `myPlatformTicketThread`, `raisePlatformTicket`, `replyPlatformTicket`
- [ ] Open, waiting for you, resolved, urgent answer time
- [ ] Ticket list with status
- [ ] Raise a ticket (subject, detail, urgency)
- [ ] Ticket thread, reply

### Plan and billing (`/billing`) · Old: `pages/MrSales.tsx` `BillingPage` · Data: `myPlan`, `myInvoices`
- [ ] Plan, field seats used, to pay, overdue
- [ ] Invoices with status (due, overdue, paid, cancelled)

---

## 9. Known gaps in the old console (decide: build in the new one, or leave)

Shown in the old console as "not built yet" or missing altogether.

> **2026-10-04, where the new console stands on each:** fake-location attempts are listed and
> warned about (Field activity, a person's day, Today and Attention). The place a phone was last
> seen is shown by name from `employees.last_place` (Field activity for today, and a person's
> record); a visit's own position still has no name in the database, only coordinates and the day
> plan's declared address. Joiner drafts are kept and reopened from People. Every report the old
> console marked "v1" is built from real records. Leave policies, salary structures and expense
> rules per role have no table, so they wait on an owner decision and a backend change. Payslip
> PDFs are attached when released, not generated.
- [ ] Fake-location attempts list and warning (the phone app has it since 2026-10-03; the console does not)
- [ ] Place names instead of coordinates on a person's day (the app has `PlaceNames`)
- [ ] Saved joiner drafts cannot be reopened
- [x] Leave policies are not editable (built 2026-10-06)
- [x] Salary structures are not built (built 2026-10-06)
- [x] Expense rules are not editable (built 2026-10-06)
- [x] Payslip files are not generated (built 2026-10-06)
- [ ] Some reports are marked "v1" (adherence, product sales, attendance, leave, client, order)

---

## 10. Tests carried over

The old console's end-to-end tests (`Mr_Sales_Web/e2e/`) and what each proves. Each needs
an equivalent in the new console before the switch.

> **2026-10-04: equivalents written, running on demo data** (`e2e/`, `npm run e2e`, 25 tests, all
> passing): every page for every role and the "not open to your role" page for the rest, no
> sideways scroll at 390, add a person end to end, roles (add, duplicate refused, retire, delete,
> held role kept), phone login (mismatch refused, given), switching a login off with a reason, an
> HR document with its expiry, a staffed territory and the in-use refusal, leave, clients, orders,
> approvals, claims, payslips, resources, surveys, reports downloading the sheet on screen, and
> company rules (read back, refused radius, read-only for finance). They do not yet run against
> Testbed Pharma, and `seam.spec.ts` (console and phone agree) needs the phone, so neither box is
> ticked.
- [ ] `every-page.spec.ts`: every route opens for every role it is granted to
- [ ] `roles.spec.ts`: the permission matrix
- [ ] `employee.spec.ts`: add an employee end to end
- [ ] `documents-and-coverage.spec.ts`: upload an HR document, coverage figures
- [ ] `phone-login.spec.ts`: give a field person a phone login
- [ ] `seam.spec.ts`: console and phone agree on the same records

---

## 11. New in the rebuild: Phases 5 to 7 (6 October 2026)

Not in the old console; built from `NEXT_WORK.md`. Each works on the demo company and is
covered by a test. None is ticked yet: each needs its migration applied to the live
database first (`Mr_Sales_Console/supabase/migrations`, see "Left for the owner" in
`NEXT_WORK.md`), then a run against Testbed Pharma.

### Import people (Team, People, "Import from a sheet") · Data: `import_people` (0112)
- [ ] Template download, CSV or Excel back · not live: 0112 not applied
- [ ] Every problem by row and column, nothing written until all pass · not live: 0112 not applied
- [ ] Adds new codes, updates existing ones, manager lines from the sheet, basic salary for owner and HR · not live: 0112 not applied
- [ ] Refuses beyond the plan's seats, with the numbers · not live: 0112 not applied
- [ ] Sends the new people's logins one by one afterwards · uses `set_field_login` and `field-password-reset`, both live; not run live from here

### Your account (`/account`) · Data: Supabase Auth only, no migration
- [ ] Who you are, and the name used in Messages (`set_my_chat_name`, live) · not signed in live from this session
- [ ] Change the password, checked against the current one · not signed in live from this session
- [ ] Two-step sign-in with an authenticator app, on and off, and the code at sign-in · needs MFA (TOTP) switched on in the Supabase project; not run live
- [ ] Sign out every other device · not run live
- [ ] The last 20 changes made by this login · not run live
- Dropped on purpose: whether each office login has two-step sign-in on, on Logins and access. Supabase gives a login only its own factors, so the console cannot know another login's without a server function; it is left out rather than guessed.

### Announcements (`/share/announcements`) · Data: `send_announcement`, `remind_announcement` (0113)
- [ ] The sent list with who each went to and read by n of m · not live: 0113 not applied
- [ ] Who has not read it, by name, and a reminder to them only · not live: 0113 not applied
- [ ] Write to everyone, a team, a role or a territory, with a pin date and a phone preview; a manager to their own team only · not live: 0113 not applied
- [ ] On the phone: a pinned announcement on Home, the list, read when opened · not built: needs the phone repository and Flutter (see `NEXT_WORK.md`)
