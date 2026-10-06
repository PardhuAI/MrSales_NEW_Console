# Next work: finishing the console (Phases 5 to 8)

Written 6 October 2026, for a cloud session to carry on without stopping. Phases 1 to 4
of `FINAL_BUILD_PLAN.md` are built, tested and pushed (see "Done so far" at the end).
Work through the phases below **in order**, commit after each one, and keep going until
the list is finished. Where a step needs something a cloud session cannot do (a live
password, the Android build), write it down under "Left for the owner" at the bottom of
this file and move on.

---

## 0. Before writing any code

**Read these, every time, in this order.** They are the rules; a screen that breaks one
does not ship.

1. `CLAUDE.md` (this repo): the hard rules. One accent colour, only for actions, links,
   the selection and focus. Status colours only beside the word they mean. No em or en
   dashes in the UI. Sentence case. No grid of identical stat cards, no bento, no
   gradients, no glass, no emoji, no Lucide icons, no Inter, Geist or Space Grotesk.
2. `DESIGN.md`: the style lock (direction D: Studio colours, Schibsted Grotesk), the
   section structure, and the owner decisions in section 7, which win over everything.
3. `.claude/skills/console-design/SKILL.md` before any UI, `console-motion` before any
   animation, `console-review` before calling a screen done.
4. `FEATURE_CHECKLIST.md`: tick an item only when it works.

**Be creative inside the rules.** The owner wants it "perfect" and gave full freedom on
how; the rules decide what it may look like, not how good it can be. For every screen,
write the five-line plan from `console-design` first (the question, the hero, density,
states, the generic default you are avoiding), then build the best version of that,
not the first one that works.

**Match what is already there.** Copy the patterns of the screens built in Phases 1 to 4,
not something new:

| Need | Use | Example to copy |
|---|---|---|
| A page that loads data | `useResource(key, loader)` + `LoadError` / `Loading` / `Empty` | `src/pages/money/Salaries.tsx` |
| The line under the title | `<Summary aside={<Freshness …/>}>` with the one figure in `<strong>` | `src/pages/money/Payroll.tsx` |
| Search and filters | `Toolbar`, `SearchBox`, `Segmented` (radio buttons, two or three options) | `Payroll.tsx` |
| A working list | `table.table` in `.table-wrap`, numbers in `td.num`, row action as a text link | `src/pages/team/PeopleOps.tsx` (leave balances) |
| Editing | a `Drawer` with a one-column `form`, `Field`, `useFocusFirstError`, errors in words | `src/pages/settings/PaySetup.tsx` |
| Confirming something consequential | `Confirm`, the button names the action | `Payroll.tsx` bulk release |
| A message after an action | `Notice` | everywhere |
| Statuses | `Pill` with `good`, `warning`, `critical` or neutral, always a word; **never the accent** | |
| Styles | tokens from `src/styles/tokens.css` only; new rules in the section's CSS file | `src/styles/pay.css` |

**Things that bite (learned the hard way in Phases 1 to 4):**

- `invalidate()` treats a key as a prefix **only if it ends with `:`**. Use
  `invalidate('team:person:')`, not `invalidate('team:person')`.
- `Segmented` options are `role="radio"`; in Playwright use `getByRole('radio', …)`.
- `getByRole('button', { name })` matches substrings; pass `exact: true` when another
  button contains the same words.
- A hidden file input needs an `aria-label`, or the accessibility test fails.
- Every new page goes in `src/app/nav.ts` (with search keywords) and `src/App.tsx`; a new
  module name must be added to `GRANTS` in **both** `src/app/access.ts` and
  `e2e/every-page.spec.ts`.
- The demo (`npm run dev` with no Supabase env, or the e2e tests) runs on the in-memory
  database in `src/demo/fakedb/`. **Every new table needs seed rows and every new RPC an
  in-memory version** (see `src/demo/fakedb/pay.ts`), or the page breaks in the demo and
  the tests.
