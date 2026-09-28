-- User-supplied pediatric weight -> default age map.
-- Applied to production Supabase on 2026-09-28.
-- Chronological age remains the authoritative value when explicitly entered.

create table if not exists public.pediatric_weight_age_defaults_v1 (
  id uuid primary key default gen_random_uuid(),
  dataset_key text not null unique,
  version text not null,
  source_kind text not null,
  source_date date not null,
  payload jsonb not null,
  payload_sha256 text generated always as (encode(extensions.digest((payload)::text, 'sha256'::text), 'hex'::text)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pediatric_weight_age_defaults_payload_object_check check (jsonb_typeof(payload) = 'object'),
  constraint pediatric_weight_age_defaults_dataset_key_check check (btrim(dataset_key) <> ''),
  constraint pediatric_weight_age_defaults_version_check check (btrim(version) <> '')
);

create table if not exists public.pediatric_weight_age_default_rows_v1 (
  snapshot_id uuid not null references public.pediatric_weight_age_defaults_v1(id) on delete cascade,
  band_order integer not null,
  band_key text not null,
  label_sq text not null,
  weight_min_kg numeric not null,
  weight_max_kg numeric,
  age_min_months numeric not null,
  age_max_months numeric,
  representative_months numeric not null,
  source_row jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (snapshot_id, band_order),
  constraint pediatric_weight_age_default_weight_min_check check (weight_min_kg > 0),
  constraint pediatric_weight_age_default_weight_span_check check (weight_max_kg is null or weight_max_kg >= weight_min_kg),
  constraint pediatric_weight_age_default_age_span_check check (age_max_months is null or age_max_months >= age_min_months)
);

create index if not exists pediatric_weight_age_default_rows_weight_idx
  on public.pediatric_weight_age_default_rows_v1 (snapshot_id, weight_min_kg, weight_max_kg);

alter table public.pediatric_weight_age_defaults_v1 enable row level security;
alter table public.pediatric_weight_age_default_rows_v1 enable row level security;
revoke all on table public.pediatric_weight_age_defaults_v1 from anon, authenticated;
revoke all on table public.pediatric_weight_age_default_rows_v1 from anon, authenticated;

insert into public.pediatric_weight_age_defaults_v1 (
  dataset_key, version, source_kind, source_date, payload, updated_at
)
values (
  'pediatric_weight_age_default_20260928',
  '2026-09-28.v1',
  'user_supplied_age_weight_ranges',
  date '2026-09-28',
  $weight_age_json${"metadata":{"title":"Pediatric weight → default age map","source":"User-supplied age/weight reference ranges, 2026-09-28","purpose":"Auto-fill a default age suggestion after weight entry; chronological age always overrides.","version":"2026-09-28.v1","unitWeight":"kg","unitAge":"months"},"bands":[{"key":"newborn","labelSq":"I porsalindur","weightMinKg":3.2,"weightMaxKg":3.5,"ageMinMonths":0,"ageMaxMonths":0,"representativeMonths":0},{"key":"6m","labelSq":"rreth 6 muaj","weightMinKg":7,"weightMaxKg":7.5,"ageMinMonths":6,"ageMaxMonths":6,"representativeMonths":6},{"key":"1y","labelSq":"rreth 1 vjeç","weightMinKg":9,"weightMaxKg":10.5,"ageMinMonths":12,"ageMaxMonths":12,"representativeMonths":12},{"key":"2y","labelSq":"rreth 2 vjeç","weightMinKg":12,"weightMaxKg":13,"ageMinMonths":24,"ageMaxMonths":24,"representativeMonths":24},{"key":"3y","labelSq":"rreth 3 vjeç","weightMinKg":14,"weightMaxKg":15,"ageMinMonths":36,"ageMaxMonths":36,"representativeMonths":36},{"key":"4_5y","labelSq":"rreth 4–5 vjeç","weightMinKg":16,"weightMaxKg":20,"ageMinMonths":48,"ageMaxMonths":60,"representativeMonths":54},{"key":"6_7y","labelSq":"rreth 6–7 vjeç","weightMinKg":20,"weightMaxKg":23,"ageMinMonths":72,"ageMaxMonths":84,"representativeMonths":78},{"key":"8_9y","labelSq":"rreth 8–9 vjeç","weightMinKg":25,"weightMaxKg":28,"ageMinMonths":96,"ageMaxMonths":108,"representativeMonths":102},{"key":"10y","labelSq":"rreth 10 vjeç","weightMinKg":31,"weightMaxKg":36,"ageMinMonths":120,"ageMaxMonths":120,"representativeMonths":120},{"key":"12y","labelSq":"rreth 12 vjeç","weightMinKg":40,"weightMaxKg":45,"ageMinMonths":144,"ageMaxMonths":144,"representativeMonths":144},{"key":"13y","labelSq":"rreth 13 vjeç","weightMinKg":45,"weightMaxKg":50,"ageMinMonths":156,"ageMaxMonths":156,"representativeMonths":156},{"key":"14y","labelSq":"rreth 14 vjeç","weightMinKg":50,"weightMaxKg":55,"ageMinMonths":168,"ageMaxMonths":168,"representativeMonths":168},{"key":"15y","labelSq":"rreth 15 vjeç","weightMinKg":55,"weightMaxKg":58,"ageMinMonths":180,"ageMaxMonths":180,"representativeMonths":180},{"key":"16plus","labelSq":"rreth 16+ vjeç","weightMinKg":60,"weightMaxKg":null,"ageMinMonths":192,"ageMaxMonths":null,"representativeMonths":192}],"interpolationAnchors":[{"months":0,"kg":3.35},{"months":6,"kg":7.25},{"months":12,"kg":9.75},{"months":24,"kg":12.5},{"months":36,"kg":14.5},{"months":54,"kg":18},{"months":78,"kg":21.5},{"months":102,"kg":26.5},{"months":120,"kg":33.5},{"months":144,"kg":42.5},{"months":156,"kg":47.5},{"months":168,"kg":52.5},{"months":180,"kg":56.5},{"months":192,"kg":60}]}$weight_age_json$::jsonb,
  now()
)
on conflict (dataset_key) do update set
  version=excluded.version,
  source_kind=excluded.source_kind,
  source_date=excluded.source_date,
  payload=excluded.payload,
  updated_at=now();

delete from public.pediatric_weight_age_default_rows_v1
where snapshot_id=(select id from public.pediatric_weight_age_defaults_v1 where dataset_key='pediatric_weight_age_default_20260928');

insert into public.pediatric_weight_age_default_rows_v1 (
  snapshot_id, band_order, band_key, label_sq, weight_min_kg, weight_max_kg,
  age_min_months, age_max_months, representative_months, source_row, updated_at
)
select
  s.id,
  band_ord::integer,
  band_value->>'key',
  band_value->>'labelSq',
  (band_value->>'weightMinKg')::numeric,
  nullif(band_value->>'weightMaxKg','')::numeric,
  (band_value->>'ageMinMonths')::numeric,
  nullif(band_value->>'ageMaxMonths','')::numeric,
  (band_value->>'representativeMonths')::numeric,
  band_value,
  now()
from public.pediatric_weight_age_defaults_v1 s
cross join lateral jsonb_array_elements(s.payload->'bands') with ordinality as bands(band_value, band_ord)
where s.dataset_key='pediatric_weight_age_default_20260928';

comment on table public.pediatric_weight_age_defaults_v1 is
  'User-supplied pediatric weight-to-default-age convenience map. Chronological age overrides inferred age.';
comment on table public.pediatric_weight_age_default_rows_v1 is
  'Query-friendly projection of the pediatric weight-to-default-age map.';
