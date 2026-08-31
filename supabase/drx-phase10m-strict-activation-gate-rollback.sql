-- Rollback is intentionally schema-only. If STRICT has ever been activated,
-- first use the audited Phase 10 rollback procedure to return runtime to SHADOW.
-- Never drop the activation function as a substitute for a runtime rollback.
drop function if exists public.drx_phase10_arm_strict_v1(jsonb);
