-- Harden Favorites/Notes product identity so a saved drug can never degrade to a generic placeholder.
-- The database now owns the canonical drug link and canonical favorite metadata.

alter table public.user_favorites
  add column if not exists drug_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.user_favorites'::regclass
      and conname='user_favorites_drug_id_fkey'
  ) then
    alter table public.user_favorites
      add constraint user_favorites_drug_id_fkey
      foreign key (drug_id) references public.drugs(id) on delete restrict;
  end if;
end
$;

-- Phase 9A originally required product notes to keep drug_id NULL.
-- Relax that legacy coherence guard before backfilling the canonical FK;
-- a stricter FK-backed coherence constraint is installed below.
alter table public.user_notes
  drop constraint if exists user_notes_entity_coherence_check;

-- Canonicalize all UUID-backed product favorites already stored.
update public.user_favorites uf
set
  drug_id=d.id,
  payload=coalesce(uf.payload,'{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
    'drugId',d.id::text,
    'tradeName',d.trade_name,
    'label',d.trade_name,
    'registryNumber',d.registry_number,
    'pdid',d.pdid,
    'activeSubstance',d.active_substance,
    'strength',d.strength,
    'form',d.pharmaceutical_form,
    'atc',d.atc_code
  )),
  updated_at=greatest(uf.updated_at,now())
from public.drugs d
where uf.entity_type='product'
  and uf.entity_key=d.id::text;

-- Canonicalize the exact legacy key format pdid|trade_name|strength.
-- Exact triple matching avoids ambiguous PDIDs.
update public.user_favorites uf
set
  drug_id=d.id,
  payload=coalesce(uf.payload,'{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
    'drugId',d.id::text,
    'tradeName',d.trade_name,
    'label',d.trade_name,
    'registryNumber',d.registry_number,
    'pdid',d.pdid,
    'activeSubstance',d.active_substance,
    'strength',d.strength,
    'form',d.pharmaceutical_form,
    'atc',d.atc_code,
    'legacyEntityKey',uf.entity_key
  )),
  updated_at=greatest(uf.updated_at,now())
from public.drugs d
where uf.entity_type='drug'
  and d.pdid=split_part(uf.entity_key,'|',1)
  and lower(trim(d.trade_name))=lower(trim(split_part(uf.entity_key,'|',2)))
  and lower(trim(d.strength))=lower(trim(split_part(uf.entity_key,'|',3)))
  and not exists (
    select 1
    from public.drugs d2
    where d2.id<>d.id
      and d2.pdid=d.pdid
      and lower(trim(d2.trade_name))=lower(trim(d.trade_name))
      and lower(trim(d2.strength))=lower(trim(d.strength))
  );

-- Product notes get an FK-backed drug identity too.
update public.user_notes un
set drug_id=d.id,
    updated_at=greatest(un.updated_at,now())
from public.drugs d
where un.entity_type='product'
  and un.entity_key=d.id::text;

create or replace function private.harden_user_favorite_drug_identity()
returns trigger
as $function$
declare
  v_drug record;
  v_pdid text;
  v_trade text;
  v_strength text;
  v_matches integer;
begin
  if new.entity_type='product' then
    if new.entity_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'Invalid canonical product favorite key' using errcode='23514';
    end if;

    select * into v_drug
    from public.drugs
    where id=new.entity_key::uuid;

    if not found then
      raise exception 'Canonical product favorite does not exist' using errcode='23503';
    end if;

    if new.deleted_at is null and (coalesce(v_drug.is_published,false)=false or coalesce(v_drug.editorial_status,'')<>'published') then
      raise exception 'Canonical product favorite is not active' using errcode='23514';
    end if;

    new.drug_id:=v_drug.id;
    if new.deleted_at is null then
      new.payload:=coalesce(new.payload,'{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
        'drugId',v_drug.id::text,
        'tradeName',v_drug.trade_name,
        'label',v_drug.trade_name,
        'registryNumber',v_drug.registry_number,
        'pdid',v_drug.pdid,
        'activeSubstance',v_drug.active_substance,
        'strength',v_drug.strength,
        'form',v_drug.pharmaceutical_form,
        'atc',v_drug.atc_code
      ));
    end if;
    return new;
  end if;

  if new.entity_type='drug' then
    if new.drug_id is null then
      v_pdid:=split_part(new.entity_key,'|',1);
      v_trade:=split_part(new.entity_key,'|',2);
      v_strength:=split_part(new.entity_key,'|',3);

      select count(*), (array_agg(d.id order by d.id))[1] into v_matches,new.drug_id
      from public.drugs d
      where d.pdid=v_pdid
        and lower(trim(d.trade_name))=lower(trim(v_trade))
        and lower(trim(d.strength))=lower(trim(v_strength));
    else
      v_matches:=1;
    end if;

    if new.deleted_at is null and (coalesce(v_matches,0)<>1 or new.drug_id is null) then
      raise exception 'Legacy drug favorite cannot be resolved uniquely' using errcode='23514';
    end if;

    if new.drug_id is not null then
      select * into v_drug from public.drugs where id=new.drug_id;
      if not found then
        raise exception 'Legacy drug favorite canonical product does not exist' using errcode='23503';
      end if;
      if new.deleted_at is null and (coalesce(v_drug.is_published,false)=false or coalesce(v_drug.editorial_status,'')<>'published') then
        raise exception 'Legacy drug favorite canonical product is not active' using errcode='23514';
      end if;
      if new.deleted_at is null then
        new.payload:=coalesce(new.payload,'{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
          'drugId',v_drug.id::text,
          'tradeName',v_drug.trade_name,
          'label',v_drug.trade_name,
          'registryNumber',v_drug.registry_number,
          'pdid',v_drug.pdid,
          'activeSubstance',v_drug.active_substance,
          'strength',v_drug.strength,
          'form',v_drug.pharmaceutical_form,
          'atc',v_drug.atc_code,
          'legacyEntityKey',new.entity_key
        ));
      end if;
    end if;
    return new;
  end if;

  new.drug_id:=null;
  return new;
