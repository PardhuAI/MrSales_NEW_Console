# Mr Sales console: design direction

Status 2026-10-04: rules agreed, feature checklist written, **the Dashboard is built in
all three directions** (`npm run dev`, then http://127.0.0.1:8920; switch with the
control at the bottom, or `?d=paper`, `?d=studio`, `?d=graphite`). Waiting on the
owner's choice. The style lock below is filled in from the
chosen direction, and every later screen reuses it.

## 1. Who it is for, and what it must feel like

Owners, sales heads, HR and finance heads at Indian pharma and distribution companies.
Senior people, often on a laptop, sometimes on a phone between meetings. They open it
to answer three questions: *what needs me today, how is the field doing, is the money
right.*

It must feel like Apple software: calm, exact and expensive. Not busy, not loud,
not a template. The owner's words: "the Apple feel and premiumness, because it is
used by higher officials."

## 2. What "the Apple feel" means here (the parts we take)

Apple's pages and apps are not premium because of an effect. It is the sum of these,
and each one is a rule on this project:

| What Apple does | How the console does it |
|---|---|
| Very few colours. A soft grey or white ground, near-black text, one blue. | A near-white ground, near-black ink, **one** accent. Status colours only where they mean a state. |
| Huge contrast in type size between the headline and everything else. Tight letter spacing on large type. | Each screen has one large title and one large figure or answer. Body text stays quiet. Tracking tightens as size grows. |
| Generous, consistent space. Things breathe. | A strict spacing scale. Overview screens are airy; working screens are dense but still aligned. |
| Everything aligned to a grid; nothing is "about right". | One column grid. Numbers right-aligned with tabular figures in columns. Labels line up. |
| Hairlines and precise edges, not heavy borders or shadows. | 1 px hairlines for structure. One soft shadow, only on things that float (menus, dialogs, drawers). |
| The product is the picture. | The data is the picture: a big figure, a clean chart, a well-set table. No illustrations or decoration on working screens. |
| Motion that feels physical and quick, never bouncy. | Short fades and small rises, numbers that count up once, charts that draw once, smooth drawer and dialog transitions. See `console-motion`. |
| Restraint with icons. | Icons only where they clarify an action. One family (Phosphor, regular), the same as mrsales.in. |
| A top bar that stays out of the way. | A quiet, solid (or barely translucent) bar. No glass effects as decoration. |

What we do **not** take: marketing-page scale (a 90 px headline on every screen),
scroll-driven storytelling, product photography. This is a tool used daily.

## 3. Structure (built 2026-10-04)

The owner's verdict on the old console: options were hard to find, hidden in folded
menu sections, and people searched for them. So **nothing hides**:

- **Ten sections, always in view** in the side menu, named the way an official would
  say them. Settings sits apart at the foot.
- **Inside a section, every page is a tab** under the section's title, and the current
  section's pages also open under it in the menu. One click to anything.
- **Hover a section to see what is inside**, with one line on what each page is for,
  before clicking (desktop).
- **Search (⌘K, Ctrl K or /) finds pages, actions, people and clients** in plain
  words: "DA", "fake GPS", "reset password", "salary", a person's name. Keywords for
  every page live in `src/app/nav.ts`.
- **One New button** for everything people create.
- **Settings is one page**, grouped by topic, like the settings on a Mac.
- **The account menu** holds appearance, help, billing and sign out.