- Run `npm run check` (rules, types, every Playwright test including the accessibility
  scan of every page in light and dark) before every commit. It must pass.

**Database changes** live in the other repo, `PardhuAI/Mr_Sales_Console`
(`Mr_Sales_Web/`), under `supabase/migrations/`. The next free number is **0112**.

- Write every migration so it can run twice (`create … if not exists`, `create or replace`,
  `drop policy if exists`).
- Write functions in `plpgsql`, not `sql`, when they touch anything Supabase-only; the CI
  check runs on plain Postgres with no `storage` or `platform` schema. Wrap storage
  policies in `do $$ begin if to_regclass('storage.objects') is null then return; end if; … end $$;`
  (see `0110_payslip_files.sql`).
- Every `security definer` function that `authenticated` may call must be listed in
  `supabase/checks/26_definer_review.sql`, or CI fails. Helpers only policies call get
  `revoke … from authenticated`.
- Every write function: check `current_org_id()`, check the role, validate in words a
  person understands, and write an `audit_log` row.
- **Applying to the live database:** if the session has the Supabase tools for project
  `xdbhmxdaelqsazoferre`, apply the migration and test it inside `begin; … rollback;`
  acting as Testbed roles (org `4785d658-d758-4b59-9c2a-acb839b2b881` only, never a
  real customer). If it does not, commit the migration and add it to "Left for the
  owner" below: **the console must not ship a page that calls a function the live
  database does not have yet.** In that case, keep the console change on a branch
  (`phase-5-import`, etc.) and say so, rather than on `main`.

**Phone changes** live in `PardhuAI/Mr_Sales_Field_App` (`Field_Force_App/`). Flutter.
Use its own widgets (`AppCard`, `KeyValueRow`, `AppTypography`, `PrimaryButton`) so it
looks like the rest of the app. Run `flutter analyze lib` and `flutter test`. **Do not run
`dart format` on whole files**: it rewrites hundreds of unrelated lines in that repo.
Do not build an APK; one is built at the very end, by the owner's machine.

**Never** commit or print passwords, keys or emails. `NEW_CONSOLE` is a public repo.

---

## Phase 5. Bulk import of people

**The question:** "I have 40 reps in a spreadsheet; how do I get them all in without typing
each one?"

**What exists:** `invite_field_employee` (one person, used by Team → Add a person,
`src/pages/team/AddPerson.tsx`); `import_clients(p_rows jsonb, p_commit boolean)` and
`import_products` are the pattern to copy: a dry run returns every problem by row and
field, and only a clean sheet is committed, all or nothing. The client import screen is
in `src/pages/clients/ClientList.tsx`.

**Database (migration 0112_import_people.sql):**
- `import_people(p_rows jsonb, p_commit boolean)` returning
  `{ create: n, update: n, errors: [{ row, field, message }], committed: bool }`.
