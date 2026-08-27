-- Synced from Supabase production migration history.
-- version: 20260827221219
-- name: p1_exit_revoke_inert_view_write_grants

-- Këto tri janë pamje jo të shkruajtshme: `information_schema.views` i raporton
-- të treja me is_insertable_into=NO dhe is_updatable=NO, pra grantet nuk hapin
-- asgjë. Hiqen që kontrolli i privilegjeve të kthejë zero mbi krejt sipërfaqen
-- e kuruar, jo zero-me-përjashtime.
revoke insert, update, delete, truncate, references, trigger
  on public.substance_canonical,
     public.active_substances,
     public.medindex_product_ingredient_sets_v1
  from anon, authenticated;

do $$
declare n bigint;
begin
  select count(*) into n
  from information_schema.role_table_grants
  where table_schema='public'
    and grantee in ('anon','authenticated')
    and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')
    and (table_name like 'substance%'
      or table_name like 'product_ingredient%'
      or table_name like 'medindex%'
      or table_name in ('drugs','active_substances'));
  if n <> 0 then
    raise exception 'P1 exit: % public write grants remain on the curated surface',n;
  end if;
end $$;
