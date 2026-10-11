create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default '', avatar_path text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.households (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 100),
 owner_id uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.household_members (
 household_id uuid not null references public.households(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check(role in ('owner','admin','member')),
 joined_at timestamptz not null default now(), primary key(household_id,user_id)
);
create table public.household_invites (
 id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
 token_hash text not null unique, created_by uuid not null references auth.users(id),
 expires_at timestamptz not null, max_uses integer not null default 1 check(max_uses between 1 and 20),
 used_count integer not null default 0 check(used_count>=0), revoked_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.medicines (
 id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 200), inn text, dosage text, form text, manufacturer text, barcode text,
 categories text[] not null default '{}', indications text[] not null default '{}', instructions text, contraindications text,
 photo_path text, favorite boolean not null default false, needs_review boolean not null default false, review_note text,
 source_text text, source_id integer, created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(id,household_id), unique(household_id,source_id)
);
create table public.inventory_batches (
 id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
 medicine_id uuid not null, initial_quantity numeric not null check(initial_quantity>=0), quantity numeric not null check(quantity>=0),
 quantity_unknown boolean not null default false, unit text not null check(length(trim(unit))>0), expires_on date, expiry_precision text, purchased_on date, opened_on date,
 storage_location text, lot_number text, notes text, created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(medicine_id,household_id) references public.medicines(id,household_id) on delete cascade,
 unique(id,household_id,medicine_id)
);
create table public.usage_logs (
 id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
 medicine_id uuid not null, inventory_batch_id uuid,
 request_id uuid not null unique, quantity numeric not null check(quantity>0), unit text not null,
 used_by uuid not null references auth.users(id), used_at timestamptz not null default now(), note text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(medicine_id,household_id) references public.medicines(id,household_id) on delete cascade,
 foreign key(inventory_batch_id,household_id,medicine_id) references public.inventory_batches(id,household_id,medicine_id) on delete set null(inventory_batch_id)
);
create table public.shopping_items (
 id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
 medicine_id uuid, title text not null check(length(trim(title))>0), desired_quantity numeric check(desired_quantity>0), unit text,
 status text not null default 'needed' check(status in ('needed','ordered','purchased','dismissed')),
 added_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(medicine_id,household_id) references public.medicines(id,household_id) on delete set null(medicine_id)
);
create table public.notification_preferences (
 user_id uuid not null references auth.users(id) on delete cascade,
 household_id uuid not null references public.households(id) on delete cascade,
 expiry_warning_days integer not null default 30 check(expiry_warning_days between 1 and 365),
 low_stock_enabled boolean not null default true, expiry_enabled boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(user_id,household_id)
);
create index medicines_search_idx on public.medicines(household_id,lower(name));
create index medicines_barcode_idx on public.medicines(household_id,barcode);
create index medicines_categories_idx on public.medicines using gin(categories);
create index inventory_expiry_idx on public.inventory_batches(household_id,expires_on) where quantity>0;
create index inventory_medicine_idx on public.inventory_batches(household_id,medicine_id);
create index usage_household_date_idx on public.usage_logs(household_id,used_at desc);

create function private.is_member(p_household uuid) returns boolean language sql stable security definer set search_path='' as $$
 select (select auth.uid()) is not null and exists(select 1 from public.household_members hm where hm.household_id=p_household and hm.user_id=(select auth.uid()));
$$;
create function private.has_role(p_household uuid,p_roles text[]) returns boolean language sql stable security definer set search_path='' as $$
 select (select auth.uid()) is not null and exists(select 1 from public.household_members hm where hm.household_id=p_household and hm.user_id=(select auth.uid()) and hm.role=any(p_roles));
$$;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
revoke all on function private.is_member(uuid),private.has_role(uuid,text[]) from public, anon;
grant execute on function private.is_member(uuid),private.has_role(uuid,text[]) to authenticated;

create function private.touch_updated_at() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now();return new;end $$;
create trigger profiles_touch before update on public.profiles for each row execute function private.touch_updated_at();
create trigger households_touch before update on public.households for each row execute function private.touch_updated_at();
create trigger invites_touch before update on public.household_invites for each row execute function private.touch_updated_at();
create trigger medicines_touch before update on public.medicines for each row execute function private.touch_updated_at();
create trigger batches_touch before update on public.inventory_batches for each row execute function private.touch_updated_at();
create trigger usage_touch before update on public.usage_logs for each row execute function private.touch_updated_at();
create trigger shopping_touch before update on public.shopping_items for each row execute function private.touch_updated_at();
create trigger preferences_touch before update on public.notification_preferences for each row execute function private.touch_updated_at();
create function private.protect_ownership() returns trigger language plpgsql set search_path='' as $$
 begin
 if new.household_id is distinct from old.household_id or new.created_by is distinct from old.created_by then raise exception 'Ownership cannot be changed';end if;
 return new;end $$;
create trigger medicines_ownership before update on public.medicines for each row execute function private.protect_ownership();
create trigger batches_ownership before update on public.inventory_batches for each row execute function private.protect_ownership();
create function private.protect_shopping() returns trigger language plpgsql set search_path='' as $$
 begin if new.household_id is distinct from old.household_id or new.added_by is distinct from old.added_by then raise exception 'Ownership cannot be changed';end if;return new;end $$;
create trigger shopping_ownership before update on public.shopping_items for each row execute function private.protect_shopping();
create function private.create_profile() returns trigger language plpgsql security definer set search_path='' as $$
 begin insert into public.profiles(id,display_name) values(new.id,coalesce(nullif(new.raw_user_meta_data->>'display_name',''),split_part(new.email,'@',1),''));return new;end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.create_profile();

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;
alter table public.medicines enable row level security;
alter table public.inventory_batches enable row level security;
alter table public.usage_logs enable row level security;
alter table public.shopping_items enable row level security;
alter table public.notification_preferences enable row level security;

create policy profiles_read on public.profiles for select to authenticated using(id=(select auth.uid()) or exists(select 1 from public.household_members a join public.household_members b on a.household_id=b.household_id where a.user_id=(select auth.uid()) and b.user_id=profiles.id));
create policy profiles_update on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
create policy households_read on public.households for select to authenticated using(private.is_member(id));
create policy households_update on public.households for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy households_delete on public.households for delete to authenticated using(owner_id=(select auth.uid()));
create policy members_read on public.household_members for select to authenticated using(private.is_member(household_id));
create policy invites_read on public.household_invites for select to authenticated using(private.has_role(household_id,array['owner','admin']));
create policy medicines_read on public.medicines for select to authenticated using(private.is_member(household_id));
create policy medicines_insert on public.medicines for insert to authenticated with check(private.is_member(household_id) and created_by=(select auth.uid()));
create policy medicines_update on public.medicines for update to authenticated using(private.is_member(household_id)) with check(private.is_member(household_id));
create policy medicines_delete on public.medicines for delete to authenticated using(private.is_member(household_id));
create policy batches_read on public.inventory_batches for select to authenticated using(private.is_member(household_id));
create policy batches_insert on public.inventory_batches for insert to authenticated with check(private.is_member(household_id) and created_by=(select auth.uid()));
create policy batches_update on public.inventory_batches for update to authenticated using(private.is_member(household_id)) with check(private.is_member(household_id));
create policy batches_delete on public.inventory_batches for delete to authenticated using(private.is_member(household_id));
create policy usage_read on public.usage_logs for select to authenticated using(private.is_member(household_id));
create policy shopping_read on public.shopping_items for select to authenticated using(private.is_member(household_id));
create policy shopping_insert on public.shopping_items for insert to authenticated with check(private.is_member(household_id) and added_by=(select auth.uid()));
create policy shopping_update on public.shopping_items for update to authenticated using(private.is_member(household_id)) with check(private.is_member(household_id));
create policy shopping_delete on public.shopping_items for delete to authenticated using(private.is_member(household_id));
create policy prefs_read on public.notification_preferences for select to authenticated using(user_id=(select auth.uid()) and private.is_member(household_id));
create policy prefs_insert on public.notification_preferences for insert to authenticated with check(user_id=(select auth.uid()) and private.is_member(household_id));
create policy prefs_update on public.notification_preferences for update to authenticated using(user_id=(select auth.uid()) and private.is_member(household_id)) with check(user_id=(select auth.uid()) and private.is_member(household_id));

create function public.create_household(p_name text) returns uuid language plpgsql security definer set search_path='' as $$
 declare v_id uuid; begin
 if (select auth.uid()) is null then raise exception 'Authentication required';end if;
 if length(trim(p_name)) not between 1 and 100 then raise exception 'Invalid name';end if;
 insert into public.households(name,owner_id) values(trim(p_name),(select auth.uid())) returning id into v_id;
 insert into public.household_members(household_id,user_id,role) values(v_id,(select auth.uid()),'owner');return v_id;
 end $$;
create function public.create_household_invite(p_household_id uuid) returns text language plpgsql security definer set search_path='' as $$
 declare v_token text;begin
 if not private.has_role(p_household_id,array['owner','admin']) then raise exception 'Not allowed';end if;
 v_token=encode(extensions.gen_random_bytes(24),'hex');
 insert into public.household_invites(household_id,token_hash,created_by,expires_at) values(p_household_id,encode(extensions.digest(v_token,'sha256'),'hex'),(select auth.uid()),now()+interval '7 days');return v_token;
 end $$;
create function public.accept_household_invite(p_token text) returns uuid language plpgsql security definer set search_path='' as $$
 declare v_invite public.household_invites%rowtype;begin
 if (select auth.uid()) is null then raise exception 'Authentication required';end if;
 select * into v_invite from public.household_invites where token_hash=encode(extensions.digest(trim(p_token),'sha256'),'hex') for update;
 if not found or v_invite.revoked_at is not null or v_invite.expires_at<=now() or v_invite.used_count>=v_invite.max_uses then raise exception 'Invite is invalid or expired';end if;
 if exists(select 1 from public.household_members where household_id=v_invite.household_id and user_id=(select auth.uid())) then return v_invite.household_id;end if;
 insert into public.household_members(household_id,user_id,role) values(v_invite.household_id,(select auth.uid()),'member');
 update public.household_invites set used_count=used_count+1 where id=v_invite.id;return v_invite.household_id;
 end $$;
create function public.remove_household_member(p_household_id uuid,p_user_id uuid) returns void language plpgsql security definer set search_path='' as $$
 declare v_role text;begin
 if not private.has_role(p_household_id,array['owner','admin']) then raise exception 'Not allowed';end if;
 select role into v_role from public.household_members where household_id=p_household_id and user_id=p_user_id;
 if v_role='owner' then raise exception 'Owner cannot be removed';end if;
 if v_role='admin' and not private.has_role(p_household_id,array['owner']) then raise exception 'Only owner may remove admin';end if;
 delete from public.household_members where household_id=p_household_id and user_id=p_user_id;
 end $$;
create function public.use_medicine(p_household_id uuid,p_batch_id uuid,p_quantity numeric,p_note text,p_request_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
 declare v_batch public.inventory_batches%rowtype;v_id uuid;begin
 if not private.is_member(p_household_id) then raise exception 'Not allowed';end if;
 if p_quantity<=0 or p_quantity is null then raise exception 'Invalid quantity';end if;
 select id into v_id from public.usage_logs where request_id=p_request_id and household_id=p_household_id;
 if found then return v_id;end if;
 select * into v_batch from public.inventory_batches where id=p_batch_id and household_id=p_household_id for update;
 if not found or v_batch.quantity<p_quantity then raise exception 'Not enough quantity';end if;
 if v_batch.expires_on<current_date then raise exception 'Expired batch';end if;
 update public.inventory_batches set quantity=quantity-p_quantity where id=p_batch_id;
 insert into public.usage_logs(household_id,medicine_id,inventory_batch_id,request_id,quantity,unit,used_by,note)
 values(p_household_id,v_batch.medicine_id,p_batch_id,p_request_id,p_quantity,v_batch.unit,(select auth.uid()),p_note) returning id into v_id;
 return v_id;end $$;
create function public.import_inventory(p_household_id uuid,p_rows jsonb) returns integer language plpgsql security definer set search_path='' as $$
 declare r jsonb;v_id uuid;v_count integer:=0;v_source_id integer;begin
 if not private.is_member(p_household_id) then raise exception 'Not allowed';end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>500 then raise exception 'Invalid import';end if;
 for r in select * from jsonb_array_elements(p_rows) loop
  if nullif(trim(r->>'name'),'') is null or length(r->>'name')>200 then raise exception 'Invalid name';end if;
  v_source_id=(r->>'source_id')::integer;
  insert into public.medicines(household_id,name,dosage,form,needs_review,review_note,source_text,source_id,created_by)
  values(p_household_id,r->>'name',r->>'dosage',r->>'form',coalesce((r->>'needs_review')::boolean,false),r->>'review_note',r->>'source_text',v_source_id,(select auth.uid()))
  on conflict(household_id,source_id) do nothing returning id into v_id;
  if v_id is not null then
   insert into public.inventory_batches(household_id,medicine_id,initial_quantity,quantity,quantity_unknown,unit,expires_on,expiry_precision,storage_location,notes,created_by)
   values(p_household_id,v_id,coalesce((r->>'quantity')::numeric,0),coalesce((r->>'quantity')::numeric,0),r->>'quantity' is null,coalesce(nullif(r->>'unit',''),'не указано'),nullif(r->>'expires_on','')::date,r->>'expiry_precision',r->>'storage_location',r->>'review_note',(select auth.uid()));
   v_count=v_count+1;
  end if;v_id=null;
 end loop;return v_count;end $$;
revoke all on function public.create_household(text),public.create_household_invite(uuid),public.accept_household_invite(text),public.remove_household_member(uuid,uuid),public.use_medicine(uuid,uuid,numeric,text,uuid),public.import_inventory(uuid,jsonb) from public,anon;
grant execute on function public.create_household(text),public.create_household_invite(uuid),public.accept_household_invite(text),public.remove_household_member(uuid,uuid),public.use_medicine(uuid,uuid,numeric,text,uuid),public.import_inventory(uuid,jsonb) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('medicine-images','medicine-images',false,5242880,array['image/webp','image/jpeg','image/png']) on conflict(id) do nothing;
create policy images_read on storage.objects for select to authenticated using(bucket_id='medicine-images' and private.is_member((storage.foldername(name))[1]::uuid));
create policy images_insert on storage.objects for insert to authenticated with check(bucket_id='medicine-images' and private.is_member((storage.foldername(name))[1]::uuid) and exists(select 1 from public.medicines m where m.id::text=(storage.foldername(name))[2] and m.household_id::text=(storage.foldername(name))[1]));
create policy images_delete on storage.objects for delete to authenticated using(bucket_id='medicine-images' and exists(select 1 from public.medicines m where m.id::text=(storage.foldername(name))[2] and m.household_id::text=(storage.foldername(name))[1] and private.is_member(m.household_id)));
