grant select,update on public.profiles to authenticated;
grant select,update,delete on public.households to authenticated;
grant select on public.household_members,public.household_invites to authenticated;
grant select,insert,update,delete on public.medicines,public.inventory_batches,public.shopping_items to authenticated;
grant select on public.usage_logs to authenticated;
grant select,insert,update on public.notification_preferences to authenticated;
