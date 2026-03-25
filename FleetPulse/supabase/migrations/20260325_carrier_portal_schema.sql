create extension if not exists pgcrypto;

create table if not exists public.carriers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text,
  contact_email text,
  name text,
  contact_name text,
  owner_name text,
  company_name text,
  legal_name text,
  dba_name text,
  dot_number text,
  mc_number text,
  phone text,
  contact_phone text,
  invited_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz default now(),
  portal_invite_sent_at timestamptz,
  status text default 'pending',
  created_at timestamptz default now()
);

alter table public.carriers add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.carriers add column if not exists email text;
alter table public.carriers add column if not exists contact_email text;
alter table public.carriers add column if not exists name text;
alter table public.carriers add column if not exists contact_name text;
alter table public.carriers add column if not exists owner_name text;
alter table public.carriers add column if not exists company_name text;
alter table public.carriers add column if not exists legal_name text;
alter table public.carriers add column if not exists dba_name text;
alter table public.carriers add column if not exists phone text;
alter table public.carriers add column if not exists contact_phone text;
alter table public.carriers add column if not exists invited_by uuid references auth.users(id) on delete set null;
alter table public.carriers add column if not exists invited_at timestamptz default now();
alter table public.carriers add column if not exists portal_invite_sent_at timestamptz;

update public.carriers
set email = coalesce(email, contact_email)
where email is null
  and contact_email is not null;

update public.carriers
set name = coalesce(name, contact_name, owner_name)
where name is null
  and (contact_name is not null or owner_name is not null);

update public.carriers
set company_name = coalesce(company_name, dba_name, legal_name)
where company_name is null
  and (dba_name is not null or legal_name is not null);

update public.carriers
set phone = coalesce(phone, contact_phone)
where phone is null
  and contact_phone is not null;

update public.carriers
set invited_at = coalesce(invited_at, portal_invite_sent_at)
where invited_at is null
  and portal_invite_sent_at is not null;

update public.carriers as c
set user_id = u.id
from auth.users as u
where c.user_id is null
  and lower(coalesce(c.email, c.contact_email)) = lower(u.email);

create index if not exists carriers_user_id_idx on public.carriers (user_id);
create index if not exists carriers_email_idx on public.carriers (lower(email));

create or replace function public.sync_carrier_user_id_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.carriers
  set
    user_id = new.id,
    email = coalesce(public.carriers.email, new.email)
  where lower(coalesce(public.carriers.email, public.carriers.contact_email)) = lower(new.email)
    and (public.carriers.user_id is null or public.carriers.user_id = new.id);

  return new;
end;
$$;

drop trigger if exists sync_carrier_user_id_from_auth on auth.users;
create trigger sync_carrier_user_id_from_auth
after insert or update of email on auth.users
for each row
execute function public.sync_carrier_user_id_from_auth();