| Section | Pages (every old page is in one of them) |
|---|---|
| Home | Today (Dashboard), Needs attention |
| Approvals | Waiting for you, Decided |
| Field | Activity (and a person's day), Day plans, Tour plans, Coverage |
| Clients | All clients (and a client's record), Data quality, Complaints |
| Sales | Sales, Orders, Targets, Prescription audit, Products, Stockists, Stock |
| Team | People (record, add a person), Managers, Org chart (old Organisation and Hierarchy), Attendance, Leave, Tasks |
| Expenses and pay | Expense claims, Payroll |
| Share with field | Resources, Surveys, Sent notifications |
| Reports | Reports, Downloads (old Exports) |
| Settings | All settings, Company rules (old Configuration), Geography, Roles, Logins and access (old Users and phone logins), HR rules (old HR configuration), Field ownership, Audit log |
| Account menu | Help from Mr Sales, Plan and billing |

`src/app/nav.ts` is the single source: the menu, tabs, preview, search and permission
check all read it. Pages not yet rebuilt say so plainly and point to app.mrsales.in.

## 4. Dashboard directions (to present)

All three obey the hard rules in `CLAUDE.md`. They differ in ground, accent and type.
Each will be built as a working Dashboard on demo data and shown at desktop and phone
widths.

- **A. Paper.** Warm paper ground, ink text, deep blue accent, Schibsted Grotesk:
  the same family and palette as mrsales.in, so the website and the console read as
  one brand.
- **B. Studio.** Cool Apple-grey ground, near-black text, a bright clear blue, the
  system font stack (San Francisco on a Mac, Segoe UI on Windows). The closest to
  Apple itself.
- **C. Graphite.** Light content area beside a deep graphite navigation, one deep
  green or teal accent, a refined grotesk. The most "executive suite".

Mixes added at the owner's request (2026-10-04), shown beside the three:

- **D. Studio + Paper font.** Studio's cool grey, white panels and blue, set in
  Schibsted Grotesk.
- **E. Studio + Graphite font.** Studio's colours, set in Instrument Sans.
- **F. Dark menu + Studio.** Graphite's dark navigation beside Studio's room, with
  Studio's blue and the system font.

## 5. Style lock

Locked 2026-10-04 with direction **D** (Studio's colours, Schibsted Grotesk). The values
live in `src/styles/tokens.css`; components use the token names only, and
`npm run check:rules` fails on any raw colour outside that file.

**Type.** One family, Schibsted Grotesk (Google Fonts), falling back to the system
sans. Named scale: hero `clamp(2.25rem, 1.3rem + 2.6vw, 3.5rem)`, title 1.75rem,
figure 1.75rem, section 1.1875rem, body 0.9375rem, small 0.8125rem, label 0.75rem.
Weights 400, 500, 600 (700 for the brand only). Large type tightened (hero -0.035em,
title -0.025em, figure -0.02em); labels +0.01em. Line heights 1.08, 1.3, 1.5. Figures
in columns use tabular numerals.

**Space.** A 4 pt scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64. Page gutter
`clamp(16px, 2.4vw, 40px)`; content up to 1240px; menu 248px.

**Shape.** Radius by object: panels 18px, controls 8px, pills (statuses only) 999px.
Hairlines 1px. One shadow, `--shadow-float`, on floating surfaces only (menus,
popovers, the month picker, drawers, dialogs); focus rings are a 3px soft accent.

**Colour, with measured contrast** (all text pairs clear 4.5:1):

| Role | Light | Dark | Pair, light / dark |
|---|---|---|---|
| Ground | #f5f5f7 | #0e0e10 | |
| Raised (panels) | #ffffff | #1c1c1e | |
| Ink | #1d1d1f | #f5f5f7 | on ground 15.5 / 17.7 |
| Muted | #636368 | #a1a1a6 | on ground 5.5, on control grey 4.9 / on raised 6.6 |
| Faint | #6e6e73 | #98989d | on white 5.1 / on control grey 5.0 |
| Hairline | #e3e3e8 | #2c2c2e | |
| Control grey (track) | #e8e8ed | #2a2a2d | |
| Accent (actions, links, the selection, focus) | #0066cc | #3d9bff | on ground 5.1 / 6.7; text on accent 5.6 / 6.6 |
| Good, on its soft ground | #1d7a3a on #e6f4ea | #4cc76a on #15291b | 4.7 / 7.1 |
| Warning, on its soft ground | #9a5b00 on #fbf0dc | #f2b14a on #33270f | 4.8 / 7.8 |
| Danger, on its soft ground | #c4262e on #fde8e8 | #ff6b63 on #3a1817 | 4.9 / 5.7 |
| Scrim behind overlays | black 26% | black 56% | |

Status colours appear only beside the word they mean. The menu has its own set for the
"Light with a dark menu" appearance.

**Motion.** One ease, `cubic-bezier(0.2, 0.7, 0.2, 1)`. Durations: micro 150ms, state
240ms, reveal 480ms, count 600ms. Movement 4, 8, 12px. Reduced motion: nothing moves.

## 6. Stack (proposed, confirmed at scaffold)

- React + TypeScript + Vite + React Router, like the old console, so hosting, sign-in
  and data behave identically.
- The data layer is carried over from `Mr_Sales_Web/src/data/live.ts`, unchanged in
  behaviour, so every figure and action means what it means today.
- Radix Primitives for dialogs, menus, tabs, popovers and tooltips (behaviour and
  accessibility), styled entirely with our own tokens. No ready-made theme.
- Motion (motion.dev) for transitions. One motion library only.
- Phosphor icons, regular weight.
- Charts drawn with our tokens (a light library or hand-built SVG); no default chart
  themes.
- Playwright for end-to-end tests, as in the old console.

## 7. Owner decisions

Dated. These amend everything above; where they differ, this section wins.

- **2026-10-04.** A brand-new console in `NEW_CONSOLE/`; the old one stays live until
  parity. Every old feature is kept. Main complaints about the old one: colours,
  structure and user experience.
- **2026-10-04.** Apple-level premium feel, because senior officials use it. Subtle
  animations are wanted.
- **2026-10-04.** The rules of the Vuyyuru article apply, as on mrsales.in.
- **2026-10-04.** Direction **D** chosen: Studio's colours with Schibsted Grotesk. Tokens
  in `src/styles/tokens.css`. The other five directions were removed.
- **2026-10-04.** Appearance: **Light is the default.** Each person can choose Light,
  Light with a dark menu, Dark or Automatic (follows the device) from their account
  menu, and change it any time (`src/app/theme.tsx`).
- **2026-10-04. What the Dashboard is for.** Management tracks, controls, guides and
  maintains the field force through it. Every figure comes from live records and is
  checked against the database before it ships; every alert names the person and
  leads to the place to act; a week off, a holiday, early morning, a new company and a
  company without targets each get an honest state, never "0 of 0".
- **2026-10-04.** Full creative freedom on structure and experience; every old feature
  stays, and new ones are welcome where they help.
- **2026-10-04.** Days are picked as on the phone: a strip of the week to tap, and one
  month calendar of our own behind "Pick a date", the same on every page that picks a
  day (Field activity, Day plans, a person's day, Leave). The browser's own date box is
  used only inside forms. Months are picked the same way (Attendance, Expense claims,
  Payroll): six months to tap, and a year panel behind "Pick a month".
