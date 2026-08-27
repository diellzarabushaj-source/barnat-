-- Synced from Supabase production migration history.
-- version: 20260819125926
-- name: create_private_write_sync_schema

create table if not exists public.medindex_users (
  id uuid primary key default gen_random_uuid(),
  google_sub text unique,
  email text not null unique,
  display_name text,
  picture_url text,
  role text not null default 'user',
  enabled boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint medindex_users_email_lowercase check (email = lower(email)),
  constraint medindex_users_role_check check (role = any (array['editor'::text,'user'::text]))
);

create table if not exists public.user_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.medindex_users(id) on delete cascade,
  entity_type text not null default 'drug',
  entity_key text not null,
  payload jsonb not null default '{}'::jsonb,
  client_updated_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_favorites_entity_key_length check (char_length(entity_key) >= 1 and char_length(entity_key) <= 300),
  constraint user_favorites_entity_type_check check (entity_type = any (array['drug'::text,'lab'::text,'icd'::text,'protocol'::text])),
  constraint user_favorites_payload_object check (jsonb_typeof(payload) = 'object'::text),
  constraint user_favorites_user_entity_unique unique (user_id, entity_type, entity_key)
);
create index if not exists user_favorites_user_updated_idx on public.user_favorites(user_id, updated_at desc) where deleted_at is null;

create table if not exists public.user_prescriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.medindex_users(id) on delete cascade,
  client_id text not null,
  name text,
  diagnosis text,
  payload jsonb not null,
  client_updated_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_prescriptions_client_id_length check (char_length(client_id) >= 1 and char_length(client_id) <= 160),
  constraint user_prescriptions_payload_object check (jsonb_typeof(payload) = 'object'::text),
  constraint user_prescriptions_user_client_unique unique (user_id, client_id)
);
create index if not exists user_prescriptions_user_updated_idx on public.user_prescriptions(user_id, updated_at desc) where deleted_at is null;

create table if not exists public.drive_sync_sources (
  id uuid primary key default gen_random_uuid(),
  spreadsheet_id text not null,
  sheet_name text not null,
  entity_scope text not null,
  key_column text not null,
  enabled boolean not null default true,
  last_drive_modified_at timestamptz,
  last_synced_at timestamptz,
  last_status text not null default 'pending',
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  auth_secret_hash text,
  constraint drive_sync_sources_identity_key unique (spreadsheet_id, sheet_name),
  constraint drive_sync_sources_secret_hash_check check (auth_secret_hash is null or auth_secret_hash ~ '^[0-9a-f]{64}$'::text),
  constraint drive_sync_sources_status_check check (last_status = any (array['pending'::text,'syncing'::text,'synced'::text,'partial'::text,'failed'::text]))
);

create table if not exists public.drive_sheet_rows (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.drive_sync_sources(id) on delete cascade,
  row_key text not null,
  row_number integer,
  payload jsonb not null default '{}'::jsonb,
  source_hash text not null,
  source_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint drive_sheet_rows_row_number_check check (row_number is null or row_number > 0),
  constraint drive_sheet_rows_source_key unique (source_id, row_key)
);
create index if not exists drive_sheet_rows_hash_idx on public.drive_sheet_rows(source_hash);
create index if not exists drive_sheet_rows_payload_gin_idx on public.drive_sheet_rows using gin(payload);
create index if not exists drive_sheet_rows_source_row_idx on public.drive_sheet_rows(source_id,row_number) where deleted_at is null;

create table if not exists public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  source_ref text,
  target_scope text not null,
  status text not null,
  rows_read integer not null default 0,
  rows_inserted integer not null default 0,
  rows_updated integer not null default 0,
  rows_skipped integer not null default 0,
  error_summary text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint sync_runs_status_check check (status = any (array['running'::text,'completed'::text,'partial'::text,'failed'::text]))
);

create sequence if not exists public.sync_outbox_id_seq;
create table if not exists public.sync_outbox (
  id bigint primary key default nextval('public.sync_outbox_id_seq'::regclass),
  source text not null default 'clinical_editor',
  destination text not null default 'google_sheet',
  spreadsheet_id text not null,
  sheet_name text not null,
  row_key text not null,
  payload jsonb not null,
  idempotency_key text not null unique,
  status text not null default 'pending',
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  applied_at timestamptz,
  constraint sync_outbox_attempts_check check (attempts >= 0 and attempts <= 100),
  constraint sync_outbox_status_check check (status = any (array['pending'::text,'processing'::text,'applied'::text,'failed'::text,'dead_letter'::text]))
);
alter sequence public.sync_outbox_id_seq owned by public.sync_outbox.id;
create index if not exists sync_outbox_delivery_idx on public.sync_outbox(destination,spreadsheet_id,sheet_name,status,available_at,id);
create index if not exists sync_outbox_entity_idx on public.sync_outbox((payload ->> 'registryNumber'),created_at desc);
create index if not exists sync_outbox_processing_idx on public.sync_outbox(status,updated_at) where status='processing';

create sequence if not exists public.audit_logs_id_seq;
create table if not exists public.audit_logs (
  id bigint primary key default nextval('public.audit_logs_id_seq'::regclass),
  entity_type text not null,
  entity_id uuid,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  changed_by text,
  source text,
  changed_at timestamptz not null default now()
);
alter sequence public.audit_logs_id_seq owned by public.audit_logs.id;

alter table public.medindex_users enable row level security;
alter table public.user_favorites enable row level security;
alter table public.user_prescriptions enable row level security;
alter table public.drive_sync_sources enable row level security;
alter table public.drive_sheet_rows enable row level security;
alter table public.sync_runs enable row level security;
alter table public.sync_outbox enable row level security;
alter table public.audit_logs enable row level security;

revoke all on table public.medindex_users, public.user_favorites, public.user_prescriptions, public.drive_sync_sources, public.drive_sheet_rows, public.sync_runs, public.sync_outbox, public.audit_logs from anon, authenticated;
grant select,insert,update,delete on table public.medindex_users, public.user_favorites, public.user_prescriptions, public.drive_sync_sources, public.drive_sheet_rows, public.sync_runs, public.sync_outbox, public.audit_logs to service_role;
grant usage,select on sequence public.sync_outbox_id_seq, public.audit_logs_id_seq to service_role;
