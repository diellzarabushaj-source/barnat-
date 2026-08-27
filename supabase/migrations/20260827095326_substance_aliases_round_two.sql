-- Synced from Supabase production migration history.
-- version: 20260827095326
-- name: substance_aliases_round_two

-- Raundi i dytë: variante që dalin vetëm kur emrat lexohen si kuptim, jo si
-- vargje shkronjash. Ngjashmëria trigram nuk i kap — rendi i fjalëve i largon
-- (`Normal human` vs `Human normal`), ose sinonimi është krejt fjalë tjetër
-- (`erbumine` = `tert-butylamine`).
insert into public.substance_aliases (variant_key, canonical_key, canonical_name, reason, decided_by, reviewed_at)
values
  ('normalhumanimmunoglobulinivlg', 'humannormalimmunoglobulinivig', '',
   'rend i fjalëve + IVIg lexuar gabim si IVlg', 'claude-review-2026-08-27', now()),
  ('humanantidimmunoglobulin', 'humanantidrhimmunoglobulin', '',
   'anti-D = anti-D (Rh)', 'claude-review-2026-08-27', now()),
  ('perindoprilerbumineindapamide', 'perindopriltertbutylamineindapamide', '',
   'erbumine = tert-butylamine', 'claude-review-2026-08-27', now()),
  ('amoxicilline', 'amoxicillin', '',
   'mbaresë e ndryshme', 'claude-review-2026-08-27', now()),
  ('amoxicillinclavulantepotassium71', 'amoxicillinandclavulantepotassium71', '',
   'e njëjta formë, shprehur ndryshe', 'claude-review-2026-08-27', now()),
  ('rosuvastatinaca', 'rosuvastatincalcium', '',
   'rosuvastatina Ca = rosuvastatin calcium', 'claude-review-2026-08-27', now())
on conflict (variant_key) do nothing;
