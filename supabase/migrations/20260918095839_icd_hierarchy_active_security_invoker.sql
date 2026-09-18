-- Match the production migration that hardens the active ICD hierarchy view.
-- Views must use caller permissions so underlying RLS/grants remain authoritative.

alter view public.icd_hierarchy_active set (security_invoker = true);
