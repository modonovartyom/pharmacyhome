-- Three private household profiles. Only the Edge Function's service role can
-- read PIN verifiers; browser clients never receive hashes or salts.
create table public.family_state (
  singleton boolean primary key default true check (singleton),
  household_id uuid references public.households(id) on delete cascade,
  created_at timestamptz not null default now()
);
insert into public.family_state(singleton, household_id)
select true, id from public.households order by created_at limit 1;

create table public.family_pin_profiles (
  slot text primary key check (slot in ('mama','papa','son')),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  pin_hash text not null,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  created_at timestamptz not null default now()
);
create index family_pin_profiles_user_idx on public.family_pin_profiles(user_id);

create function public.family_claim_pin(p_slot text, p_user_id uuid, p_pin text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if length(p_pin) <> 4 or p_pin !~ '^[0-9]{4}$' or p_slot not in ('mama','papa','son') then
    raise exception 'Invalid profile or PIN';
  end if;
  insert into public.family_pin_profiles(slot, user_id, pin_hash)
  values (p_slot, p_user_id, extensions.crypt(p_pin, extensions.gen_salt('bf', 12)));
end $$;

create function public.family_verify_pin(p_slot text, p_pin text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_profile public.family_pin_profiles%rowtype;
begin
  if p_slot not in ('mama','papa','son') or p_pin !~ '^[0-9]{4}$' then
    raise exception 'Invalid profile or PIN';
  end if;
  select * into v_profile from public.family_pin_profiles where slot = p_slot for update;
  if not found then raise exception 'Profile is not configured'; end if;
  if v_profile.locked_until > now() then return null; end if;
  if extensions.crypt(p_pin, v_profile.pin_hash) <> v_profile.pin_hash then
    update public.family_pin_profiles
      set failed_attempts = case when v_profile.failed_attempts + 1 >= 5 then 0 else v_profile.failed_attempts + 1 end,
          locked_until = case when v_profile.failed_attempts + 1 >= 5 then now() + interval '15 minutes' else null end
      where slot = p_slot;
    return null;
  end if;
  update public.family_pin_profiles set failed_attempts = 0, locked_until = null where slot = p_slot;
  return v_profile.user_id;
end $$;

revoke all on function public.family_claim_pin(text, uuid, text), public.family_verify_pin(text, text)
  from public, anon, authenticated;
grant execute on function public.family_claim_pin(text, uuid, text), public.family_verify_pin(text, text)
  to service_role;

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null check (length(content) between 1 and 6000),
  medicine_id uuid references public.medicines(id) on delete set null,
  created_at timestamptz not null default now()
);
create index chat_messages_owner_date_idx on public.chat_messages(user_id, created_at desc);

alter table public.medicines
  add column if not exists info_summary text,
  add column if not exists info_sources jsonb not null default '[]'::jsonb,
  add column if not exists info_checked_at timestamptz,
  add column if not exists reference_image_url text;

alter table public.family_state enable row level security;
alter table public.family_pin_profiles enable row level security;
alter table public.chat_messages enable row level security;

revoke all on public.family_state, public.family_pin_profiles from public, anon, authenticated;
grant select, insert on public.chat_messages to authenticated;
create policy chat_own_read on public.chat_messages for select to authenticated
  using (user_id = (select auth.uid()) and private.is_member(household_id));
create policy chat_own_insert on public.chat_messages for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_member(household_id) and role = 'user');

-- A family member may update ordinary medicine fields, but sourced metadata
-- is written only by the server-side research function.
revoke update on public.medicines from authenticated;
grant update (name, inn, dosage, form, manufacturer, barcode, categories,
  indications, instructions, contraindications, photo_path, favorite,
  needs_review, review_note) on public.medicines to authenticated;