- Columns: employee code (required, unique in the company), name (required), role (the
  company's role name, matched case-insensitively against `designations`), department,
  territory or HQ (matched by name), reports to (an employee code, either already on the
  roster or earlier in the same sheet), joined on (date; accept `2026-04-01`,
  `01/04/2026` and `1 Apr 2026`), mobile (10 digits, may start +91), email (**required**:
  every login is delivered by email; see the memory note on onboarding), and optionally
  basic salary (owner, HR or finance only; becomes an `employee_salaries` row from the
  joining date).
- Checks per row, all reported, never stopping at the first: missing required fields,
  duplicate code in the sheet or on the roster (an existing code updates that person
  instead, as `import_clients` does with an id), unknown role or territory, a "reports
  to" that does not exist or that makes a loop, a malformed mobile or email, a joining
  date in the future by more than 90 days.
- Roles allowed: owner, admin, HR (use `require_import_role`). Seats: refuse the commit
  if new field logins would exceed the plan's `seat_limit`, with the numbers in the
  message.
- Audit one row for the import ("imported 38 people, updated 2").
- Do **not** create phone logins in the import. Logins stay a deliberate act (Logins and
  access); the result screen offers "Send logins to the 38 new people" as the next step,
  which calls the existing per-person invite once for each, with a progress line.

**Console:**
- Team → People: a secondary button "Import from a sheet" beside "Add a person" (and in
  the New menu and search: "import people", "bulk add", "upload employees").
- A drawer in three steps, the same rhythm as the client import:
  1. **Get the sheet.** "Download the template" (a CSV with the header row and one
     example row, every column named in plain words) and a file picker (CSV and XLSX;
     the console already reads sheets in `src/lib/sheet.ts`; extend it if XLSX reading
     is missing, with a small library from the allowed list).
  2. **Check.** Run the dry run and show the result as a table: one line per problem,
     row number, column, what is wrong and how to fix it ("Row 7, Reports to: no
     employee with code ASM-04. Add them above row 7 or fix the code."). Above it, one
     line: "38 people ready, 2 will be updated, 3 rows need fixing." The commit button is
     disabled until there are no problems; the file can be fixed and picked again
     without closing the drawer.
  3. **Done.** "38 people added. Their phone logins are not sent yet." with the
     "Send logins" action and a link to People filtered to the new ones.
- Demo fakedb: `import_people` with the same checks; seed nothing new.
- e2e: a sheet with two bad rows shows both problems and cannot be committed; the fixed
  sheet commits and the people appear in the list.

---

## Phase 6. Account security for office logins

**The question:** "Is my account safe, and can I change my password myself?"

**What exists:** `src/live/session.tsx` (sign in, sign out, `setPassword` for the first
password from an invite link); `src/pages/account/Account.tsx` (Help, Plan and billing);
the account menu in `src/components/Shell.tsx`.

**Console (no database change needed; Supabase Auth does it):**
- A new account page **"Your account"** (`/account`, module `help` so every role has it;
  in `ACCOUNT_PAGES` in `nav.ts`, and first in the account menu). Sections, separated by
  space and hairlines, not cards:
  - **Who you are:** name, email, role, company, as text. The display name used in
    Messages can be changed here (the RPC from migration 0101, `set_my_chat_name`).
  - **Password:** "Change your password": current password, new password, again. Check
    the current one by signing in again with it (`signInWithPassword`) before
    `auth.updateUser({ password })`; at least 10 characters; say which rule failed, in
    words. After success: "Your password is changed. Other devices stay signed in until
    you sign them out below."
  - **Two-step sign-in (authenticator app):** Supabase MFA, TOTP
    (`auth.mfa.enroll({ factorType: 'totp' })`, show the QR code and the secret as text
    for copying, then `challenge` and `verify` with the six-digit code). Show whether it
    is on; turning it off asks for a current code. At sign-in, when the account has a
    verified factor and the session is at `aal1`, ask for the code before the console
    opens (`auth.mfa.getAuthenticatorAssuranceLevel()`), on the same calm sign-in page.
    If MFA is not enabled on the Supabase project, the enrol call fails: catch it and
    say "Two-step sign-in is not switched on for Mr Sales yet", and add enabling it to
    "Left for the owner".
  - **Signed-in devices:** "Sign out everywhere else" (`auth.signOut({ scope: 'others' })`),
    with a `Confirm` that names the action.
  - **Your recent activity:** the last 20 rows of the audit log where `actor_user` is you
    (what you changed and when), so someone can see if their account was used.
- Owner only, on **Settings → Logins and access**: a line per office login saying
  whether two-step sign-in is on, if Supabase exposes it to the client; if it does not,
  leave it out rather than guess.
- Demo: the fake client's `auth` needs `updateUser`, `signOut({scope})`, and an `mfa`
  object that enrols and verifies with any six digits; show "Demo data" as everywhere.
- e2e: a wrong current password is refused with the reason; a short new password is
  refused; the two-step flow shows a QR code and accepts a code in the demo.

---

## Phase 7. Announcements

**The question:** "How do I tell the whole field, or one team, something important, and
know who has read it?"

**What exists:** `enqueue_notification` (one person), `notify_watchers`, Share with field
→ Sent notifications (`/share/sent`, `src/live/share.ts` around "notifications sent"),
Messages for one-to-one, and the phone's notification list.

**Database (migration 0113_announcements.sql):**
- `announcements` (id, org, title, body, audience kind `everyone` | `team` | `role` |
  `territory`, audience id, `pinned_until` date, created by, created at) and
  `announcement_reads` (announcement, employee, read at).
- `send_announcement(p_title, p_body, p_audience, p_audience_id, p_pinned_until)`:
  owner, admin, HR and management (management only to their own team); resolves the
  people, writes one notification each through `enqueue_notification` (kind
  `announcement`, deep link `/announcements/<id>`), audits.
- `mark_announcement_read(p_id)` for the phone; `my_announcements()` for the phone; RLS
  so a person sees only those addressed to them, and the office sees what it sent.
- Add `announcement` to the phone's notification kinds wherever kinds are listed.

**Console:** Share with field gains **Announcements** (`/share/announcements`):
- The hero is the list of what was sent, newest first: title, to whom ("Everyone, 46
  people", "Rajesh Verma's team, 9 people"), when, and **read by 31 of 46** as a figure
  with a thin bar in ink (not colour), pinned ones marked with the word "Pinned".
- Opening one shows who has read it and who has not (names, so a manager can follow up),
  with "Remind the 15 who have not read it" (one more notification to those only).
- "Write an announcement" drawer: title, message (plain text, line breaks kept, a
  character count), who it goes to (Segmented: Everyone, A team, A role, A territory, then
  the choice), "Keep it at the top of their phone until" (optional date), and a preview
  of how it will look on the phone. Send asks for confirmation naming the count:
  "Send to 46 people?"
- Demo fakedb: tables, seed two announcements with some reads, the RPCs.

**Phone:** a pinned announcement shows at the top of Home as one quiet card (title, first
line, "Read"); opening it marks it read. An Announcements list under the notifications
or HR menu. Use the app's own card style.

**e2e:** sending to a team shows the right count in the confirm, and the sent list shows
"read by 0 of 9".

---

## Phase 8. The final pass

Do all of this, then write the report.

1. **Every role, every page.** Open the console as owner, admin, HR, IT, finance and
   management (demo: `sessionStorage['mrsales.demoRole']`, see `e2e/helpers.ts`). Each
   page a role may open renders with real states; each it may not says which permission
   is missing. Pay figures are never shown to admin, IT or management.
2. **Every width.** 1440, 1280, 1024 and 390. No horizontal page scroll; tables scroll in
   their own frame; drawers are full width on a phone with the primary action at the
   bottom.
3. **Both themes.** Light, Light with a dark menu, Dark. Look at every new screen in Dark,
   not only the automated contrast scan.
4. **The rules, by eye.** Known item to fix: `src/pages/account/Account.tsx` gives the
   help-request statuses "With Mr Sales" and "Being worked on" the **accent** pill tone;
   the accent is for actions and selection only. Make them neutral. Then search the
   whole `src/` for `tone="accent"` and any other accent used on a status, and fix
   each. Look for identical card grids, icons on every row, dashes in copy, Title Case
   buttons.
5. **`console-review`** on every screen built in Phases 1 to 7; fix what it finds.
6. **`FEATURE_CHECKLIST.md`**: tick what now works; for anything not done, one line saying
   why.
7. **Phone:** `flutter analyze lib` and `flutter test` clean. List every phone change
   since APK 20261005 (payslip lines and PDF, leave balances, the expense rule from the
   database, announcements) in "Left for the owner", so the owner builds **one** APK.
8. **Commit, push** (pushing `NEW_CONSOLE` main deploys app.mrsales.in; only push to
   main what works against the live database, see section 0), and confirm CI is green
   on all three repos.

**The report** (at the end of this file, under "Report"): what was built, what was checked
and how (demo, tests, live), what is not done and why, and what the owner must do.

---

## Done so far (Phases 1 to 4, 6 October 2026)

- **Pay.**
  - Payroll is worked out by the database from each person's dated salary and their
    attendance (migrations 0106, 0108).
  - HR corrects loss of pay with a reason, adds one-off lines, and Generate and release
    makes the PDF (company details, GSTIN, logo, net in words) and sends it to the phone.
  - Salaries keep each person's split and revisions.
  - Settings → Pay and expenses holds the components, the structures and the role
    expense rules. Settings → Company holds the details and the logo (0107).
  - Pay is seen only by owner, HR and finance. The database enforces this, including
    the payslip files (0110).
- **Expenses:** a person's own allowance, bill limit and ceiling over their role's and
  the company's (0109), and travel rates per person.
- **Leave balances.**
  - Policy plus HR adjustments, less taken and waiting, checked when leave is applied
    for (0111).
  - Console: the Leave page, a person's record and the approve dialog.
  - Phone: the Leave screen and the apply form.
- **Phone:** payslips show every line and open the PDF; leave balances.
- Console tests: 41 Playwright tests, all passing. Phone tests: 602, all passing.

## Left for the owner

Updated 6 October 2026, evening, after the cloud session's branch was finished locally.

Done:
- ~~Move 0112 and 0113 into the backend repository~~: committed to `Mr_Sales_Console` main
  with the review lines. The backend suite passes on Postgres 17. One change was made: the
  import no longer counts every active person against the plan's seats (Add a person does
  not either); seats are checked when logins are sent.
- ~~Apply 0112 and 0113 live~~: applied, and tried on Testbed Pharma inside rolled-back
  transactions. A sheet with problems lists all seven by row and column; a clean sheet adds
  the person and their salary; an announcement to everyone reached 18 people; a rep sees and
  reads only their own; a manager writing to another team and finance importing are refused.
- ~~Phone, Phase 7~~: announcements list under More, the message on its own screen (opening
  it marks it read), and a pinned one as a quiet card at the top of Home. Analyzer clean,
  all tests pass, pushed.
- ~~Build one APK~~: `Field_Force_App/dist/MrSales-20261006-arm64.apk` (and
  `-old-phones.apk` for 32-bit phones). Contains everything since 20261005: payslip lines
  and the PDF, leave balances, the expense rule from the database, announcements.
- ~~Merge `claude/loving-brown-nuf6dn`~~: merged to main and deployed.

Still yours:
1. **Switch on two-step sign-in (TOTP) in Supabase**: Authentication, Multi-factor (or Sign In
   / Providers, MFA, depending on the dashboard version). Until it is on, "Turn on two-step
   sign-in" on Your account says it is not switched on yet.
2. **Sign in at app.mrsales.in and try Your account once**: change your password, then turn
   two-step sign-in on and off with an authenticator app.
3. **Install the APK** on a phone and look at Leave, Payslips, and Home after sending yourself
   an announcement from Share with field, Announcements.
4. Two branches on GitHub in `MrSales_NEW_Console` are finished with:
   `claude/loving-brown-nuf6dn` (merged) and `claude/pensive-newton-fdx31b` (no commits).
   Delete them when you like; nothing depends on them.

## Report

Written 6 October 2026 by the cloud session that worked through Phases 5 to 8.

**What was built**

- *Phase 5, import people.* Team, People, "Import from a sheet" (also in New and search). A
  wide drawer in three steps: download the template, pick the filled CSV or Excel file, read
  every problem by row and column with how to fix it ("Row 3, Reports to: No employee has
  the code ASM-04. Add them above row 3 or fix the code."), and add everyone at once only
  when every row passes. The file can be fixed and picked again in place. Afterwards the
  new people are listed, and their logins are sent one by one through the existing invite,
  with a progress line. Database: `import_people` and `sheet_date` (0112): required
  columns, duplicate codes, unknown role or territory, a manager who is missing, further
  down the sheet, not a manager or makes a loop, dates in three forms (and Excel's day
  numbers), mobiles, emails, pay from owner and HR only, seats, one audit row.
- *Phase 6, your account.* `/account`, first in the account menu, for every role: who you
  are and the name used in Messages; change the password (checked by signing in again, held
  to the office password rules: 12 characters, upper and lower case, a digit, which is
  stricter than the 10 asked for, so it matches the first-password screen); two-step
  sign-in with an authenticator app (QR code, the key as text, a code to turn it on and
  another to turn it off), and the code asked at sign-in on the same sign-in page; sign out
  every other device; the last 20 changes made by this login. Left out on purpose: whether
  each office login has two-step sign-in on (Supabase shows a login only its own factors).
- *Phase 7, announcements.* Share with field, Announcements: the list of what was sent
  with "read by 18 of 22" over a thin ink bar; one opens with the names of those who have
  not read it and a reminder to them only; writing one to everyone, a team, a role or a
  territory, with a pin date, a phone preview, and a confirm that names the count. A
  manager writes to their own team only. Database (0113): the two tables with row security,
  `send_announcement`, `remind_announcement`, and `my_announcements` and
  `mark_announcement_read` for the phone. The phone side is not built (see above).
- *Phase 8, the final pass.* Accent was used on statuses in nine places ("Waiting for a
  decision", "Waiting", "Unplanned", "To pay", the two help-request statuses). All are
  neutral now, and `Pill` no longer accepts an accent tone. Rupee amounts in tabular figures
  read "₹17 , 000" (this font sets a tabular comma as wide as a digit) on a person's record,
  pay tab and month, the prescription share and the Today trend line. A browser probe of
  every page now finds none. Payroll and Salaries showed a hyphen for an empty value; those
  cells are empty now, with "none" for screen readers. On Leave, "Decline Approve" read as
  one phrase, and on a phone the decision was off-screen; the actions are spaced, and on a
  phone the leave type and dates fold under the name and the two actions stack. A new test
  proves pay never reaches admin, IT or management (Payroll, Salaries, every tab of a
  person's record, Pay and expenses, the import template), with an owner control so the
  check cannot pass empty.

**How it was checked**

- `npm run check` before every commit: the rules script, the typecheck, and every
  Playwright test on the demo company, including every page for all six roles, no sideways
  scroll at 390, and axe in light and dark. 55 tests, all passing at the last commit.
- Each new screen in the browser at 1440, 1280, 1024 and 390, in Light, Light with a dark
  menu, and Dark; `console-review` on each, recorded with its five-line plan in `REVIEW.md`.
  The Phase 1 to 4 screens (Payroll, Salaries, Pay and expenses, Company, Leave, a
  person's pay tab) were looked at the same way and fixed as above.
- Both migrations on a local Postgres with the backend's own fixtures and suite (393 checks
  pass), plus 21 checks of my own run as admin, owner, manager, finance and another
  company, inside a rolled-back transaction. That run found and fixed two faults before
  anyone met them: the two announcement policies read each other and recursed for ever,
  and a seat refusal said "Remove 1 rows".
- **Not checked live.** Nothing here was run against Testbed Pharma or applied to the live
  database, and nothing in `FEATURE_CHECKLIST.md` section 11 is ticked for that reason.

**Not done, and why**

- Applying 0112 and 0113 live, and committing them to `Mr_Sales_Console`: edits to that
  repository were blocked in this session (owner steps 1 and 2).
- The phone part of Phase 7, `flutter analyze` and `flutter test`: no Flutter in this
  container, and the phone repository could not be changed from here (owner step 5).
- CI on the backend and phone repositories was not run, because nothing was pushed to them.
  This branch is pushed; it was not merged to `main`.
