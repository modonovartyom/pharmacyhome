-- Edge Functions use the service role for profile creation and researched
-- medicine summaries. Client permissions remain governed by RLS.
grant select, insert, update on public.households, public.household_members to service_role;
grant select, update on public.medicines to service_role;
