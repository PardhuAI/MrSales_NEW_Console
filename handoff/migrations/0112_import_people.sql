-- People arrive as a spreadsheet.
--
-- A company that moves to Mr Sales has forty reps in a sheet already, and
-- typing each one into Add a person is an afternoon nobody should spend.
-- `import_people` takes that sheet, with the same three rules as the client
-- and product sheets (0059):
--
--   1. **The employee code decides.** A code already on the roster updates
--      that person; a new code adds one. Blank cells leave a field alone.
--   2. **Import never deletes or deactivates.** Leaving is its own act.
--   3. **All or nothing.** Every row is judged first; one problem writes none.
--
-- It does **not** create logins. A phone login sends a letter and takes a
-- seat on the phone, so it stays a deliberate step: the console offers
-- "Send logins to the new people" afterwards, one invite per person, through
-- the same invite it uses everywhere else.
--
-- Roles: owner, admin and HR, the same people who may add a person by hand.
-- Basic salary is read only from owner and HR (finance does not import
-- people; admin does not see pay).
--
-- Apply after 0111. Safe to re-run.

/* ── a date as people type it ──────────────────────────────────────────── */
-- 2026-04-01, 01/04/2026 (day first, as in India), 1 Apr 2026, 1 April 2026,
-- and the day number Excel stores when a cell is formatted as a date.
create or replace function public.sheet_date(p_text text, out ok boolean, out val date)
language plpgsql immutable
set search_path = ''
as $$
declare
  t text := btrim(coalesce(p_text, ''));
  m text[];
begin
  ok := true; val := null;
  if t = '' then return; end if;
  begin
    if t ~ '^\d{4}-\d{1,2}-\d{1,2}$' then
      m := regexp_split_to_array(t, '-');
      val := make_date(m[1]::int, m[2]::int, m[3]::int);
    elsif t ~ '^\d{1,2}[/.-]\d{1,2}[/.-]\d{4}$' then
      m := regexp_split_to_array(t, '[/.-]');
      val := make_date(m[3]::int, m[2]::int, m[1]::int);
    elsif t ~* '^\d{1,2}[ -][a-z]{3,9}[ ,-]+\d{4}$' then
      m := regexp_split_to_array(t, '[ ,-]+');
      val := make_date(m[3]::int,
        (array_position(array['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'],
                        lower(left(m[2], 3)))), m[1]::int);
      if val is null then ok := false; end if;
    elsif t ~ '^\d{5}(\.0+)?$' then
      -- An Excel day number: days since 30 December 1899.
      val := date '1899-12-30' + (split_part(t, '.', 1))::int;
    else
      ok := false;
    end if;
  exception when others then
    ok := false; val := null;
  end;
end $$;

revoke all on function public.sheet_date(text) from public, anon;
grant execute on function public.sheet_date(text) to authenticated;

