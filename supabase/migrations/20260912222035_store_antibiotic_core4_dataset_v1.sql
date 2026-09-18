create extension if not exists pgcrypto;

create table if not exists public.antibiotic_dataset_snapshots_v1 (
  id uuid primary key default gen_random_uuid(),
  dataset_key text not null,
  version text not null,
  master_version text,
  git_commit_sha text,
  source_pack text not null,
  source_date date,
  source_title text,
  source_url text,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  payload_sha256 text generated always as (encode(digest(payload::text, 'sha256'), 'hex')) stored,
  created_at timestamptz not null default now(),
  unique (dataset_key, version)
);

create table if not exists public.antibiotic_regimens_v1 (
  snapshot_id uuid not null references public.antibiotic_dataset_snapshots_v1(id) on delete restrict,
  regimen_id text not null,
  indication_id text not null,
  min_age_months integer,
  tier text,
  drug text not null,
  route text,
  frequency text,
  dose jsonb not null,
  duration jsonb not null,
  allergy jsonb not null default '[]'::jsonb,
  source_id text not null,
  regimen jsonb not null,
  created_at timestamptz not null default now(),
  primary key (snapshot_id, regimen_id)
);

create table if not exists public.antibiotic_formulations_v1 (
  snapshot_id uuid not null references public.antibiotic_dataset_snapshots_v1(id) on delete restrict,
  formulation_id text not null,
  drug text not null,
  form text not null,
  component_mg numeric,
  composition text,
  source_url text,
  formulation jsonb not null,
  created_at timestamptz not null default now(),
  primary key (snapshot_id, formulation_id)
);

create index if not exists antibiotic_regimens_v1_indication_idx on public.antibiotic_regimens_v1(indication_id);
create index if not exists antibiotic_regimens_v1_drug_idx on public.antibiotic_regimens_v1(drug);
create index if not exists antibiotic_formulations_v1_drug_idx on public.antibiotic_formulations_v1(drug);

alter table public.antibiotic_dataset_snapshots_v1 enable row level security;
alter table public.antibiotic_regimens_v1 enable row level security;
alter table public.antibiotic_formulations_v1 enable row level security;

revoke all on public.antibiotic_dataset_snapshots_v1 from anon;
revoke all on public.antibiotic_regimens_v1 from anon;
revoke all on public.antibiotic_formulations_v1 from anon;

grant select on public.antibiotic_dataset_snapshots_v1 to authenticated;
grant select on public.antibiotic_regimens_v1 to authenticated;
grant select on public.antibiotic_formulations_v1 to authenticated;

drop policy if exists antibiotic_snapshots_authenticated_read on public.antibiotic_dataset_snapshots_v1;
create policy antibiotic_snapshots_authenticated_read on public.antibiotic_dataset_snapshots_v1
  for select to authenticated using (true);

drop policy if exists antibiotic_regimens_authenticated_read on public.antibiotic_regimens_v1;
create policy antibiotic_regimens_authenticated_read on public.antibiotic_regimens_v1
  for select to authenticated using (true);

drop policy if exists antibiotic_formulations_authenticated_read on public.antibiotic_formulations_v1;
create policy antibiotic_formulations_authenticated_read on public.antibiotic_formulations_v1
  for select to authenticated using (true);

create or replace function public.prevent_antibiotic_snapshot_mutation_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Published antibiotic snapshots are immutable. Insert a new version instead.';
end;
$$;

drop trigger if exists antibiotic_snapshot_immutable_v1 on public.antibiotic_dataset_snapshots_v1;
create trigger antibiotic_snapshot_immutable_v1
before update or delete on public.antibiotic_dataset_snapshots_v1
for each row execute function public.prevent_antibiotic_snapshot_mutation_v1();

