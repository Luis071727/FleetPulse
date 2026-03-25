create or replace function public.link_current_user_to_carrier()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_carrier_id uuid;
begin
  if auth.uid() is null then
    return null;
  end if;

  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if v_email = '' then
    return null;
  end if;

  update public.carriers
  set
    user_id = auth.uid(),
    email = coalesce(email, v_email)
  where lower(coalesce(email, contact_email)) = v_email
    and (user_id is null or user_id = auth.uid())
  returning id into v_carrier_id;

  return v_carrier_id;
end;
$$;

grant execute on function public.link_current_user_to_carrier() to authenticated;

drop policy if exists carriers_update_own_doc_requests on public.document_requests;
create policy carriers_update_own_doc_requests
  on public.document_requests
  for update
  using (
    load_id in (
      select id
      from public.loads
      where carrier_id in (
        select id from public.carriers where user_id = auth.uid()
      )
    )
  )
  with check (
    load_id in (
      select id
      from public.loads
      where carrier_id in (
        select id from public.carriers where user_id = auth.uid()
      )
    )
  );

drop policy if exists carriers_see_own_messages on public.messages;
create policy carriers_see_own_messages
  on public.messages
  for all
  using (
    load_id in (
      select id
      from public.loads
      where carrier_id in (
        select id from public.carriers where user_id = auth.uid()
      )
    )
  )
  with check (
    load_id in (
      select id
      from public.loads
      where carrier_id in (
        select id from public.carriers where user_id = auth.uid()
      )
    )
  );
