# Mr Sales console, rebuilt: working rules

This folder is the **new organisation console**, replacing `Mr_Sales_Web`
(live at app.mrsales.in) once it reaches full feature parity. It is used by
company owners, sales heads, HR and finance heads: senior people at a desk. It must
feel as considered and premium as Apple's own software and website.

Read these before any work here:
1. This file: the hard rules.
2. `DESIGN.md`: the visual direction, the style lock once chosen, and the structure.
3. `FEATURE_CHECKLIST.md`: every feature the old console has. Nothing ships without it.
4. The skills in `.claude/skills/`: `console-design` before any UI work,
   `console-motion` before any animation, `console-review` before calling a screen done,
   `web-design-guidelines` for the final polish. Also load the built-in
   `frontend-design` skill before UI work.

## What must not be disturbed

- **`Mr_Sales_Web` stays live and untouched** until the owner switches the domain.
  Do not edit it for this project. Read it as the reference for behaviour.
- **The backend is shared and is not redesigned.** Same Supabase project
  (`xdbhmxdaelqsazoferre`), same tables, RPCs, row-level security, edge functions
  and email letters. The new console calls exactly what `Mr_Sales_Web/src/data/live.ts`
  calls. A feature that seems to need a backend change is raised with the owner first.
- **The phone app is not affected.** Anything the console writes must stay readable by
  `Field_Force_App` exactly as today.
- Test credentials live in the gitignored `Mr_Sales_Web/.env.testbed`. Never commit
  them. Live tests act only in Testbed Pharma (org `4785d658-d758-4b59-9c2a-acb839b2b881`).
- The owner works in Cursor in parallel: check `git status` before editing, and ask
  before deleting anything on GitHub.

## The hard rules (a screen that breaks one does not ship)

From Abhijay Vuyyuru's "How can your vibe coded website not look like AI slop?",
as already applied on mrsales.in (`NEW_WEBSITE/PLAN.md`), adapted to a working tool.

### Look
- Warm or cool near-white page (never pure `#FFFFFF`), near-black readable text,
  **one** accent colour, used for actions, links and the current selection only.
- Status colours (good, warning, danger) appear only where they **mean** that state,
  always with a word beside them. Never as decoration, never to tell sections apart.
- Hierarchy comes from type size, weight, spacing and alignment. Not from boxes,
  colours or icons.
- The **data is the hero**. A screen's most important figure or list gets the most
  space; everything else steps back.
- Banned: gradients, rainbow, neon, generic pastels, purple-and-black, radial orbs, dot
  grids, liquid glass, decorative stripes, sparkle icons, emoji, animated arrows,
  shadows on everything, one soft rounded corner on everything.
- Banned fonts: Inter, Geist, Space Grotesk. Banned icons: Lucide.

### Structure
- No grid of identical metric cards as the default. No bento grids. No three-across
  feature cards. Vary composition by what each part of the screen says.
- One clear purpose per screen, stated in its title. The first thing an official sees
  answers "what needs me today".
- About seven menu sections, every old feature kept (see `DESIGN.md`).
- Dense where people work (tables, queues), spacious where people read (overview).

### Copy
- Sentence case everywhere. Plain, specific words. No em dashes or en dashes in the UI.
- Never "Overview", "At a glance", "Key metrics": say what is in the box.
- Never invent figures, customers or claims. Demo data is labelled as demo data.
- Every count says its noun correctly ("1 visit", "2 visits").

### Behaviour
- Every button, menu, filter and form works against the live backend.
- Keyboard focus visible everywhere; every input labelled; dialogs trap focus.
- Real loading (skeletons only for real waits), empty, error and permission states on
  every list. No artificial delays.
- Motion is subtle and purposeful (see `console-motion`); reduced motion respected;
  normal scrolling never hijacked.
- Works and looks right at 1440, 1280, 1024 and 390 wide.

### Honesty
- Build one screen properly, check it at desktop and mobile in the browser, show the
  owner, then extend. Never claim to have checked a screen that was not run.
- Report what was tested and what is unfinished, plainly.
- A feature is ticked in `FEATURE_CHECKLIST.md` only when it works live.

## Workflow

1. Before UI work: load `frontend-design` and `console-design`, read `DESIGN.md`.
2. Build on a branch, against the live testbed and against demo data.
3. Check it in the browser at desktop and phone widths; run the tests.
4. Run `console-review` on the screen; fix what it finds.
5. Show the owner. Record any rule the owner changes in `DESIGN.md` under
   "Owner decisions", with the date. Those decisions win over this file.

## Switching the domain

Only when every box in `FEATURE_CHECKLIST.md` is ticked (or signed off as dropped),
the old e2e tests have equivalents that pass, and the owner says so. The switch is a
Vercel domain change and can be reversed.
