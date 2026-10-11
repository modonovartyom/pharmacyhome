-- The family app uses the three fixed PIN profiles. Legacy email-account
-- household and invitation RPCs are no longer part of the client flow.
revoke execute on function public.create_household(text),
  public.create_household_invite(uuid), public.accept_household_invite(text),
  public.remove_household_member(uuid,uuid) from authenticated;
