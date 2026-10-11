-- The API key is inserted separately into Supabase Vault. It is never present
-- in a migration, client bundle, or Data API row.
create function public.read_family_openrouter_key()
returns text language sql security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets
  where name = 'openrouter_family_key' limit 1;
$$;
revoke all on function public.read_family_openrouter_key() from public, anon, authenticated;
grant execute on function public.read_family_openrouter_key() to service_role;
