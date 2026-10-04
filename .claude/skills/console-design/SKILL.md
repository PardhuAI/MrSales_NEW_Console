---
name: console-design
description: Design rules for the new Mr Sales organisation console in NEW_CONSOLE (app.mrsales.in rebuild). Load before building, restyling, laying out or writing copy for any console screen, component, chart, table, form or dialog. Apple-level premium for senior officials; one accent; data as the hero.
---

# Console design

The console is used by owners and department heads. It has to feel as calm, exact and
premium as Apple's software. Premium here is the sum of restraint, typography, spacing,
alignment and finish; never an effect.

Before writing UI code: read `NEW_CONSOLE/CLAUDE.md` (hard rules) and
`NEW_CONSOLE/DESIGN.md` (direction, structure, style lock), and load the built-in
`frontend-design` skill. Use token names only; if a value is missing, add a token.

## First, a short plan

Before building a screen, write five lines:
1. **The question** this screen answers for an official, in their words.
2. **The hero**: the one figure, list or chart that answers it, and why it gets the space.
3. **Density**: overview (spacious) or working screen (dense, scannable).
4. **States**: loading, empty, error, no permission, and what each says.
5. **The generic default you are avoiding** on this screen.

## Composition

- One page title per screen, large, with at most one line under it saying what is
  here or what changed. The title says what the screen holds, never "Dashboard
  overview".
- One hero per screen. The rest of the screen is visibly secondary: smaller type,
  muted colour, less space.
- **Do not default to a row of identical metric cards.** Figures that belong together sit
  on one line of type, separated by space and hairlines, with the most important one
  set larger. A figure earns its own panel only when it carries a chart or an action.
- Group by meaning, separate by space. Use a hairline only where space alone is
  ambiguous. Boxes inside boxes are a smell.
- Tables are the main working surface: generous row height, hairline row rules, no
  zebra stripes, left-aligned text, right-aligned numbers with tabular figures, a quiet
  header, sticky when long. Row hover is a faint tint. The primary action per row is
  text, not a button wall.
- Filters sit in one quiet row above the table: search first, then the two or three
  filters people actually use, the rest behind "More filters".
- Details open in a side drawer when people need the list beside them, and in a full
  page when the record is a place in its own right (an employee, a client, a day).
- Forms: one column, labels above fields, helper text under, errors inline in words,
  the primary action bottom right (bottom, full width on a phone).
- Dialogs only to confirm something consequential or irreversible. The confirm button
  names the action ("Reject claim"), never "OK" or "Confirm".

## Typography

- One family (chosen in the style lock). A named scale: page title, section title,
  hero figure, body, small, label. Nothing outside it.
- Large type: semibold, tracking tightened. Body: regular, comfortable line height.
- Figures in columns use tabular figures; a single hero figure may use proportional.
- Sentence case everywhere, including buttons and menu items.
- Line length under ~80 characters for any running text.

## Colour

- Ground, raised surface, ink, muted ink, hairline, one accent, and the three states
  (good, warning, danger). That is the whole palette.
- The accent marks: the primary action, links, the selected menu item, focus rings,
  the current selection. Nothing else.
- State colours only beside a word that says the state (a pill, a dot plus a label).
  Never colour a whole row or card to signal something.
- Every text pairing clears 4.5:1; large figures 3:1. Check before shipping.
- Dark mode is designed, not inverted: its own ground, ink and a slightly lifted accent.

## Shape and depth

- Radius by object: containers, controls and pills each have their own, set in tokens.
  Pills are for statuses only.
- One shadow, for things that float above the page: menus, popovers, drawers, dialogs.
  Panels on the page use a hairline or nothing.
- Icons: Phosphor regular, at one or two sizes, only where they make an action clearer.
  No icon beside every menu item or heading by default.

## Charts

- Draw with tokens: ink and muted ink for the data, the accent for the one series that
  matters, a hairline grid or none. No legends where a direct label works.
- Every chart has a title that states the finding or the measure, an accessible table or
  summary, and an empty state.
- No pie charts for more than three parts; no 3D; no gradients in fills.

## Copy

- Specific and plain. "4 claims wait more than 5 days", not "Pending items".
- No em dashes or en dashes. No "Overview", "At a glance", "Insights", "Key metrics".
- Empty states say what would appear here and how it gets here.
- Errors say what happened and what to do, in words an owner understands.
- `Fmt`-style helpers for counts, money (₹ with Indian grouping), dates and times. Never
  format inline.

## Anti-slop gates

Reject a screen that relies on: a grid of identical stat cards, gradients or glows,
coloured section backgrounds, an icon on every row, decorative charts with no finding,
glass effects, emoji, fake figures, "Welcome back" banners taking the top of the screen,
or the same card treatment for everything.

## Handoff

Report: the question and hero chosen, tokens added, states built, what was checked in
the browser at which widths, and what remains.