with inserted as (
  insert into public.antibiotic_dataset_snapshots_v1 (
    dataset_key, version, master_version, git_commit_sha, source_pack, source_date, source_title, source_url, payload
  ) values (
    'drx-pediatric-antibiotics-core4',
    '2026-09-13-core4-v1',
    'v4.5',
    '3785af4555dae8ca3028de03f3c5ba01502b1b97',
    'cps-core4-2022',
    date '2022-12-01',
    'Managing critical drug shortages in clinical practice — Table 1',
    'https://www.cps.ca',
    $json$
    {
      "source": {
        "id": "cps-core4-2022",
        "short": "CPS CORE4 2022",
        "title": "Managing critical drug shortages in clinical practice — Table 1",
        "date": "2022-12",
        "url": "https://www.cps.ca"
      },
      "indications": {
        "aom": {
          "source": "cps-core4-2022",
          "minAgeMonths": 6,
          "options": [
            {"id":"core4-amox-aom","tier":"first","allergy":["none","a0","a4"],"drug":"Amoxicillin","route":"PO","frequency":"2 herë/ditë","dose":{"type":"range","min":37.5,"max":45,"unit":"mg/kg/dozë","maxDose":500},"duration":{"type":"age-bands","bands":[{"maxMonths":24,"text":"10 ditë"}],"defaultText":"5 ditë"},"source":"cps-core4-2022","note":"CORE4: kapsula 250 mg ose 500 mg. Burimi lejon konsiderimin e rrumbullakimit te madhësia e kapsulës; DRx nuk e automatizon rrumbullakimin."},
            {"id":"core4-amoxclav-aom","tier":"second","allergy":["none","a0","a4"],"drug":"Amoxicillin / clavulanate","route":"PO","frequency":"2 herë/ditë","dose":{"type":"range","min":37.5,"max":45,"unit":"mg/kg/dozë","maxDose":875,"component":"amoxicillin"},"duration":{"type":"age-bands","bands":[{"maxMonths":24,"text":"10 ditë"}],"defaultText":"5 ditë"},"source":"cps-core4-2022","note":"CORE4: tableta 500/125 mg ose 875/125 mg. Doza bazohet në komponentin amoxicillin; raporti i produktit nuk ndërrohet automatikisht."},
            {"id":"core4-cefprozil-aom","tier":"allergy-low","allergy":["a1"],"drug":"Cefprozil","route":"PO","frequency":"2 herë/ditë","dose":{"type":"single","value":15,"unit":"mg/kg/dozë","maxDose":500},"duration":{"type":"age-bands","bands":[{"maxMonths":24,"text":"10 ditë"}],"defaultText":"5 ditë"},"source":"cps-core4-2022","note":"CORE4: alternativë për alergji ndaj penicilinës jo kërcënuese për jetën; tableta 250 mg ose 500 mg."},
            {"id":"core4-cefuroxime-aom","tier":"allergy-low","allergy":["a1"],"drug":"Cefuroxime","route":"PO","frequency":"2 herë/ditë","dose":{"type":"single","value":15,"unit":"mg/kg/dozë","maxDose":500},"duration":{"type":"age-bands","bands":[{"maxMonths":24,"text":"10 ditë"}],"defaultText":"5 ditë"},"source":"cps-core4-2022","note":"CORE4: alternativë për alergji ndaj penicilinës jo kërcënuese për jetën; tableta 250 mg ose 500 mg."},
            {"id":"core4-clarithro-aom","tier":"allergy-severe","allergy":["a2","a3"],"drug":"Clarithromycin","route":"PO","frequency":"2 herë/ditë","dose":{"type":"single","value":7.5,"unit":"mg/kg/dozë","maxDose":500},"duration":{"type":"age-bands","bands":[{"maxMonths":24,"text":"10 ditë"}],"defaultText":"5 ditë"},"source":"cps-core4-2022","note":"CORE4: opsioni #1 në alergji ndaj penicilinës kërcënuese për jetën; tableta 250 mg ose 500 mg."},
            {"id":"core4-azithro-aom","tier":"allergy-severe","allergy":["a2","a3"],"drug":"Azithromycin","route":"PO","frequency":"1 herë/ditë","dose":{"type":"sequence","steps":[{"label":"Dita 1","value":10,"maxDose":500},{"label":"Ditët 2–5","value":5,"maxDose":250}],"unit":"mg/kg/ditë"},"duration":{"type":"fixed","text":"5 ditë"},"source":"cps-core4-2022","note":"CORE4: opsioni #2 në alergji ndaj penicilinës kërcënuese për jetën."}
          ]
        },
        "gas": {
          "source": "cps-core4-2022",
          "options": [
            {"id":"core4-penicillin-gas","tier":"first","allergy":["none","a0","a4"],"drug":"Penicillin V","route":"PO","frequency":"2 ose 3 herë/ditë","dose":{"type":"fixed","text":"<27 kg: 300 mg · ≥27 kg: 600 mg"},"duration":{"type":"fixed","text":"10 ditë"},"source":"cps-core4-2022","note":"CORE4: tabletë 300 mg. Regjim me prag peshe; teksti mbahet i plotë që konvertuesi të mos supozojë gabimisht një dozë të vetme."},
            {"id":"core4-amoxicillin-gas","tier":"first","allergy":["none","a0","a4"],"drug":"Amoxicillin","route":"PO","frequency":"1 herë/ditë","dose":{"type":"single","value":50,"unit":"mg/kg/dozë","maxDose":1000,"maxLabel":"maks. 1000 mg/ditë"},"duration":{"type":"fixed","text":"Sipas protokollit GAS të cituar nga CPS"},"source":"cps-core4-2022","note":"CORE4: mund të ndahet edhe në 2 doza/ditë. Tabela e upload-uar nuk shtyp kohëzgjatje numerike në këtë rresht, prandaj DRx nuk e shpik."},
            {"id":"core4-cephalexin-gas","tier":"allergy-low","allergy":["a1"],"drug":"Cephalexin","route":"PO","frequency":"2 herë/ditë","dose":{"type":"single","value":20,"unit":"mg/kg/dozë","maxDose":500},"duration":{"type":"fixed","text":"Sipas protokollit GAS të cituar nga CPS"},"source":"cps-core4-2022","note":"CORE4: alergji ndaj penicilinës jo kërcënuese për jetën; tableta 250 mg ose 500 mg."},
            {"id":"core4-clarithro-gas","tier":"allergy-severe","allergy":["a2","a3"],"drug":"Clarithromycin","route":"PO","frequency":"2 herë/ditë","dose":{"type":"single","value":7.5,"unit":"mg/kg/dozë","maxDose":250},"duration":{"type":"fixed","text":"Sipas protokollit GAS të cituar nga CPS"},"source":"cps-core4-2022","note":"CORE4: alergji ndaj penicilinës kërcënuese për jetën; tabletë 250 mg."},
            {"id":"core4-azithro-gas","tier":"allergy-severe","allergy":["a2","a3"],"drug":"Azithromycin","route":"PO","frequency":"1 herë/ditë","dose":{"type":"single","value":12,"unit":"mg/kg/dozë","maxDose":500},"duration":{"type":"fixed","text":"5 ditë"},"source":"cps-core4-2022","note":"CORE4 12/2022: ky regjim është source-pinned; udhëzimet më të reja për GAS mund të japin sekuencë tjetër dhe nuk përzihen në heshtje me këtë kartë."}
          ]
        },
        "pneumonia": {
          "source": "cps-core4-2022",
          "minAgeMonths": 3,
          "options": [
            {"id":"core4-amox-pna","tier":"first","allergy":["none","a0","a4"],"drug":"Amoxicillin","route":"PO","frequency":"3 herë/ditë","dose":{"type":"range","min":20,"max":30,"unit":"mg/kg/dozë","maxDose":500},"duration":{"type":"fixed","text":"5 ditë"},"source":"cps-core4-2022","note":"CORE4: kapsula 250 mg ose 500 mg."},
            {"id":"core4-amoxclav-pna","tier":"second","allergy":["none","a0","a4"],"drug":"Amoxicillin / clavulanate","route":"PO","frequency":"3 herë/ditë","dose":{"type":"range","min":20,"max":30,"unit":"mg/kg/dozë","maxDose":500,"component":"amoxicillin"},"duration":{"type":"fixed","text":"5 ditë"},"source":"cps-core4-2022","note":"CORE4: tableta 500/125 mg ose 875/125 mg; doza bazohet në komponentin amoxicillin."},
            {"id":"core4-cefprozil-pna","tier":"allergy-low","allergy":["a1"],"drug":"Cefprozil","route":"PO","frequency":"2 herë/ditë","dose":{"type":"single","value":15,"unit":"mg/kg/dozë","maxDose":500},"duration":{"type":"fixed","text":"5 ditë"},"source":"cps-core4-2022","note":"CORE4: alergji ndaj penicilinës jo kërcënuese për jetën; tableta 250 mg ose 500 mg."},
            {"id":"core4-cefuroxime-pna","tier":"allergy-low","allergy":["a1"],"drug":"Cefuroxime","route":"PO","frequency":"2 herë/ditë","dose":{"type":"single","value":15,"unit":"mg/kg/dozë","maxDose":500},"duration":{"type":"fixed","text":"5 ditë"},"source":"cps-core4-2022","note":"CORE4: alergji ndaj penicilinës jo kërcënuese për jetën; tableta 250 mg ose 500 mg."},
            {"id":"core4-clarithro-pna-allergy","tier":"allergy-severe","allergy":["a2","a3"],"drug":"Clarithromycin","route":"PO","frequency":"2 herë/ditë","dose":{"type":"single","value":7.5,"unit":"mg/kg/dozë","maxDose":500},"duration":{"type":"fixed","text":"5 ditë"},"source":"cps-core4-2022","note":"CORE4: alergji ndaj penicilinës kërcënuese për jetën."},
            {"id":"core4-azithro-pna-allergy","tier":"allergy-severe","allergy":["a2","a3"],"drug":"Azithromycin","route":"PO","frequency":"1 herë/ditë","dose":{"type":"sequence","steps":[{"label":"Dita 1","value":10,"maxDose":500},{"label":"Ditët 2–5","value":5,"maxDose":250}],"unit":"mg/kg/ditë"},"duration":{"type":"fixed","text":"5 ditë"},"source":"cps-core4-2022","note":"CORE4: alergji ndaj penicilinës kërcënuese për jetën."},
            {"id":"core4-clarithro-pna-atypical","tier":"atypical","allergy":["none","a0","a1","a2","a3","a4"],"atypical":true,"drug":"Clarithromycin","route":"PO","frequency":"2 herë/ditë","dose":{"type":"single","value":7.5,"unit":"mg/kg/dozë","maxDose":500},"duration":{"type":"fixed","text":"5 ditë"},"source":"cps-core4-2022","note":"CORE4: opsion kur dyshohet pneumoni atipike."},
            {"id":"core4-azithro-pna-atypical","tier":"atypical","allergy":["none","a0","a1","a2","a3","a4"],"atypical":true,"drug":"Azithromycin","route":"PO","frequency":"1 herë/ditë","dose":{"type":"sequence","steps":[{"label":"Dita 1","value":10,"maxDose":500},{"label":"Ditët 2–5","value":5,"maxDose":250}],"unit":"mg/kg/ditë"},"duration":{"type":"fixed","text":"5 ditë"},"source":"cps-core4-2022","note":"CORE4: opsion kur dyshohet pneumoni atipike."}
          ]
        },
        "uti-cystitis": {
          "source": "cps-core4-2022",
          "minAgeMonths": 3,
          "options": [
            {"id":"core4-cephalexin-cystitis","tier":"first","allergy":["none","a0","a1"],"drug":"Cephalexin","route":"PO","frequency":"3 herë/ditë","dose":{"type":"range","min":15,"max":20,"unit":"mg/kg/dozë","maxDose":500},"duration":{"type":"fixed","text":"7 ditë"},"source":"cps-core4-2022","note":"CORE4: UTI ≥3 muaj, terapi empirike duke pritur urinokulturën. Tableta 250 mg ose 500 mg."},
            {"id":"core4-tmpsmx-cystitis","tier":"option","allergy":["none","a0","a1","a2","a3","a4"],"drug":"Trimethoprim / sulfamethoxazole","route":"PO","frequency":"2 herë/ditë","dose":{"type":"range","min":4,"max":6,"unit":"mg/kg/dozë","maxDose":160,"component":"trimethoprim"},"duration":{"type":"fixed","text":"3 ditë"},"source":"cps-core4-2022","note":"CORE4: doza bazohet në komponentin trimethoprim; tableta 80/400 mg ose 160/800 mg."},
            {"id":"core4-cefixime-cystitis","tier":"option","allergy":["none","a0","a1","a2"],"drug":"Cefixime","route":"PO","frequency":"1 herë/ditë","dose":{"type":"single","value":8,"unit":"mg/kg/dozë","maxDose":400},"duration":{"type":"fixed","text":"3 ditë"},"source":"cps-core4-2022","note":"CORE4: tabletë 400 mg."},
            {"id":"core4-amoxclav-cystitis","tier":"option","allergy":["none","a0","a4"],"drug":"Amoxicillin / clavulanate","route":"PO","frequency":"sipas pragut të peshës","dose":{"type":"fixed","text":"<35 kg: 15–20 mg/kg/dozë amoxicillin TID (maks. 500 mg) · ≥35 kg: 500/125 mg TID OSE 875/125 mg BID"},"duration":{"type":"fixed","text":"3 ditë"},"source":"cps-core4-2022","frequencyNotComputable":true,"note":"CORE4: mbaji degët <35 kg dhe ≥35 kg të ndara; mos konverto automatikisht raportin e amoxicillin/clavulanate."},
            {"id":"core4-cipro-cystitis","tier":"reserve","allergy":["none","a0","a1","a2","a3","a4"],"drug":"Ciprofloxacin","route":"PO","frequency":"2 herë/ditë","dose":{"type":"single","value":15,"unit":"mg/kg/dozë","maxDose":750},"duration":{"type":"fixed","text":"3 ditë"},"source":"cps-core4-2022","stewardship":"Kultura/ndjeshmëria dhe konteksti klinik mbeten gate; mos e kthe në zgjedhje rutinë vetëm sepse doza është në tabelë."}
          ]
        },
        "uti-pyelo": {
          "source": "cps-core4-2022",
          "minAgeMonths": 3,
          "options": [
            {"id":"core4-cephalexin-pyelo","tier":"first","allergy":["none","a0","a1"],"drug":"Cephalexin","route":"PO","frequency":"3 herë/ditë","dose":{"type":"range","min":15,"max":20,"unit":"mg/kg/dozë","maxDose":500},"duration":{"type":"fixed","text":"7 ditë"},"source":"cps-core4-2022","note":"CORE4: UTI ≥3 muaj, terapi empirike duke pritur urinokulturën."},
            {"id":"core4-tmpsmx-pyelo","tier":"option","allergy":["none","a0","a1","a2","a3","a4"],"drug":"Trimethoprim / sulfamethoxazole","route":"PO","frequency":"2 herë/ditë","dose":{"type":"range","min":4,"max":6,"unit":"mg/kg/dozë","maxDose":160,"component":"trimethoprim"},"duration":{"type":"fixed","text":"7–10 ditë"},"source":"cps-core4-2022","note":"CORE4: doza bazohet në komponentin trimethoprim."},
            {"id":"core4-cefixime-pyelo","tier":"option","allergy":["none","a0","a1","a2"],"drug":"Cefixime","route":"PO","frequency":"1 herë/ditë","dose":{"type":"single","value":8,"unit":"mg/kg/dozë","maxDose":400},"duration":{"type":"fixed","text":"7–10 ditë"},"source":"cps-core4-2022","note":"CORE4: tabletë 400 mg."},
            {"id":"core4-amoxclav-pyelo","tier":"option","allergy":["none","a0","a4"],"drug":"Amoxicillin / clavulanate","route":"PO","frequency":"sipas pragut të peshës","dose":{"type":"fixed","text":"<35 kg: 15–20 mg/kg/dozë amoxicillin TID (maks. 500 mg) · ≥35 kg: 500/125 mg TID OSE 875/125 mg BID"},"duration":{"type":"fixed","text":"7–10 ditë"},"source":"cps-core4-2022","frequencyNotComputable":true,"note":"CORE4: mbaji degët <35 kg dhe ≥35 kg të ndara; raporti i produktit është pjesë e dozës."},
            {"id":"core4-cipro-pyelo","tier":"reserve","allergy":["none","a0","a1","a2","a3","a4"],"drug":"Ciprofloxacin","route":"PO","frequency":"2 herë/ditë","dose":{"type":"single","value":15,"unit":"mg/kg/dozë","maxDose":750},"duration":{"type":"fixed","text":"7–10 ditë"},"source":"cps-core4-2022","stewardship":"Kultura/ndjeshmëria dhe konteksti klinik mbeten gate; pacienti i sëmurë/komplikuar kërkon eskalim."}
          ]
        }
      },
      "solidFormulations": [
        {"id":"core4-penv-tab-300","drug":"Penicillin V","label":"Tabletë 300 mg · CORE4","form":"tabletë","componentMg":300,"sourceUrl":"https://www.cps.ca","note":"Formë e listuar në CPS CORE4 12/2022."},
        {"id":"core4-amoxclav-tab-500-125","drug":"Amoxicillin / clavulanate","label":"Tabletë 500/125 mg · CORE4","form":"tabletë","componentMg":500,"composition":"500 mg amoxicillin + 125 mg clavulanate","sourceUrl":"https://www.cps.ca","note":"Raporti i produktit është pjesë e regjimit CORE4."},
        {"id":"core4-cefprozil-tab-250","drug":"Cefprozil","label":"Tabletë 250 mg · CORE4","form":"tabletë","componentMg":250,"sourceUrl":"https://www.cps.ca"},
        {"id":"core4-cefprozil-tab-500","drug":"Cefprozil","label":"Tabletë 500 mg · CORE4","form":"tabletë","componentMg":500,"sourceUrl":"https://www.cps.ca"},
        {"id":"core4-cefuroxime-tab-250","drug":"Cefuroxime","label":"Tabletë 250 mg · CORE4","form":"tabletë","componentMg":250,"sourceUrl":"https://www.cps.ca"},
        {"id":"core4-cefuroxime-tab-500","drug":"Cefuroxime","label":"Tabletë 500 mg · CORE4","form":"tabletë","componentMg":500,"sourceUrl":"https://www.cps.ca"}
      ]
    }
    $json$::jsonb
  )
  on conflict (dataset_key, version) do nothing
  returning id, payload
), snap as (
  select id, payload from inserted
  union all
  select id, payload from public.antibiotic_dataset_snapshots_v1
   where dataset_key='drx-pediatric-antibiotics-core4' and version='2026-09-13-core4-v1'
  limit 1
), inds as (
  select s.id snapshot_id, e.key indication_id, e.value indication
  from snap s cross join lateral jsonb_each(s.payload->'indications') e
), regs as (
  select snapshot_id, indication_id, indication,
         jsonb_array_elements(indication->'options') regimen
  from inds
)
insert into public.antibiotic_regimens_v1 (
  snapshot_id, regimen_id, indication_id, min_age_months, tier, drug, route, frequency,
  dose, duration, allergy, source_id, regimen
)
select snapshot_id,
       regimen->>'id',
       indication_id,
       nullif(indication->>'minAgeMonths','')::integer,
       regimen->>'tier',
       regimen->>'drug',
       regimen->>'route',
       regimen->>'frequency',
       regimen->'dose',
       regimen->'duration',
       coalesce(regimen->'allergy','[]'::jsonb),
       regimen->>'source',
       regimen
from regs
on conflict do nothing;

with snap as (
  select id, payload from public.antibiotic_dataset_snapshots_v1
  where dataset_key='drx-pediatric-antibiotics-core4' and version='2026-09-13-core4-v1'
), forms as (
  select s.id snapshot_id, jsonb_array_elements(s.payload->'solidFormulations') formulation
  from snap s
)
insert into public.antibiotic_formulations_v1 (
  snapshot_id, formulation_id, drug, form, component_mg, composition, source_url, formulation
)
select snapshot_id,
       formulation->>'id',
       formulation->>'drug',
       formulation->>'form',
       nullif(formulation->>'componentMg','')::numeric,
       formulation->>'composition',
       formulation->>'sourceUrl',
       formulation
from forms
on conflict do nothing;
