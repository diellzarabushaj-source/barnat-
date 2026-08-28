create table if not exists public.prescription_chapters (
  slug text primary key,
  title_sq text not null,
  description_sq text not null default '',
  atc_groups text[] not null default '{}',
  diagnosis_keywords text[] not null default '{}',
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prescription_chapters_slug_format_check
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint prescription_chapters_title_nonempty_check
    check (btrim(title_sq) <> ''),
  constraint prescription_chapters_sort_nonnegative_check
    check (sort_order >= 0)
);

alter table public.prescription_chapters enable row level security;

drop policy if exists "prescription chapters are readable" on public.prescription_chapters;
create policy "prescription chapters are readable"
  on public.prescription_chapters
  for select
  to authenticated
  using (is_active = true);

grant select on public.prescription_chapters to authenticated;

insert into public.prescription_chapters
  (slug,title_sq,description_sq,atc_groups,diagnosis_keywords,sort_order,is_active)
values
  ('gastro-metabolizem','Gastroenterologji & metabolizëm','Barna për traktin gastrointestinal dhe metabolizmin.',array['A'],array['gastrit','refluks','ulcer','diabet','metabol','obezitet'],10,true),
  ('hematologji','Hematologji','Barna që lidhen me gjakun, koagulimin dhe organet gjakformuese.',array['B'],array['anemi','antikoagul','tromboz','hemorragji'],20,true),
  ('kardiovaskulare','Kardiovaskulare','Hipertension, insuficiencë kardiake, aritmi dhe terapi vaskulare.',array['C'],array['hipertension','zemër','zemer','kardiak','aritmi','insuficiencë kardiake','insuficience kardiake'],30,true),
  ('dermatologji','Dermatologji','Trajtime dermatologjike dhe lokale.',array['D'],array['dermatit','ekzem','psoriaz','myk','fungal','lëkur','lekure'],40,true),
  ('urogjenitale','Urologji & gjinekologji','Sistemi urogjenital, hormonet seksuale dhe terapi gjinekologjike.',array['G'],array['cistit','uti','prostat','vaginit','kontracept','gjinekolog','urolog'],50,true),
  ('endokrinologji','Endokrinologji','Hormonet sistemike dhe çrregullimet endokrine.',array['H'],array['tiroid','hashimoto','hipotiroid','hipertiroid','adrenal','kortizol'],60,true),
  ('antiinfektive','Antiinfektive','Antibiotikë, antiviralë, antimykotikë dhe terapi sistemike kundër infeksioneve.',array['J','P'],array['infeksion','antibiotik','pneumoni','sinusit','tonsilit','parazit'],70,true),
  ('onkologji-imunologji','Onkologji & imunologji','Antineoplastikë dhe imunomodulues.',array['L'],array['kancer','onkolog','autoimun','imunosupres'],80,true),
  ('muskuloskeletal','Muskuloskeletal','Dhimbje muskuloskeletale, inflamacion dhe terapi reumatologjike.',array['M'],array['artrit','dhimbje shpine','muskul','reumat','osteoporoz'],90,true),
  ('neurologji-psikiatri','Neurologji & psikiatri','Sistemi nervor, dhimbja, epilepsia dhe shëndeti mendor.',array['N'],array['migren','epilep','depres','ankth','psikiatr','neurolog','dhimbje'],100,true),
  ('respiratore','Respiratore','Astma, SPOK dhe sëmundje të tjera të sistemit respirator.',array['R'],array['astm','spok','copd','koll','bronkit','respirator'],110,true),
  ('oftalmologji-orl','Oftalmologji & ORL','Organet shqisore, syri, veshi dhe përdorimi lokal përkatës.',array['S'],array['sy','okular','konjuktivit','vesh','otit','orl'],120,true),
  ('pediatri','Pediatri','Receta të organizuara posaçërisht për pacientë pediatrikë.',array[]::text[],array['pediatri','fëmij','femij','foshnj','kg'],130,true),
  ('urgjenca','Urgjenca','Receta dhe terapi të përdorura në situata akute ose emergjente.',array[]::text[],array['urgjenc','anafilaksi','arrest','shok','status epileptik','akut'],140,true),
  ('te-tjera','Të tjera','Receta që nuk përputhen me një kapitull klinik specifik.',array['V'],array[]::text[],999,true)
on conflict (slug) do update set
  title_sq=excluded.title_sq,
  description_sq=excluded.description_sq,
  atc_groups=excluded.atc_groups,
  diagnosis_keywords=excluded.diagnosis_keywords,
  sort_order=excluded.sort_order,
  is_active=excluded.is_active,
  updated_at=now();

alter table public.user_prescriptions
  add column if not exists chapter_key text;

alter table public.user_prescriptions
  drop constraint if exists user_prescriptions_chapter_key_fkey;

alter table public.user_prescriptions
  add constraint user_prescriptions_chapter_key_fkey
  foreign key (chapter_key)
  references public.prescription_chapters(slug)
  on update cascade
  on delete set null;

create index if not exists user_prescriptions_user_chapter_updated_idx
  on public.user_prescriptions (user_id, chapter_key, updated_at desc)
  where deleted_at is null;
