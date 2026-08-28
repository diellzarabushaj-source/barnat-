alter table public.lab_indications
  drop constraint if exists lab_indications_slug_format_check,
  add constraint lab_indications_slug_format_check
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  drop constraint if exists lab_indications_title_sq_nonempty_check,
  add constraint lab_indications_title_sq_nonempty_check
    check (btrim(title_sq) <> ''),
  drop constraint if exists lab_indications_catalog_gaps_array_check,
  add constraint lab_indications_catalog_gaps_array_check
    check (jsonb_typeof(catalog_gaps) = 'array'),
  drop constraint if exists lab_indications_sort_order_nonnegative_check,
  add constraint lab_indications_sort_order_nonnegative_check
    check (sort_order >= 0);

alter table public.lab_indication_tests
  drop constraint if exists lab_indication_tests_sort_order_nonnegative_check,
  add constraint lab_indication_tests_sort_order_nonnegative_check
    check (sort_order >= 0);
