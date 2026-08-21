alter table public.drugs
  add column if not exists global_search_text text
  generated always as (
    coalesce(trade_name, '') || ' ' ||
    coalesce(active_substance, '') || ' ' ||
    coalesce(atc_code, '') || ' ' ||
    coalesce(drug_class, '') || ' ' ||
    coalesce(use_text, '') || ' ' ||
    coalesce(strength, '') || ' ' ||
    coalesce(pharmaceutical_form, '') || ' ' ||
    coalesce(packaging, '')
  ) stored;

create index if not exists drugs_published_global_search_trgm_idx
  on public.drugs using gin (global_search_text extensions.gin_trgm_ops)
  where is_published = true and editorial_status = 'published';
