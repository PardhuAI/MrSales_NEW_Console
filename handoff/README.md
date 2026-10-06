# Hand-off to the backend repository

These two migrations belong in `PardhuAI/Mr_Sales_Console`, under
`supabase/migrations/`. They were written by the cloud session of 6 October 2026, which
could not commit to that repository. Copy them across unchanged, then delete this folder.

- `0112_import_people.sql`: `sheet_date` and `import_people` (Phase 5).
- `0113_announcements.sql`: `announcements`, `announcement_reads`, `send_announcement`,
  `remind_announcement`, `my_announcements`, `mark_announcement_read` (Phase 7).

Both can run twice. Neither has been applied to the live database or run in CI.

## Also needed in `supabase/checks/26_definer_review.sql`

CI fails until each new definer function that `authenticated` may call is listed. Add
these lines to the `insert into reviewed_definer values` list:

```sql
  -- People import (0112): the caller's company; owner, admin or hr; pay columns owner or hr only.
  ('public.import_people(p_rows jsonb, p_commit boolean)'),
  -- Announcements (0113): send and remind check company and role (management: own team, own sends);
  -- the phone's two read only the caller's own rows.
  ('public.send_announcement(p_title text, p_body text, p_audience text, p_audience_id uuid, p_pinned_until date)'),
  ('public.remind_announcement(p_id uuid)'),
  ('public.my_announcements()'),
  ('public.mark_announcement_read(p_id uuid)'),
  -- Policy helpers (0113): each answers only about the caller's own sends or own copy.
  ('public.announcement_sent_by_me(p_id uuid)'),
  ('public.announcement_addressed_to_me(p_id uuid)'),
```

`announcement_audience` is revoked from `authenticated` and needs no line.
