-- This existing Supabase event-trigger function does not need API execute grants.
do $$ begin
 if to_regprocedure('public.rls_auto_enable()') is not null then
  revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
 end if;
end $$;

create index household_invites_created_by_idx on public.household_invites(created_by);
create index household_invites_household_idx on public.household_invites(household_id);
create index household_members_user_idx on public.household_members(user_id);
create index households_owner_idx on public.households(owner_id);
create index batches_created_by_idx on public.inventory_batches(created_by);
create index batches_medicine_household_fk_idx on public.inventory_batches(medicine_id,household_id);
create index medicines_created_by_idx on public.medicines(created_by);
create index preferences_household_idx on public.notification_preferences(household_id);
create index shopping_added_by_idx on public.shopping_items(added_by);
create index shopping_household_idx on public.shopping_items(household_id);
create index shopping_medicine_household_fk_idx on public.shopping_items(medicine_id,household_id);
create index usage_batch_household_medicine_fk_idx on public.usage_logs(inventory_batch_id,household_id,medicine_id);
create index usage_medicine_household_fk_idx on public.usage_logs(medicine_id,household_id);
create index usage_used_by_idx on public.usage_logs(used_by);
