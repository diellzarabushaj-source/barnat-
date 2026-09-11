-- Keep supplement classification correct when product_status is written fully in Albanian.
-- Mirrors production migration applied on 2026-09-10.

create or replace view public.medindex_all_products_public_v4
with (security_invoker = true)
as
select
  v3.product_identity_id,
  v3.registry_number,
  v3.trade_name,
  v3.substance_concept_id,
  v3.active_substance,
  v3.strength,
  v3.pharmaceutical_form,
  v3.form_family,
  v3.release_type,
  v3.atc_code,
  v3.manufacturer,
  v3.marketing_authorization_holder,
  v3.packaging,
  v3.ma_certificate,
  v3.quality_status,
  v3.presentation_group_id,
  v3.route,
  v3.route_source,
  v3.source_scope,
  v3.audit_status,
  v3.audited_at,
  v3.product_type,
  v3.category_code,
  v3.category_name,
  case
    when v3.source_scope = 'LOCAL_REGISTRY_PRODUCT' then 'LOCAL_MEDICINE'
    when v3.source_scope in ('REFERENCE_ONLY','EDITORIAL_UNVERIFIED') then 'REFERENCE_MEDICINE'
    else 'NON_ATC_PRODUCT'
  end as product_class,
  case
    when v3.source_scope = 'LOCAL_REGISTRY_PRODUCT' then 'Bar i regjistruar'
    when v3.source_scope in ('REFERENCE_ONLY','EDITORIAL_UNVERIFIED') then 'Bar referencë'
    else 'Pa ATC / Suplement'
  end as product_class_label,
  case
    when v3.source_scope = 'EXCLUDED_NON_MEDICINE'
      and (
        lower(coalesce(d.product_status,'')) like '%supplement%'
        or lower(coalesce(d.product_status,'')) like '%suplement%'
      ) then 'SUPPLEMENT'
    when v3.source_scope = 'EXCLUDED_NON_MEDICINE' then 'OTHER_NON_ATC'
    else null
  end as non_atc_subtype,
  case
    when v3.source_scope = 'EXCLUDED_NON_MEDICINE'
      and (
        lower(coalesce(d.product_status,'')) like '%supplement%'
        or lower(coalesce(d.product_status,'')) like '%suplement%'
      ) then 'Suplement ushqimor'
    when v3.source_scope = 'EXCLUDED_NON_MEDICINE' then 'Produkt tjetër pa ATC'
    else null
  end as non_atc_subtype_label,
  v3.atc_code is not null and btrim(v3.atc_code) <> '' and upper(btrim(v3.atc_code)) <> 'N/A' as has_atc,
  v3.source_scope = 'LOCAL_REGISTRY_PRODUCT' as is_local_registry,
  v3.source_scope in ('REFERENCE_ONLY','EDITORIAL_UNVERIFIED') as is_reference,
  v3.source_scope = 'EXCLUDED_NON_MEDICINE' as is_non_atc,
  case
    when p.quality_status = 'SOURCE_GAP' then 'SOURCE_GAP'
    when v3.source_scope = 'EXCLUDED_NON_MEDICINE' then 'NON_ATC'
    when v3.source_scope in ('REFERENCE_ONLY','EDITORIAL_UNVERIFIED') then 'REFERENCE'
    else 'COMPLETE'
  end as metadata_status,
  case
    when v3.source_scope = 'LOCAL_REGISTRY_PRODUCT' then 'Publikuar — regjistër lokal'
    when v3.source_scope in ('REFERENCE_ONLY','EDITORIAL_UNVERIFIED') then 'Publikuar — referencë'
    else 'Publikuar — pa ATC'
  end as publication_label,
  p.active_substance_original as active_substance_raw,
  p.source_gap_codes
from public.medindex_all_products_public_v3 v3
join public.medindex_drug_products_v1 p on p.product_identity_id = v3.product_identity_id
join public.drugs d on d.id = p.display_source_drug_id;

update public.drugs
set product_status = 'Suplement ushqimor — jashtë regjistrit të barnave',
    updated_at = now()
where upper(trade_name) in ('LACTIS B COMPLEX','LACTIS B-COMPLEX FLACON A8');