/* ── the import ────────────────────────────────────────────────────────── */
create or replace function public.import_people(p_rows jsonb, p_commit boolean default false)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_org      uuid := public.current_org_id();
  v_role     text := public.current_role_name();
  v_errors   jsonb := '[]'::jsonb;
  v_create   int := 0;
  v_update   int := 0;
  v_created  jsonb := '[]'::jsonb;
  r          jsonb;
  n          int := 0;
  line       int;
  v_code     text;
  v_txt      text;
  v_mgr      text;
  v_email    text;
  v_mobile   text;
  v_date     record;
  v_num      record;
  v_seen     jsonb := '{}'::jsonb;   -- code -> line it first appears on
  v_app      jsonb := '{}'::jsonb;   -- code -> app it will open (field, manager)
  v_line_mgr jsonb := '{}'::jsonb;   -- code -> manager code, roster then sheet
  e          public.employees%rowtype;
  d          public.designations%rowtype;
  v_terr     uuid;
  v_hq       text;
  v_mgr_id   uuid;
  v_id       uuid;
  v_walk     text;
  v_guard    int;
  v_limit    int;
  v_used     int;
  v_basic    numeric;
  v_last     numeric;
  v_today    date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if v_org is null then raise exception 'not signed in'; end if;
  if v_role not in ('owner', 'admin', 'hr') then
    raise exception 'only an owner, admin or HR may import people';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'the sheet did not arrive as rows';
  end if;

  -- Who reports to whom today, by code, so a loop through the roster is seen.
  select coalesce(jsonb_object_agg(upper(x.code), upper(m.code)), '{}'::jsonb) into v_line_mgr
    from public.employees x join public.employees m on m.id = x.manager_id
   where x.org_id = v_org;

  /* ── first pass: judge every row ───────────────────────────────────── */
  for r in select * from jsonb_array_elements(p_rows) loop
    n := n + 1;
    line := coalesce((r ->> 'row')::int, n + 1);
    v_code := upper(coalesce(public.sheet_text(r, 'code'), ''));

    -- Employee code
    e := null;
    if v_code = '' then
      v_errors := v_errors || jsonb_build_object('row', line, 'field', 'Employee code',
        'message', 'Every person needs an employee code. It is how they sign in.');
    elsif v_seen ? v_code then
      v_errors := v_errors || jsonb_build_object('row', line, 'field', 'Employee code',
        'message', format('%s is also on row %s. Each code may appear once; delete one of the two rows.', v_code, v_seen ->> v_code));
    else
      v_seen := v_seen || jsonb_build_object(v_code, line);
      select * into e from public.employees where org_id = v_org and upper(code) = v_code;
    end if;

    -- Name
    if public.sheet_text(r, 'name') is null and e.id is null then
      v_errors := v_errors || jsonb_build_object('row', line, 'field', 'Name',
        'message', 'Write their full name, as on their ID.');
    elsif public.sheet_text(r, 'name') is not null and length(public.sheet_text(r, 'name')) < 2 then
      v_errors := v_errors || jsonb_build_object('row', line, 'field', 'Name',
        'message', 'A name needs at least two letters.');
    end if;

    -- Role, by the company's own name or short name for it
    d := null;
    v_txt := public.sheet_text(r, 'role');
    if v_txt is null then
      if e.id is null then
        v_errors := v_errors || jsonb_build_object('row', line, 'field', 'Role',
          'message', 'Write their role, as it is named under Settings, Roles.');
      end if;
    else
      select * into d from public.designations
       where org_id = v_org and (lower(name) = lower(v_txt) or lower(short_name) = lower(v_txt))
       order by is_active desc limit 1;
      if d.id is null then
        v_errors := v_errors || jsonb_build_object('row', line, 'field', 'Role',
          'message', format('There is no role called "%s". Use one of the names under Settings, Roles, or add it there first.', v_txt));
      elsif not d.is_active and (e.id is null or e.designation_id is distinct from d.id) then
        v_errors := v_errors || jsonb_build_object('row', line, 'field', 'Role',
          'message', format('%s is retired, so nobody new is given it. Choose a role in use.', d.name));
      elsif e.id is not null and e.mobile_role = 'ASM' and d.app_view <> 'manager'
            and exists (select 1 from public.employees x where x.manager_id = e.id and x.status = 'active') then
        v_errors := v_errors || jsonb_build_object('row', line, 'field', 'Role',
          'message', format('%s has a team reporting to them, so they keep a manager role. Move their team first.', e.name));
      end if;
    end if;
    if v_code <> '' then
      v_app := v_app || jsonb_build_object(v_code,
        coalesce(d.app_view, case e.mobile_role when 'ASM' then 'manager' when 'MR' then 'field' else null end, 'office'));
    end if;

    -- Territory, by its name or its HQ town
    v_terr := null;
    v_txt := public.sheet_text(r, 'territory');
    if v_txt is null then
      if e.id is null then
        v_errors := v_errors || jsonb_build_object('row', line, 'field', 'Territory',
          'message', 'Write the territory they are posted to, as named under Settings, Geography.');
      end if;
    else
      select t.id into v_terr from public.territories t
       where t.org_id = v_org and (lower(t.name) = lower(v_txt) or lower(t.hq) = lower(v_txt))
       order by (lower(t.name) = lower(v_txt)) desc limit 1;
      if v_terr is null then
        v_errors := v_errors || jsonb_build_object('row', line, 'field', 'Territory',
          'message', format('There is no territory or HQ called "%s". Add it under Settings, Geography first, or fix the spelling.', v_txt));
      end if;
    end if;

    -- Reports to: an employee code on the roster, or higher up this sheet
    v_mgr := upper(coalesce(public.sheet_text(r, 'reports_to'), ''));
    if v_mgr <> '' then
      if v_mgr = v_code then
        v_errors := v_errors || jsonb_build_object('row', line, 'field', 'Reports to',
          'message', 'Nobody reports to themselves. Write their manager''s code.');
      elsif v_seen ? v_mgr then
        if v_app ->> v_mgr <> 'manager' then
          v_errors := v_errors || jsonb_build_object('row', line, 'field', 'Reports to',
            'message', format('%s, on row %s, does not have a manager role, so they cannot approve anybody''s day.', v_mgr, v_seen ->> v_mgr));
        end if;
        if v_code <> '' then v_line_mgr := v_line_mgr || jsonb_build_object(v_code, v_mgr); end if;
      elsif exists (
        select 1 from jsonb_array_elements(p_rows) x
         where upper(btrim(coalesce(x ->> 'code', ''))) = v_mgr
           and not exists (select 1 from public.employees y where y.org_id = v_org and upper(y.code) = v_mgr)
      ) then
        v_errors := v_errors || jsonb_build_object('row', line, 'field', 'Reports to',
          'message', format('%s is further down the sheet. Move their row above row %s, so the manager is added first.', v_mgr, line));
      else
        select * into e from public.employees where org_id = v_org and upper(code) = v_mgr;
        if e.id is null then
          v_errors := v_errors || jsonb_build_object('row', line, 'field', 'Reports to',
            'message', format('No employee has the code %s. Add them above row %s or fix the code.', v_mgr, line));
        elsif e.status <> 'active' then
          v_errors := v_errors || jsonb_build_object('row', line, 'field', 'Reports to',
            'message', format('%s (%s) has left, so they cannot approve anybody''s day.', e.name, v_mgr));
        elsif coalesce(v_app ->> v_mgr, case e.mobile_role when 'ASM' then 'manager' else 'field' end) <> 'manager' then
          v_errors := v_errors || jsonb_build_object('row', line, 'field', 'Reports to',
            'message', format('%s is a %s, which does not open the manager app, so they cannot approve anybody''s day.', e.name, e.designation));
        end if;
        if v_code <> '' then v_line_mgr := v_line_mgr || jsonb_build_object(v_code, v_mgr); end if;
        -- e was borrowed for the manager; read this row's person back.
        e := null;
        if v_code <> '' then select * into e from public.employees where org_id = v_org and upper(code) = v_code; end if;
      end if;
    elsif e.id is null and coalesce(d.app_view, '') = 'field' then
      v_errors := v_errors || jsonb_build_object('row', line, 'field', 'Reports to',
        'message', 'A field role needs a manager to approve their day, leave and claims. Write the manager''s employee code.');
    end if;

    -- Joined on
    select * into v_date from public.sheet_date(public.sheet_text(r, 'joined_on'));
    if not v_date.ok then
      v_errors := v_errors || jsonb_build_object('row', line, 'field', 'Joined on',
        'message', format('"%s" is not a date we can read. Write it as 2026-04-01, 01/04/2026 or 1 Apr 2026.', public.sheet_text(r, 'joined_on')));
    elsif v_date.val is null and e.id is null then
      v_errors := v_errors || jsonb_build_object('row', line, 'field', 'Joined on',
        'message', 'Write the date they joined, as 2026-04-01, 01/04/2026 or 1 Apr 2026.');
    elsif v_date.val > v_today + 90 then
      v_errors := v_errors || jsonb_build_object('row', line, 'field', 'Joined on',
        'message', format('%s is more than 90 days away. Check the year, or add them nearer the day.', to_char(v_date.val, 'FMDD Mon YYYY')));
    end if;

    -- Mobile: ten digits, with or without +91
    v_txt := public.sheet_text(r, 'mobile');
    if v_txt is not null then
      v_mobile := regexp_replace(v_txt, '[\s().-]', '', 'g');
      v_mobile := regexp_replace(v_mobile, '^(\+91|0091|91(?=\d{10}$)|0(?=\d{10}$))', '');
      if v_mobile !~ '^\d{10}$' then
        v_errors := v_errors || jsonb_build_object('row', line, 'field', 'Mobile',
          'message', format('"%s" is not a 10 digit mobile number. It may start with +91.', v_txt));
      end if;
    end if;

    -- Email: every login is delivered by email, so a new person needs one
    v_email := lower(coalesce(public.sheet_text(r, 'email'), ''));
    if v_email = '' then
      if e.id is null then
        v_errors := v_errors || jsonb_build_object('row', line, 'field', 'Email',
          'message', 'Write their email. Their login and password resets are sent there.');
      end if;
    elsif v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      v_errors := v_errors || jsonb_build_object('row', line, 'field', 'Email',
        'message', format('"%s" is not an email address.', public.sheet_text(r, 'email')));
    elsif v_email like '%@%.mrsales.local' then
      v_errors := v_errors || jsonb_build_object('row', line, 'field', 'Email',
        'message', 'Use their real work or personal email, not a mrsales.local address.');
    end if;

    -- Basic salary, from owner and HR only
    v_txt := public.sheet_text(r, 'basic');
    if v_txt is not null then
      select * into v_num from public.sheet_number(v_txt);
      if v_role not in ('owner', 'hr') then
        v_errors := v_errors || jsonb_build_object('row', line, 'field', 'Basic salary',
          'message', 'Only an owner or HR may set pay. Leave this column empty.');
      elsif not v_num.ok or v_num.val <= 0 then
        v_errors := v_errors || jsonb_build_object('row', line, 'field', 'Basic salary',
          'message', format('"%s" is not an amount. Write the monthly basic in rupees, like 18000.', v_txt));
      elsif e.id is not null then
        select s.basic into v_last from public.employee_salaries s
         where s.employee_id = e.id order by s.effective_from desc limit 1;
        if v_last is not null and v_last <> v_num.val then
          v_errors := v_errors || jsonb_build_object('row', line, 'field', 'Basic salary',
            'message', format('%s already has a salary of %s. Change it under Expenses and pay, Salaries, with the date it applies from.', e.name, v_last));
        end if;
      end if;
    end if;

    if v_code <> '' then
      if e.id is null then v_create := v_create + 1; else v_update := v_update + 1; end if;
    end if;
  end loop;

  -- A reporting line that comes back to where it started has nobody at the top.
  for r in select * from jsonb_array_elements(p_rows) loop
    v_code := upper(coalesce(public.sheet_text(r, 'code'), ''));
    if v_code = '' or nullif(public.sheet_text(r, 'reports_to'), '') is null then continue; end if;
    v_walk := v_line_mgr ->> v_code;
    v_guard := 0;
    while v_walk is not null and v_guard < 200 loop
      if v_walk = v_code then
        v_errors := v_errors || jsonb_build_object('row', coalesce((r ->> 'row')::int, 0), 'field', 'Reports to',
          'message', format('This makes a loop: %s would end up reporting to themselves further up the line. Fix one of the managers in the chain.', v_code));
        exit;
      end if;
      v_walk := v_line_mgr ->> v_walk;
      v_guard := v_guard + 1;
    end loop;
  end loop;

  -- Seats
  select seat_limit into v_limit from public.org_entitlements where org_id = v_org;
  if v_limit is not null and v_create > 0 then
    select count(*) into v_used from public.employees where org_id = v_org and status = 'active';
    if v_used + v_create > v_limit then
      v_errors := v_errors || jsonb_build_object('row', 0, 'field', 'Seats',
        'message', format('Your plan has %s seats and %s are in use, so %s more %s not fit. Remove %s %s, mark people who have left, or ask Mr Sales for more seats.',
                          v_limit, v_used, v_create, case when v_create = 1 then 'person does' else 'people do' end,
                          v_used + v_create - v_limit, case when v_used + v_create - v_limit = 1 then 'row' else 'rows' end));
    end if;
  end if;

  if jsonb_array_length(v_errors) > 0 or not p_commit then
    return jsonb_build_object(
      'sheet', 'people', 'total', n,
      'create', v_create, 'update', v_update,
      'rejected', jsonb_array_length(v_errors),
      'committed', false,
      'errors', v_errors,
      'created', '[]'::jsonb
    );
  end if;

  /* ── second pass: write, in sheet order, so managers come first ─────── */
  for r in select * from jsonb_array_elements(p_rows) loop
    v_code := upper(public.sheet_text(r, 'code'));
    select * into e from public.employees where org_id = v_org and upper(code) = v_code;

    d := null;
    v_txt := public.sheet_text(r, 'role');
    if v_txt is not null then
      select * into d from public.designations
       where org_id = v_org and (lower(name) = lower(v_txt) or lower(short_name) = lower(v_txt))
       order by is_active desc limit 1;
    end if;

    v_terr := null; v_hq := null;
    v_txt := public.sheet_text(r, 'territory');
    if v_txt is not null then
      select t.id, t.hq into v_terr, v_hq from public.territories t
       where t.org_id = v_org and (lower(t.name) = lower(v_txt) or lower(t.hq) = lower(v_txt))
       order by (lower(t.name) = lower(v_txt)) desc limit 1;
    end if;
    v_hq := coalesce(public.sheet_text(r, 'hq'), v_hq);

    v_mgr_id := null;
    v_mgr := upper(coalesce(public.sheet_text(r, 'reports_to'), ''));
    if v_mgr <> '' then
      select id into v_mgr_id from public.employees where org_id = v_org and upper(code) = v_mgr;
    end if;

    v_mobile := null;
    if public.sheet_text(r, 'mobile') is not null then
      v_mobile := regexp_replace(regexp_replace(public.sheet_text(r, 'mobile'), '[\s().-]', '', 'g'),
                                 '^(\+91|0091|91(?=\d{10}$)|0(?=\d{10}$))', '');
    end if;
    v_email := lower(public.sheet_text(r, 'email'));
    select * into v_date from public.sheet_date(public.sheet_text(r, 'joined_on'));
    v_basic := (public.sheet_number(public.sheet_text(r, 'basic'))).val;

    if e.id is null then
      insert into public.employees (
        org_id, code, name, designation_id, mobile_role, designation, designation_short, department,
        manager_id, territory_id, hq, joined_at, mobile, email
      ) values (
        v_org, v_code, public.sheet_text(r, 'name'), d.id, public.mobile_role_for(d.app_view), d.name, d.short_name,
        coalesce(public.sheet_text(r, 'department'), 'Sales & Marketing'),
        v_mgr_id, v_terr, coalesce(v_hq, ''), v_date.val, v_mobile, v_email
      )
      returning id into v_id;

      if v_mgr_id is not null then
        insert into public.manager_assignments (org_id, employee_id, manager_id, period, changed_by)
        values (v_org, v_id, v_mgr_id, daterange(least(v_date.val, v_today), null), auth.uid());
      end if;

      if v_basic is not null then
        insert into public.employee_salaries (org_id, employee_id, effective_from, basic, note, created_by)
        values (v_org, v_id, v_date.val, v_basic, 'From the people import', auth.uid())
        on conflict (employee_id, effective_from) do nothing;
      end if;

      v_created := v_created || jsonb_build_object('id', v_id, 'code', v_code);
    else
      v_id := e.id;
      update public.employees set
        name              = coalesce(public.sheet_text(r, 'name'), name),
        designation_id    = coalesce(d.id, designation_id),
        mobile_role       = case when d.id is null then mobile_role else public.mobile_role_for(d.app_view) end,
        designation       = coalesce(d.name, designation),
        designation_short = coalesce(d.short_name, designation_short),
        department        = coalesce(public.sheet_text(r, 'department'), department),
        territory_id      = coalesce(v_terr, territory_id),
        hq                = coalesce(v_hq, hq),
        joined_at         = coalesce(v_date.val, joined_at),
        mobile            = coalesce(v_mobile, mobile),
        email             = coalesce(v_email, email),
        updated_at        = now()
      where id = e.id;

      -- A new manager from today, closing the old line rather than editing it,
      -- exactly as reassign_manager does.
      if v_mgr_id is not null and v_mgr_id is distinct from e.manager_id then
        delete from public.manager_assignments
         where employee_id = e.id and org_id = v_org and lower(period) >= v_today;
        update public.manager_assignments
           set period = daterange(lower(period), v_today)
         where employee_id = e.id and org_id = v_org
           and lower(period) < v_today and (upper_inf(period) or upper(period) > v_today);
        insert into public.manager_assignments (org_id, employee_id, manager_id, period, changed_by)
        values (v_org, e.id, v_mgr_id, daterange(v_today, null), auth.uid());
        update public.employees set manager_id = v_mgr_id where id = e.id;
        insert into public.audit_log (org_id, actor_user, actor_name, action, entity, entity_id, entity_label,
                                      before_value, after_value, reason)
        values (v_org, auth.uid(), public.current_actor_name(), 'changed manager', 'Employee', e.id, e.name,
                coalesce((select name from public.employees where id = e.manager_id), 'nobody'),
                (select name from public.employees where id = v_mgr_id), 'People import');
      end if;

      if v_basic is not null and not exists (select 1 from public.employee_salaries where employee_id = e.id) then
        insert into public.employee_salaries (org_id, employee_id, effective_from, basic, note, created_by)
        values (v_org, e.id, coalesce(v_date.val, e.joined_at), v_basic, 'From the people import', auth.uid())
        on conflict (employee_id, effective_from) do nothing;
      end if;
    end if;
  end loop;

  insert into public.audit_log (org_id, actor_user, actor_name, action, entity, entity_label)
  values (v_org, auth.uid(), public.current_actor_name(),
          format('imported %s %s, updated %s', v_create, case when v_create = 1 then 'person' else 'people' end, v_update),
          'Employee', format('%s added, %s updated', v_create, v_update));

  return jsonb_build_object('sheet', 'people', 'total', n, 'create', v_create,
                            'update', v_update, 'rejected', 0, 'committed', true,
                            'errors', '[]'::jsonb, 'created', v_created);
end $$;

revoke all on function public.import_people(jsonb, boolean) from public, anon;
grant execute on function public.import_people(jsonb, boolean) to authenticated;
