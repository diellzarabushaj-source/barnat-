-- Synced from Supabase production migration history.
-- version: 20260827094126
-- name: substance_canonical_key_and_aliases

-- Teksti i `drugs.active_substance` vjen nga regjistri zyrtar dhe nuk
-- mbishkruhet kurrë. Kanonizimi shtohet pranë tij: një çelës i gjeneruar për
-- variantet që ndryshojnë vetëm nga shkronjat e mëdha ose shenjat, dhe një
-- tabelë aliasesh për ato që kërkojnë gjykim (gabime shtypi, emra alternativë,
-- rend i ndryshëm përbërësish).

alter table public.drugs
  add column if not exists active_substance_key text
  generated always as (
    nullif(regexp_replace(lower(btrim(coalesce(active_substance, ''))), '[^a-z0-9]+', '', 'g'), '')
  ) stored;

create index if not exists drugs_active_substance_key_idx
  on public.drugs (active_substance_key)
  where active_substance_key is not null;

create table if not exists public.substance_aliases (
  variant_key    text primary key,
  canonical_key  text not null,
  canonical_name text not null,
  reason         text not null,
  decided_by     text not null default 'system',
  reviewed_at    timestamptz not null default now(),
  constraint substance_aliases_not_self check (variant_key <> canonical_key)
);

create index if not exists substance_aliases_canonical_idx
  on public.substance_aliases (canonical_key);

comment on table public.substance_aliases is
  'Varianti → forma kanonike e substancës aktive. Vetëm bashkime të gjykuara: '
  'gabime shtypi, emra alternativë të pranuar, rend i ndryshëm përbërësish. '
  'Nuk bashkohen kurrë forca të ndryshme, kripëra të ndryshme ose valenca vaksinash.';

-- Regjistri i vendimeve që u shqyrtuan dhe u REFUZUAN, që të mos ripropozohen.
create table if not exists public.substance_merge_rejections (
  key_a      text not null,
  key_b      text not null,
  reason     text not null,
  decided_by text not null default 'system',
  reviewed_at timestamptz not null default now(),
  primary key (key_a, key_b),
  constraint substance_merge_rejections_ordered check (key_a < key_b)
);

alter table public.substance_aliases enable row level security;
alter table public.substance_merge_rejections enable row level security;

-- Përmbajtja mjekësore lexohet nga të gjithë, si `drugs`; shkrimi mbetet te
-- çelësi i shërbimit, i cili i anashkalon politikat.
create policy substance_aliases_read on public.substance_aliases for select using (true);
create policy substance_merge_rejections_read on public.substance_merge_rejections for select using (true);
