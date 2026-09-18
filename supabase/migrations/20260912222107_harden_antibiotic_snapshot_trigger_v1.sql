alter function public.prevent_antibiotic_snapshot_mutation_v1() security invoker;
revoke all on function public.prevent_antibiotic_snapshot_mutation_v1() from public, anon, authenticated;
