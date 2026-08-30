-- Roll back only the two Phase 8N evidence-review decisions.
-- Source captures remain immutable and are not deleted.

update drx_dose.exact_market_product_source_bindings_v1
set binding_status='REVIEW',
    reviewed_by=null,
    reviewed_at=null,
    review_note=null
where drug_id in (
  'c8cd0467-da73-479c-b8e8-b785af833f59'::uuid,
  '84a1cf4a-6568-41d7-8d13-0f2b7715acae'::uuid
)
and binding_status='VERIFIED'
and reviewed_by='phase8-explicit-evidence-review';
