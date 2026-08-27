-- Synced from Supabase production migration history.
-- version: 20260827100011
-- name: substance_canonical_views

-- Zgjidhja e substancës kanonike.
--
-- `substance_aliases` mban një hap: variant → kanonik. Por hapat zinxhirohen
-- (`amlodipineasamlodipinebesiliate` → `amlodipineasamlodipinebesilate` →
-- `amlodipinebesilate`), ndaj lexuesi nuk mund të bëjë një join të vetëm dhe të
-- besojë se ka mbërritur në fund. Kjo pamje e ndjek zinxhirin deri në rrënjë
-- një herë, që çdo lexues të marrë përgjigjen përfundimtare me një join.

create or replace view public.substance_canonical
with (security_invoker = true) as
with recursive resolve(variant_key, canonical_key, depth) as (
  -- Çdo çelës që ekziston — qoftë te barnat, qoftë vetëm si variant — hyn si vetvetja.
  select k, k, 0
  from (
    select distinct active_substance_key as k from public.drugs where active_substance_key <> ''
    union
    select variant_key from public.substance_aliases
  ) as keys
  union all
  select r.variant_key, a.canonical_key, r.depth + 1
  from resolve r
  join public.substance_aliases a on a.variant_key = r.canonical_key
  where r.depth < 16
),
final as (
  -- Rrënja është hapi më i thellë i arritur për çdo variant.
  select distinct on (variant_key) variant_key, canonical_key
  from resolve
  order by variant_key, depth desc
),
-- Emri i shfaqjes: shkrimi më i përhapur brenda grupit. Kur dy shkrime kanë të
-- njëjtin numër barnash, ai i çelësit kanonik fiton; përndryshe fiton më i gjati,
-- sepse zakonisht mban formën e plotë të kripës.
naming as (
  select f.canonical_key,
         d.active_substance as name,
         count(*) as n,
         (d.active_substance_key = f.canonical_key) as is_root
  from final f
  join public.drugs d on d.active_substance_key = f.variant_key
  where coalesce(btrim(d.active_substance), '') <> ''
  group by f.canonical_key, d.active_substance, is_root
),
display as (
  select distinct on (canonical_key) canonical_key, name
  from naming
  order by canonical_key, is_root desc, n desc, length(name) desc, name
)
select f.variant_key,
       f.canonical_key,
       coalesce(display.name, f.canonical_key) as canonical_name
from final f
left join display on display.canonical_key = f.canonical_key;

comment on view public.substance_canonical is
  'Çdo çelës substance → çelësi kanonik përfundimtar dhe emri i tij i shfaqjes. Ndjek zinxhirët e aliaseve.';

-- Lista e substancave aktive reale: një rresht për substancë, jo për shkrim.
create or replace view public.active_substances
with (security_invoker = true) as
select c.canonical_key,
       c.canonical_name,
       count(*) as drug_count,
       count(distinct d.active_substance_key) as spelling_count,
       array_agg(distinct d.active_substance order by d.active_substance) as spellings
from public.drugs d
join public.substance_canonical c on c.variant_key = d.active_substance_key
where d.active_substance_key <> ''
group by c.canonical_key, c.canonical_name;

comment on view public.active_substances is
  'Substancat aktive pas bashkimit të varianteve: emri i shfaqjes, sa barna e përdorin dhe cilat shkrime u bashkuan.';

grant select on public.substance_canonical to anon, authenticated;
grant select on public.active_substances to anon, authenticated;
