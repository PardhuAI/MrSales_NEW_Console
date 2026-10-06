-- Announcements: one message to the whole field, a team, a role or a
-- territory, and who has read it.
--
-- `announcement_reads` holds one row per person it was addressed to, written
-- when it is sent, with `read_at` empty until they open it. That is what lets
-- the office say "read by 31 of 46" and name the 15, even after someone has
-- moved team: the audience is fixed at the moment of sending.
--
-- Each person also gets an ordinary notification (kind `announcement`, deep
-- link `/announcements/<id>`), so the phone's notification list and its push
-- carry it without a new channel.
--
-- Who may send: owner, admin, HR to anyone in the company; management only to
-- their own team (everyone under them on the reporting line, today).
--
-- Apply after 0112. Safe to re-run.

create table if not exists public.announcements (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organisations(id) on delete cascade,
  title         text not null check (length(btrim(title)) between 2 and 120),
  body          text not null check (length(btrim(body)) between 1 and 2000),
  audience_kind text not null check (audience_kind in ('everyone', 'team', 'role', 'territory')),
  audience_id   uuid,
  audience_name text not null,
  pinned_until  date,
  created_by    uuid default auth.uid(),
  created_by_name text,
  created_at    timestamptz not null default now(),
  check ((audience_kind = 'everyone') = (audience_id is null))
);
create index if not exists announcements_org on public.announcements (org_id, created_at desc);

create table if not exists public.announcement_reads (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  employee_id     uuid not null references public.employees(id) on delete cascade,
  org_id          uuid not null references public.organisations(id) on delete cascade,
  read_at         timestamptz,
  reminded_at     timestamptz,
  primary key (announcement_id, employee_id)
);
create index if not exists announcement_reads_employee on public.announcement_reads (employee_id);

alter table public.announcements enable row level security;
alter table public.announcement_reads enable row level security;

-- The office reads what the company sent; management reads what it sent itself;
-- a person reads what was addressed to them. Each policy asks about the other
-- table through a definer helper, because two policies that read each other's
-- table recurse for ever.
create or replace function public.announcement_sent_by_me(p_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.announcements a where a.id = p_id and a.created_by = auth.uid())
$$;

create or replace function public.announcement_addressed_to_me(p_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.announcement_reads r
     where r.announcement_id = p_id and r.employee_id = public.current_employee_id()
  )
$$;

revoke all on function public.announcement_sent_by_me(uuid) from public, anon;
revoke all on function public.announcement_addressed_to_me(uuid) from public, anon;
grant execute on function public.announcement_sent_by_me(uuid) to authenticated;
grant execute on function public.announcement_addressed_to_me(uuid) to authenticated;

drop policy if exists announcements_office on public.announcements;
create policy announcements_office on public.announcements
  for select to authenticated
  using (
    org_id = (select public.current_org_id())
    and (
      (select public.current_role_name()) in ('owner', 'admin', 'hr')
      or created_by = (select auth.uid())
      or public.announcement_addressed_to_me(id)
    )
  );

drop policy if exists announcement_reads_office on public.announcement_reads;
create policy announcement_reads_office on public.announcement_reads
  for select to authenticated
  using (
    org_id = (select public.current_org_id())
    and (
      (select public.current_role_name()) in ('owner', 'admin', 'hr')
      or employee_id = (select public.current_employee_id())
      or public.announcement_sent_by_me(announcement_id)
    )
  );

revoke all on public.announcements, public.announcement_reads from anon;
grant select on public.announcements, public.announcement_reads to authenticated;

/* ── who an audience is, today ─────────────────────────────────────────── */
-- Not callable by clients: send_announcement checks the caller first.
create or replace function public.announcement_audience(p_org uuid, p_kind text, p_id uuid)
returns table (employee_id uuid)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if p_kind = 'everyone' then
    return query select e.id from public.employees e where e.org_id = p_org and e.status = 'active';
  elsif p_kind = 'team' then
    -- Everyone under the manager, however far down, on today's reporting line.
    return query
      with recursive down(id, depth) as (
        select e.id, 1 from public.employees e where e.org_id = p_org and e.manager_id = p_id and e.status = 'active'
        union
        select e.id, d.depth + 1 from public.employees e join down d on e.manager_id = d.id
         where e.org_id = p_org and e.status = 'active' and d.depth < 12
      )
      select distinct down.id from down;
  elsif p_kind = 'role' then
    return query select e.id from public.employees e where e.org_id = p_org and e.status = 'active' and e.designation_id = p_id;
  elsif p_kind = 'territory' then
    return query select e.id from public.employees e where e.org_id = p_org and e.status = 'active' and e.territory_id = p_id;
  end if;
end $$;

revoke all on function public.announcement_audience(uuid, text, uuid) from public, anon, authenticated;

