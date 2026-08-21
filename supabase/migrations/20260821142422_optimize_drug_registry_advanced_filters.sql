create index if not exists drugs_published_active_substance_trgm_idx
  on public.drugs using gin (active_substance extensions.gin_trgm_ops)
  where is_published = true and editorial_status = 'published';

create index if not exists drugs_published_use_text_trgm_idx
  on public.drugs using gin (use_text extensions.gin_trgm_ops)
  where is_published = true and editorial_status = 'published';

create index if not exists drugs_published_atc_trgm_idx
  on public.drugs using gin (atc_code extensions.gin_trgm_ops)
  where is_published = true and editorial_status = 'published';
