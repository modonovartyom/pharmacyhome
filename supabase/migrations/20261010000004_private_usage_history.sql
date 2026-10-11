-- Usage changes shared stock, but each person's history is visible only to them.
drop policy if exists usage_read on public.usage_logs;
create policy usage_read_own on public.usage_logs for select to authenticated
  using (used_by = (select auth.uid()) and private.is_member(household_id));