create table if not exists public.loads (
  id uuid primary key default gen_random_uuid(),
  load_number text,
  carrier_id uuid references public.carriers(id) on delete set null,
  dispatcher_id uuid references auth.users(id) on delete set null,
  origin text,
  origin_city text,
  origin_state text,
  destination text,
  destination_city text,
  destination_state text,
  pickup_date date,
  delivery_date date,
  status text default 'pending',
  rate numeric(10,2),
  load_rate numeric(10,2),
  rc_reference text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.loads add column if not exists load_number text;
alter table public.loads add column if not exists dispatcher_id uuid references auth.users(id) on delete set null;
alter table public.loads add column if not exists origin text;
alter table public.loads add column if not exists origin_city text;
alter table public.loads add column if not exists origin_state text;
alter table public.loads add column if not exists destination text;
alter table public.loads add column if not exists destination_city text;
alter table public.loads add column if not exists destination_state text;
alter table public.loads add column if not exists pickup_date date;
alter table public.loads add column if not exists delivery_date date;
alter table public.loads add column if not exists rate numeric(10,2);
alter table public.loads add column if not exists load_rate numeric(10,2);
alter table public.loads add column if not exists rc_reference text;
alter table public.loads add column if not exists notes text;
alter table public.loads add column if not exists updated_at timestamptz default now();

update public.loads
set load_number = coalesce(load_number, nullif(rc_reference, ''), left(id::text, 8))
where load_number is null;

update public.loads
set origin = coalesce(origin, concat_ws(', ', nullif(origin_city, ''), nullif(origin_state, '')))
where (origin is null or btrim(origin) = '')
  and (origin_city is not null or origin_state is not null);

update public.loads
set destination = coalesce(destination, concat_ws(', ', nullif(destination_city, ''), nullif(destination_state, '')))
where (destination is null or btrim(destination) = '')
  and (destination_city is not null or destination_state is not null);

update public.loads
set rate = coalesce(rate, nullif(load_rate::text, '')::numeric)
where rate is null
  and load_rate is not null;

update public.loads
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

create index if not exists loads_carrier_id_idx on public.loads (carrier_id);
create index if not exists loads_pickup_date_idx on public.loads (pickup_date);

create or replace function public.set_loads_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_loads_updated_at on public.loads;
create trigger set_loads_updated_at
before update on public.loads
for each row
execute function public.set_loads_updated_at();

create table if not exists public.document_requests (
  id uuid primary key default gen_random_uuid(),
  load_id uuid references public.loads(id) on delete cascade,
  doc_type text not null check (doc_type in ('BOL', 'POD', 'RATE_CON', 'INVOICE', 'OTHER')),
  label text,
  status text default 'pending' check (status in ('pending', 'uploaded', 'approved', 'rejected')),
  required boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  document_request_id uuid references public.document_requests(id) on delete cascade,
  load_id uuid references public.loads(id) on delete cascade,
  carrier_id uuid references public.carriers(id) on delete cascade,
  storage_path text not null,
  file_name text,
  file_type text,
  file_size_bytes integer,
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_at timestamptz default now(),
  notes text
);

create table if not exists public.compliance_documents (
  id uuid primary key default gen_random_uuid(),
  carrier_id uuid references public.carriers(id) on delete cascade,
  doc_type text not null check (doc_type in ('INSURANCE', 'CDL', 'REGISTRATION', 'INSPECTION', 'OTHER')),
  label text,
  storage_path text,
  file_name text,
  expires_at date,
  status text default 'active' check (status in ('active', 'expired', 'expiring_soon')),
  uploaded_at timestamptz default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  load_id uuid references public.loads(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  sender_role text check (sender_role in ('dispatcher', 'carrier')),
  body text not null,
  read_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.carrier_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  dispatcher_id uuid references auth.users(id) on delete set null,
  token text unique default gen_random_uuid()::text,
  accepted_at timestamptz,
  expires_at timestamptz default now() + interval '7 days',
  created_at timestamptz default now()
);

create index if not exists document_requests_load_id_idx on public.document_requests (load_id);
create index if not exists documents_load_id_idx on public.documents (load_id);
create index if not exists documents_carrier_id_idx on public.documents (carrier_id);
create index if not exists compliance_documents_carrier_id_idx on public.compliance_documents (carrier_id);
create index if not exists messages_load_id_idx on public.messages (load_id);

alter table public.carriers enable row level security;
alter table public.loads enable row level security;
alter table public.document_requests enable row level security;
alter table public.documents enable row level security;
alter table public.compliance_documents enable row level security;
alter table public.messages enable row level security;

drop policy if exists carriers_own_row on public.carriers;
create policy carriers_own_row
  on public.carriers
  for select
  using (user_id = auth.uid());

drop policy if exists carriers_see_own_loads on public.loads;
create policy carriers_see_own_loads
  on public.loads
  for select
  using (
    carrier_id in (
      select id from public.carriers where user_id = auth.uid()
    )
  );

drop policy if exists carriers_see_own_doc_requests on public.document_requests;
create policy carriers_see_own_doc_requests
  on public.document_requests
  for select
  using (
    load_id in (
      select id
      from public.loads
      where carrier_id in (
        select id from public.carriers where user_id = auth.uid()
      )
    )
  );

drop policy if exists carriers_upload_documents on public.documents;
create policy carriers_upload_documents
  on public.documents
  for insert
  with check (
    carrier_id in (
      select id from public.carriers where user_id = auth.uid()
    )
  );

drop policy if exists carriers_see_own_documents on public.documents;
create policy carriers_see_own_documents
  on public.documents
  for select
  using (
    carrier_id in (
      select id from public.carriers where user_id = auth.uid()
    )
  );

drop policy if exists carriers_see_own_compliance on public.compliance_documents;
create policy carriers_see_own_compliance
  on public.compliance_documents
  for all
  using (
    carrier_id in (
      select id from public.carriers where user_id = auth.uid()
    )
  )
  with check (
    carrier_id in (
      select id from public.carriers where user_id = auth.uid()
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

insert into storage.buckets (id, name, public)
values ('load-documents', 'load-documents', false)
on conflict (id) do nothing;

drop policy if exists carriers_upload_own_folder on storage.objects;
create policy carriers_upload_own_folder
  on storage.objects
  for insert
  with check (
    bucket_id = 'load-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists carriers_read_own_folder on storage.objects;
create policy carriers_read_own_folder
  on storage.objects
  for select
  using (
    bucket_id = 'load-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