/* ── sending ───────────────────────────────────────────────────────────── */
create or replace function public.send_announcement(
  p_title text, p_body text, p_audience text, p_audience_id uuid default null, p_pinned_until date default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_org   uuid := public.current_org_id();
  v_role  text := public.current_role_name();
  v_me    uuid;
  v_name  text;
  v_id    uuid;
  v_n     int;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  r       record;
begin
  if v_org is null then raise exception 'not signed in'; end if;
  if v_role not in ('owner', 'admin', 'hr', 'management') then
    raise exception 'only an owner, admin, HR or a manager may send an announcement';
  end if;
  if length(btrim(coalesce(p_title, ''))) < 2 then raise exception 'give the announcement a title'; end if;
  if length(btrim(p_title)) > 120 then raise exception 'keep the title under 120 characters'; end if;
  if btrim(coalesce(p_body, '')) = '' then raise exception 'write the message'; end if;
  if length(btrim(p_body)) > 2000 then raise exception 'keep the message under 2,000 characters'; end if;
  if p_audience not in ('everyone', 'team', 'role', 'territory') then raise exception 'choose who it goes to'; end if;
  if (p_audience = 'everyone') <> (p_audience_id is null) then raise exception 'choose which team, role or territory it goes to'; end if;
  if p_pinned_until is not null and p_pinned_until < v_today then raise exception 'the pin date has passed; choose today or later'; end if;

  select employee_id into v_me from public.app_users where user_id = auth.uid() and org_id = v_org limit 1;

  -- A manager writes to their own team only.
  if v_role = 'management' and not (p_audience = 'team' and p_audience_id = v_me) then
    raise exception 'a manager sends announcements to their own team only';
  end if;

  if p_audience = 'everyone' then v_name := 'Everyone';
  elsif p_audience = 'team' then
    select name || '''s team' into v_name from public.employees where id = p_audience_id and org_id = v_org and status = 'active';
  elsif p_audience = 'role' then
    select name into v_name from public.designations where id = p_audience_id and org_id = v_org;
  else
    select name into v_name from public.territories where id = p_audience_id and org_id = v_org;
  end if;
  if v_name is null then raise exception 'that team, role or territory is not in your company'; end if;

  select count(*) into v_n from public.announcement_audience(v_org, p_audience, p_audience_id);
  if v_n = 0 then raise exception 'nobody is in % today, so there is nobody to send it to', v_name; end if;

  insert into public.announcements (org_id, title, body, audience_kind, audience_id, audience_name, pinned_until, created_by, created_by_name)
  values (v_org, btrim(p_title), btrim(p_body), p_audience, p_audience_id, v_name, p_pinned_until, auth.uid(), public.current_actor_name())
  returning id into v_id;

  for r in select employee_id from public.announcement_audience(v_org, p_audience, p_audience_id) loop
    insert into public.announcement_reads (announcement_id, employee_id, org_id) values (v_id, r.employee_id, v_org)
    on conflict do nothing;
    perform public.enqueue_notification(r.employee_id, btrim(p_title), left(btrim(p_body), 240), 'announcement',
                                        'announcement', v_id, '/announcements/' || v_id);
  end loop;

  insert into public.audit_log (org_id, actor_user, actor_name, action, entity, entity_id, entity_label, after_value)
  values (v_org, auth.uid(), public.current_actor_name(), 'sent an announcement', 'Announcement', v_id, btrim(p_title),
          format('%s, %s %s', v_name, v_n, case when v_n = 1 then 'person' else 'people' end));

  return jsonb_build_object('id', v_id, 'count', v_n);
end $$;

revoke all on function public.send_announcement(text, text, text, uuid, date) from public, anon;
grant execute on function public.send_announcement(text, text, text, uuid, date) to authenticated;

/* ── reminding those who have not read it ──────────────────────────────── */
create or replace function public.remind_announcement(p_id uuid)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_org  uuid := public.current_org_id();
  v_role text := public.current_role_name();
  a      public.announcements%rowtype;
  v_n    int := 0;
  r      record;
begin
  if v_org is null then raise exception 'not signed in'; end if;
  select * into a from public.announcements where id = p_id and org_id = v_org;
  if not found then raise exception 'no such announcement in your company'; end if;
  if not (v_role in ('owner', 'admin', 'hr') or (v_role = 'management' and a.created_by = auth.uid())) then
    raise exception 'only whoever sent it, or an owner, admin or HR, may send a reminder';
  end if;
  for r in select employee_id from public.announcement_reads where announcement_id = p_id and read_at is null loop
    perform public.enqueue_notification(r.employee_id, 'Reminder: ' || a.title, left(a.body, 240), 'announcement',
                                        'announcement', a.id, '/announcements/' || a.id);
    v_n := v_n + 1;
  end loop;
  update public.announcement_reads set reminded_at = now() where announcement_id = p_id and read_at is null;
  insert into public.audit_log (org_id, actor_user, actor_name, action, entity, entity_id, entity_label, after_value)
  values (v_org, auth.uid(), public.current_actor_name(), 'reminded about an announcement', 'Announcement', a.id, a.title,
          format('%s %s', v_n, case when v_n = 1 then 'person' else 'people' end));
  return v_n;
end $$;

revoke all on function public.remind_announcement(uuid) from public, anon;
grant execute on function public.remind_announcement(uuid) to authenticated;

/* ── the phone ─────────────────────────────────────────────────────────── */
create or replace function public.my_announcements()
returns table (id uuid, title text, body text, audience_name text, pinned_until date, created_at timestamptz,
               created_by_name text, read_at timestamptz)
language plpgsql stable security definer
set search_path = public
as $$
declare v_me uuid;
begin
  v_me := public.current_employee_id();
  if v_me is null then return; end if;
  return query
    select a.id, a.title, a.body, a.audience_name, a.pinned_until, a.created_at, a.created_by_name, r.read_at
      from public.announcement_reads r join public.announcements a on a.id = r.announcement_id
     where r.employee_id = v_me
     order by a.created_at desc
     limit 100;
end $$;

create or replace function public.mark_announcement_read(p_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare v_me uuid;
begin
  v_me := public.current_employee_id();
  if v_me is null then raise exception 'not signed in'; end if;
  update public.announcement_reads set read_at = coalesce(read_at, now())
   where announcement_id = p_id and employee_id = v_me;
  -- The notification that carried it is read too, so the bell agrees.
  update public.notifications set is_read = true
   where employee_id = v_me and entity = 'announcement' and entity_id = p_id;
end $$;

revoke all on function public.my_announcements() from public, anon;
revoke all on function public.mark_announcement_read(uuid) from public, anon;
grant execute on function public.my_announcements() to authenticated;
grant execute on function public.mark_announcement_read(uuid) to authenticated;
