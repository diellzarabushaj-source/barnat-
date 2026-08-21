create extension if not exists pg_trgm with schema extensions;

alter table public.drugs
  add column if not exists registry_search_text text
  generated always as (
    coalesce(trade_name, '') || ' ' ||
    coalesce(active_substance, '') || ' ' ||
    coalesce(atc_code, '') || ' ' ||
    coalesce(drug_class, '') || ' ' ||
    coalesce(use_text, '') || ' ' ||
    coalesce(strength, '') || ' ' ||
    coalesce(pharmaceutical_form, '') || ' ' ||
    coalesce(pdid, '') || ' ' ||
    coalesce(protocol_no, '')
  ) stored;

create index if not exists drugs_published_registry_search_trgm_idx
  on public.drugs using gin (registry_search_text extensions.gin_trgm_ops)
  where is_published = true and editorial_status = 'published';

create index if not exists drugs_published_trade_name_registry_idx
  on public.drugs (trade_name, registry_number)
  where is_published = true and editorial_status = 'published';

create index if not exists drugs_published_active_substance_registry_idx
  on public.drugs (active_substance, registry_number)
  where is_published = true and editorial_status = 'published';

create index if not exists drugs_published_atc_registry_idx
  on public.drugs (atc_code, registry_number)
  where is_published = true and editorial_status = 'published';

create index if not exists drugs_published_strength_registry_idx
  on public.drugs (strength, registry_number)
  where is_published = true and editorial_status = 'published';

create index if not exists drugs_published_form_registry_idx
  on public.drugs (pharmaceutical_form, registry_number)
  where is_published = true and editorial_status = 'published';

create index if not exists drugs_published_status_registry_idx
  on public.drugs (product_status, registry_number)
  where is_published = true and editorial_status = 'published';

create index if not exists drugs_published_retail_price_registry_idx
  on public.drugs (retail_price, registry_number)
  where is_published = true and editorial_status = 'published';
