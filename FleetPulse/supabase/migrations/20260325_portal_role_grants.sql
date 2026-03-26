grant usage on schema public to authenticated;

grant select on table public.carriers to authenticated;
grant select on table public.loads to authenticated;
grant select, update on table public.document_requests to authenticated;
grant select, insert on table public.documents to authenticated;
grant select, insert, update on table public.compliance_documents to authenticated;
grant select, insert, update on table public.messages to authenticated;

grant execute on function public.link_current_user_to_carrier() to authenticated;
