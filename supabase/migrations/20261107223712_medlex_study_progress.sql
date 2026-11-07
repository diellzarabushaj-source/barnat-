create table public.medlex_study_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision integer not null check (revision > 0),
  mutation_id uuid not null,
  snapshot jsonb not null check (
    jsonb_typeof(snapshot) = 'object' and octet_length(snapshot::text) <= 65536
  ),
  updated_at timestamptz not null default now()
);

alter table public.medlex_study_progress enable row level security;
alter table public.medlex_study_progress force row level security;
revoke all on table public.medlex_study_progress from public, anon, authenticated, service_role;
grant select, insert, update on table public.medlex_study_progress to service_role;
