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
- [ ] Salary visible only to Owner, HR and Finance (`canSeeSalary`)
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

### Expenses (`/expenses`) · Old: `pages/PeopleOps.tsx` `Expenses` · Data: `pullExpenses`, `decideExpense`
- [ ] Month claims: claims, total claimed, awaiting decision, daily allowance
- [ ] Claim detail: every day, worked, no intimation, receipts, status

### Payroll (`/payroll`) · Old: `pages/Bridge.tsx` `Payroll` · Data: `pullPayslips`, `releasePayslip`
- [ ] Payslips, released, net paid, loss of pay for a month
- [ ] Release a payslip, release all open
- [ ] Download

### Assigned tasks (`/tasks`) · Old: `pages/Bridge.tsx` `AssignedTasks` · Data: `pullTasks`, `assignTask`
- [ ] Open, not started, past their date, completed
- [ ] Assign a task: one job, one person, a due date

### Field ownership (`/ownership`) · Old: `pages/Bridge.tsx` `FieldOwnershipPage`
- [ ] Who owns which field (data ownership rules)

### HR configuration (`/hr`) · Old: `pages/HrConfig.tsx` `HrConfiguration`
- [ ] Tabs: Roles, Leave, Salary, Holidays, Expenses
- [ ] Roles: mobile roles, depth of the tree, web roles, nobody above them
- [ ] Leave types
- [ ] Standard salary structure: basic, gross, deductions, net
- [ ] Holidays: fixed, optional, falling on a Sunday; add or edit a holiday · Data: `pullHolidays`, `upsertHoliday`
- [ ] Expense rules

---

## 5. Broadcasts

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
- [ ] Fake-location attempts list and warning (the phone app has it since 2026-10-03; the console does not)
- [ ] Place names instead of coordinates on a person's day (the app has `PlaceNames`)
- [ ] Saved joiner drafts cannot be reopened
- [ ] Leave policies are not editable
- [ ] Salary structures are not built
- [ ] Expense rules are not editable
- [ ] Payslip files are not generated
- [ ] Some reports are marked "v1" (adherence, product sales, attendance, leave, client, order)

---

## 10. Tests carried over

The old console's end-to-end tests (`Mr_Sales_Web/e2e/`) and what each proves. Each needs
an equivalent in the new console before the switch.
- [ ] `every-page.spec.ts`: every route opens for every role it is granted to
- [ ] `roles.spec.ts`: the permission matrix
- [ ] `employee.spec.ts`: add an employee end to end
- [ ] `documents-and-coverage.spec.ts`: upload an HR document, coverage figures
- [ ] `phone-login.spec.ts`: give a field person a phone login
- [ ] `seam.spec.ts`: console and phone agree on the same records