end;
$function$
language plpgsql
security definer
set search_path = public, private, pg_temp;

drop trigger if exists trg_harden_user_favorite_drug_identity on public.user_favorites;
create trigger trg_harden_user_favorite_drug_identity
before insert or update of entity_type,entity_key,payload,deleted_at,drug_id
on public.user_favorites
for each row execute function private.harden_user_favorite_drug_identity();

create or replace function private.harden_user_note_drug_identity()
returns trigger
as $function$
declare
  v_drug record;
begin
  if new.entity_type='product' then
    if new.entity_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'Invalid canonical product note key' using errcode='23514';
    end if;
    select * into v_drug from public.drugs where id=new.entity_key::uuid;
    if not found then
      raise exception 'Canonical product note does not exist' using errcode='23503';
    end if;
    if new.deleted_at is null and (coalesce(v_drug.is_published,false)=false or coalesce(v_drug.editorial_status,'')<>'published') then
      raise exception 'Canonical product note is not active' using errcode='23514';
    end if;
    new.drug_id:=v_drug.id;
    return new;
  end if;

  if new.entity_type='drug' then
    if new.drug_id is null or new.entity_key<>new.drug_id::text then
      raise exception 'Drug note identity is incoherent' using errcode='23514';
    end if;
    return new;
  end if;

  if new.entity_type in ('substance','variant') then
    new.drug_id:=null;
  end if;
  return new;
end;
$function$
language plpgsql
security definer
set search_path = public, private, pg_temp;

drop trigger if exists trg_harden_user_note_drug_identity on public.user_notes;
create trigger trg_harden_user_note_drug_identity
before insert or update of entity_type,entity_key,deleted_at,drug_id
on public.user_notes
for each row execute function private.harden_user_note_drug_identity();

alter table public.user_favorites
  drop constraint if exists user_favorites_product_identity_check,
  drop constraint if exists user_favorites_live_drug_identity_check;

alter table public.user_favorites
  add constraint user_favorites_product_identity_check
  check (
    entity_type<>'product'
    or (drug_id is not null and entity_key=drug_id::text)
  ),
  add constraint user_favorites_live_drug_identity_check
  check (
    deleted_at is not null
    or entity_type not in ('product','drug')
    or drug_id is not null
  );

alter table public.user_notes
  drop constraint if exists user_notes_entity_coherence_check;

alter table public.user_notes
  add constraint user_notes_entity_coherence_check
  check (
    (entity_type='drug' and drug_id is not null and entity_key=drug_id::text)
    or
    (entity_type='product' and drug_id is not null and entity_key=drug_id::text)
    or
    (entity_type in ('substance','variant') and drug_id is null)
  );

create unique index if not exists user_favorites_user_live_drug_unique_idx
  on public.user_favorites(user_id,drug_id)
  where deleted_at is null
    and drug_id is not null
    and entity_type in ('product','drug');

create index if not exists user_favorites_user_drug_lookup_idx
  on public.user_favorites(user_id,drug_id,updated_at desc)
  where drug_id is not null;

create index if not exists user_notes_user_product_drug_idx
  on public.user_notes(user_id,drug_id,updated_at desc)
  where entity_type='product';

-- Fail the migration rather than silently keeping active unresolved rows.
do $$
begin
  if exists (
    select 1 from public.user_favorites
    where deleted_at is null
      and entity_type in ('product','drug')
      and drug_id is null
  ) then
    raise exception 'Active drug favorites remain unresolved after hardening';
  end if;

  if exists (
    select 1 from public.user_notes
    where entity_type='product'
      and drug_id is null
  ) then
    raise exception 'Product notes remain unresolved after hardening';
  end if;
end
$$;
