---
name: console-motion
description: Motion rules for the new Mr Sales console in NEW_CONSOLE. Load before adding or changing any animation, transition, hover or press state, loading state, drawer, dialog, chart animation or page transition. Subtle, Apple-like, purposeful; one library, one ease, token durations.
---

# Console motion

The owner wants subtle animation that adds to the premium feel. Motion here explains a
change, confirms an action or keeps the eye oriented. It never decorates, never
delays work, and never makes an official wait to read a figure.

## Frequency decides the budget

- Things done many times an hour (row hover, tab switch, filter change, typing): instant
  or a 120 to 150 ms colour or opacity change. No movement.
- Things done a few times a session (open a drawer or dialog, change page, approve a
  claim): 200 to 280 ms, small movement allowed.
- Things seen once (the Dashboard's first load, a chart's first draw, a figure's first
  appearance): up to ~600 ms, a short stagger allowed. Plays **once per visit**, never on
  every re-render or filter change.

## The vocabulary (use only these)

1. **Arrive**: content fades in and rises 8 to 12 px when it first loads. Lists stagger
   40 to 60 ms per item, capped at the first ~8 rows.
2. **Swap**: a skeleton or an old value cross-fades to the new one; no layout jump.
3. **Press**: buttons darken or lighten slightly on press; at most a 0.98 scale on large
   primary buttons. Hover changes colour or underline, never size.
4. **Count and draw**: a hero figure counts up once on first view (~600 ms); a chart's
   line or bars draw once (~500 ms). Never again on refresh; a refresh cross-fades.
5. **Surface**: drawers slide in from the edge with a fading scrim; dialogs fade and
   scale from 0.98; menus and popovers fade and move 4 px from their anchor.
6. **Settle**: after an action (approve, save), the row confirms in place (a brief tint
   and the new status), then leaves or updates. No toasts for things visible on screen;
   a toast only for work that finished somewhere off screen.

A seventh pattern invented for one screen is how a motion system becomes noise.

## Tokens

- One ease for everything: an ease-out curve such as `cubic-bezier(0.2, 0.7, 0.2, 1)`
  (set in the style lock). No bounce, no overshoot, no `ease-in` on entering elements.
- Durations from tokens only: micro ~150 ms, state ~240 ms, reveal ~480 ms, count ~600 ms.
- Movement from tokens only: 4, 8, 12 px.

## Implementation

- One library: Motion (motion.dev). CSS transitions for simple hover and colour states.
- Animate `transform` and `opacity` only. Never `transition: all`, never width, height,
  top or margin.
- Every animation is interruptible: a click mid-animation acts at once.
- `prefers-reduced-motion`: no movement, no count-up, no drawing; content appears in its
  final state, with at most an opacity change.
- No motion that delays the first paint of data. Skeletons appear only when a wait is
  real (over ~300 ms); a spinner never flashes.
- Charts and figures animate after their data is ready, never with placeholder values.
- No scroll-jacking, no parallax, no autoplaying loops.

## Review questions

For each animation: what changed, why should they notice, how often will they see it,
what is left on screen if motion is off? Remove anything without an answer.
