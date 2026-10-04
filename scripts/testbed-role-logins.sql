-- ═══════════════════════════════════════════════════════════════════════
-- Testbed Pharma: one console login for each office role.
--
-- The seed (Mr_Sales_Web/supabase/seeds/testbed.sql) makes only the Admin
-- login. The new console shows each role a different Today, menu and scope,
-- so each needs a login of its own to be run live:
--
--   hr@testbed.mrsales.local          hr          company
--   finance@testbed.mrsales.local     finance     company
--   it@testbed.mrsales.local          it          company
--   management@testbed.mrsales.local  management  team, as Rajesh Verma (TBM9001)
--
-- The password is never written here: this repository is public. It is the
-- Testbed password kept in the gitignored .env.testbed (TESTBED_PASSWORD), and
-- is given to the script as a setting in the same session:
--
--   set mrsales.testbed_password = '<the value from .env.testbed>';
--   \i scripts/testbed-role-logins.sql
--
-- Testbed only: every row carries the testbed org, and testbed_down.sql
-- removes the users of its app_users with the rest. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════
do $roles$
declare
  TESTPW constant text := nullif(current_setting('mrsales.testbed_password', true), '');
  v_org  uuid;
  v_mgr  uuid;
  v_user uuid;
  r      record;
begin
  select id into v_org from public.organisations where slug = 'testbed';
  if v_org is null then
    raise exception 'Testbed Pharma does not exist; run seeds/testbed.sql first';
  end if;
  if TESTPW is null then
    raise exception 'Set mrsales.testbed_password first (see the header)';
  end if;
  select id into v_mgr from public.employees where org_id = v_org and code = 'TBM9001';

  for r in
    select * from (values
      ('hr@testbed.mrsales.local',         'hr',         'company', null::uuid),
      ('finance@testbed.mrsales.local',    'finance',    'company', null::uuid),
      ('it@testbed.mrsales.local',         'it',         'company', null::uuid),
      ('management@testbed.mrsales.local', 'management', 'team',    v_mgr)
    ) as t(email, role, scope, employee_id)
  loop
    select id into v_user from auth.users where email = r.email;
    if v_user is null then
      v_user := gen_random_uuid();
      insert into auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at,
        -- Empty strings, not NULL: GoTrue cannot read a NULL here (see 0011).
        confirmation_token, recovery_token, email_change, email_change_token_new)
      values (
        v_user, '00000000-0000-0000-0000-000000000000', 'authenticated',
        'authenticated', r.email,
        extensions.crypt(TESTPW, extensions.gen_salt('bf')),
        now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
        now(), now(), '', '', '', '');
    else
      update auth.users
         set encrypted_password = extensions.crypt(TESTPW, extensions.gen_salt('bf')),
             email_confirmed_at = coalesce(email_confirmed_at, now())
       where id = v_user;
    end if;

    -- GoTrue signs a password in against the identity (see 0074).
    insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
    values (gen_random_uuid(), v_user, v_user::text, 'email',
            jsonb_build_object('sub', v_user::text, 'email', r.email, 'email_verified', true),
            now(), now(), now())
    on conflict do nothing;

    insert into public.app_users (user_id, org_id, employee_id, role, scope, status, email)
    values (v_user, v_org, r.employee_id, r.role, r.scope, 'active', r.email)
    on conflict (user_id) do update
      set org_id = excluded.org_id, employee_id = excluded.employee_id, role = excluded.role,
          scope = excluded.scope, status = 'active', email = excluded.email;
  end loop;
end $roles$;
