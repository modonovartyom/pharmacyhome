create or replace function public.use_medicine(p_household_id uuid,p_batch_id uuid,p_quantity numeric,p_note text,p_request_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_batch public.inventory_batches%rowtype;v_id uuid;
begin
 if not private.is_member(p_household_id) then raise exception 'Not allowed';end if;
 if p_quantity<=0 or p_quantity is null or p_request_id is null then raise exception 'Invalid request';end if;
 -- Serialize retries using the same request ID before checking the unique usage log.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_request_id::text));
 select id into v_id from public.usage_logs where request_id=p_request_id and household_id=p_household_id;
 if found then return v_id;end if;
 select * into v_batch from public.inventory_batches where id=p_batch_id and household_id=p_household_id for update;
 if not found or v_batch.quantity<p_quantity then raise exception 'Not enough quantity';end if;
 if v_batch.expires_on<current_date then raise exception 'Expired batch';end if;
 update public.inventory_batches set quantity=quantity-p_quantity where id=p_batch_id;
 insert into public.usage_logs(household_id,medicine_id,inventory_batch_id,request_id,quantity,unit,used_by,note)
 values(p_household_id,v_batch.medicine_id,p_batch_id,p_request_id,p_quantity,v_batch.unit,(select auth.uid()),p_note) returning id into v_id;
 return v_id;
end $$;
