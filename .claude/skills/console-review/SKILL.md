---
name: console-review
description: Review gate for any screen of the new Mr Sales console in NEW_CONSOLE before it is called done or shown to the owner. Checks the hard rules, Apple-level finish, feature parity with the old console, states, accessibility, responsiveness, motion and honest reporting.
---

# Console review

Run this on a screen after building it, in the browser, at real widths. Fix what fails,
then report honestly. Never mark something checked that was not run.

## 1. Parity
- Every item for this screen in `FEATURE_CHECKLIST.md` works against the live testbed,
  and against demo data.
- Behaviour matches the old console (`Mr_Sales_Web`) for the same records, or the
  difference is an owner decision recorded in `DESIGN.md`.
- Role access matches the matrix: open the screen as each role that may see it, and
  confirm it is hidden from roles that may not.

## 2. The hard rules (`CLAUDE.md`)
- Near-white ground, one accent used only for actions, links, selection and focus.
- No banned colours, effects, fonts or icons. No identical stat-card grid, no bento.
- Status colours only beside a word.
- Sentence case; no em or en dashes; no "Overview" style headings; counts pluralised.

## 3. Apple-level finish
- Squint test: one clear hero; everything else steps back.
- Alignment: titles, labels, table columns and figures line up on the grid; numbers
  right-aligned with tabular figures in columns.
- Spacing comes only from the scale; no cramped or orphaned elements.
- Type comes only from the named scale; at most three sizes visible in any one area.
- Hairlines, not heavy borders; one shadow, only on floating surfaces.
- Nothing looks "about right": icons optically centred, baselines aligned, no
  widows in titles, no ellipsis on important words at common widths.
- Dark mode checked, not just light.

## 4. States
- Loading (skeleton only for real waits), empty (what appears here and how), error (what
  happened, what to do, retry), no permission (which permission is missing).
- Long names, large numbers (₹1,23,45,678), zero values and one-item lists all render.

## 5. Accessibility
- Keyboard: every control reachable, visible focus ring, logical order, Escape closes
  overlays, focus returns to the opener.
- Every input labelled; errors announced; icon-only buttons have labels.
- Contrast: 4.5:1 text, 3:1 large figures and UI boundaries.
- Charts have a text summary or table.

## 6. Responsive
- 1440, 1280, 1024 and 390 wide: no horizontal page scroll, tables scroll inside their
  own container or reflow to rows on a phone, filters collapse, the menu becomes a sheet.

## 7. Motion (`console-motion`)
- Only the six patterns; durations and ease from tokens; first-load animations play once.
- Reduced motion: nothing moves, nothing is hidden.

## 8. Report
Write: what was checked, at which widths and roles, against live or demo data; what
failed and was fixed; what is still open. Tick checklist items only for what works live.
