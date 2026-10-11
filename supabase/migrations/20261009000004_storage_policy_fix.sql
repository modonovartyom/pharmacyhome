drop policy if exists images_insert on storage.objects;
drop policy if exists images_delete on storage.objects;

create policy images_insert on storage.objects for insert to authenticated
with check (
 bucket_id='medicine-images'
 and private.is_member((storage.foldername(storage.objects.name))[1]::uuid)
 and exists (
  select 1 from public.medicines m
  where m.id::text=(storage.foldername(storage.objects.name))[2]
   and m.household_id::text=(storage.foldername(storage.objects.name))[1]
 )
);

create policy images_delete on storage.objects for delete to authenticated
using (
 bucket_id='medicine-images'
 and exists (
  select 1 from public.medicines m
  where m.id::text=(storage.foldername(storage.objects.name))[2]
   and m.household_id::text=(storage.foldername(storage.objects.name))[1]
   and private.is_member(m.household_id)
 )
);
