-- Rollback Phase 8Y clinical provenance refresh helper.
-- The migration itself only creates the helper; it does not delete provenance.

drop function if exists public.drx_phase8_refresh_pilot_clinical_provenance_v1();
