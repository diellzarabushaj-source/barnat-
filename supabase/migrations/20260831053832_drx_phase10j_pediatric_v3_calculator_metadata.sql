create or replace function public.drx_pediatric_v3_calculator_metadata_v1(p_product_key text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_product_id uuid;
  v_product_key text;
begin
  if p_product_key is null
     or btrim(p_product_key) = ''
     or length(btrim(p_product_key)) > 180 then
    raise exception 'invalid_product_key' using errcode = '22023';
  end if;

  select p.product_id, p.product_key
    into v_product_id, v_product_key
  from public.dose_products_v3 p
  where p.product_key = btrim(p_product_key)
    and p.editorial_status = 'published'
    and nullif(btrim(p.verified_by), '') is not null
    and p.verified_at is not null
  limit 1;

  if v_product_id is null then
    return null;
  end if;

  return (
    with bound_rules as (
      select r.rule_id, r.source_snapshot_id
      from public.dose_rule_products_v3 b
      join public.dose_rules_v3 r
        on r.rule_id = b.rule_id
      where b.product_id = v_product_id
        and b.binding_status = 'verified'
        and nullif(btrim(b.verified_by), '') is not null
        and b.verified_at is not null
        and r.editorial_status = 'published'
        and nullif(btrim(r.verified_by), '') is not null
        and r.verified_at is not null
    ),
    verified_renal as (
      select a.*
      from public.dose_renal_adjustments_v3 a
      join bound_rules br on br.rule_id = a.rule_id
      where a.review_status = 'verified'
        and nullif(btrim(a.verified_by), '') is not null
        and a.verified_at is not null
    ),
    verified_hepatic as (
      select a.*
      from public.dose_hepatic_adjustments_v3 a
      join bound_rules br on br.rule_id = a.rule_id
      where a.review_status = 'verified'
        and nullif(btrim(a.verified_by), '') is not null
        and a.verified_at is not null
    ),
    source_ids as (
      select br.source_snapshot_id as snapshot_id
      from bound_rules br
      where br.source_snapshot_id is not null
      union
      select a.source_snapshot_id from verified_renal a where a.source_snapshot_id is not null
      union
      select a.source_snapshot_id from verified_hepatic a where a.source_snapshot_id is not null
    ),
    source_meta as (
      select
        s.snapshot_id,
        s.source_key,
        coalesce(nullif(btrim(s.final_url), ''), nullif(btrim(s.source_url), '')) as source_url,
        s.source_tier,
        s.document_version,
        s.document_date
      from public.dose_source_snapshots_v3 s
      join source_ids i on i.snapshot_id = s.snapshot_id
      where coalesce(nullif(btrim(s.final_url), ''), nullif(btrim(s.source_url), '')) ~* '^https://'
    )
    select jsonb_build_object(
      'metadataVersion','drx-pediatric-v3-calculator-metadata-v1',
      'productKey',v_product_key,
      'sources',coalesce((
        select jsonb_agg(jsonb_build_object(
          'snapshotId',s.snapshot_id,'sourceKey',s.source_key,'sourceUrl',s.source_url,
          'sourceTier',s.source_tier,'documentVersion',s.document_version,'documentDate',s.document_date
        ) order by s.snapshot_id)
        from source_meta s
      ),'[]'::jsonb),
      'renalAdjustments',coalesce((
        select jsonb_agg(jsonb_build_object(
          'adjustmentId',a.adjustment_id,'reviewStatus',a.review_status,
          'verifiedBy',a.verified_by,'verifiedAt',a.verified_at
        ) order by a.adjustment_id)
        from verified_renal a
      ),'[]'::jsonb),
      'hepaticAdjustments',coalesce((
        select jsonb_agg(jsonb_build_object(
          'adjustmentId',a.adjustment_id,'reviewStatus',a.review_status,
          'verifiedBy',a.verified_by,'verifiedAt',a.verified_at
        ) order by a.adjustment_id)
        from verified_hepatic a
      ),'[]'::jsonb)
    )
  );
end
$function$;

revoke all on function public.drx_pediatric_v3_calculator_metadata_v1(text)
  from public,anon,authenticated;
grant execute on function public.drx_pediatric_v3_calculator_metadata_v1(text)
  to service_role;

comment on function public.drx_pediatric_v3_calculator_metadata_v1(text) is
  'Phase 10J: service-role-only, product-scoped verified metadata for the pediatric V3 calculator. Does not expose V3 tables directly.';
