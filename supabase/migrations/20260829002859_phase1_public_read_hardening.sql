-- Synced from Supabase production migration history.
-- version: 20260829002859
-- name: phase1_public_read_hardening

-- Runtime public medical reads use the publishable key; private/admin writes use the server secret.

drop policy if exists medical_content_read on public.drugs;
create policy medical_content_read
on public.drugs
for select
to anon, authenticated
using (
  is_published = true
  and editorial_status = 'published'
);

drop policy if exists medical_content_read on public.dosage_regimens;
create policy medical_content_read
on public.dosage_regimens
for select
to anon, authenticated
using (
  editorial_status = 'published'
);

drop policy if exists medical_content_read on public.drug_clinical_profiles;
create policy medical_content_read
on public.drug_clinical_profiles
for select
to anon, authenticated
using (
  verification_status = 'verified'
);

revoke insert, update, delete, truncate, references, trigger
on table public.lab_indications, public.lab_indication_tests
from anon, authenticated;

revoke insert, update, delete, truncate, references, trigger
on table public.prescription_chapters
from anon, authenticated;

revoke select on table public.prescription_chapters from anon;

revoke execute on function private.handle_new_auth_user() from public, anon, authenticated;
revoke execute on function private.set_updated_at() from public, anon, authenticated;
