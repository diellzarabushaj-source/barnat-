-- Synced from Supabase production migration history.
-- version: 20260827095121
-- name: seed_substance_merge_rejections

-- Çiftet që ngjajnë shumë me njëra-tjetrën por NUK janë e njëjta substancë.
-- Regjistrohen që asnjë raund i mëvonshëm bashkimi — as automatik, as me AI —
-- të mos i propozojë përsëri. Forca, valenca, kripa dhe përbërësit shtesë janë
-- dallime klinike, jo gabime shtypi.
insert into public.substance_merge_rejections (key_a, key_b, reason, decided_by, reviewed_at)
select least(a, b), greatest(a, b), reason, 'claude-review-2026-08-27', now()
from (values
  -- Valencë e ndryshme: vaksina të ndryshme, mbulim serotipesh i ndryshëm.
  ('pneumococcalpolysaccharideconjugatevaccine13valentadsorbed',
   'pneumococcalpolysaccharideconjugatevaccine20valentadsorbed',
   'valencë e ndryshme e vaksinës'),

  -- Forcë e ndryshme e së njëjtës substancë: doza është pjesë e identitetit.
  ('atorvastatincalciumequivalentto10mgatorvastatin',
   'atorvastatincalciumequivalentto40mgatorvastatin', 'forcë e ndryshme'),
  ('atorvastatincalciumequivalentto10mgatorvastatin',
   'atorvastatincalciumequivalentto80mgatorvastatin', 'forcë e ndryshme'),
  ('atorvastatincalciumequivalentto40mgatorvastatin',
   'atorvastatincalciumequivalentto80mgatorvastatin', 'forcë e ndryshme'),
  ('atorvastatincaliumequivalentto20mgatorvastatin',
   'atorvastatincalciumequivalentto10mgatorvastatin', 'forcë e ndryshme'),
  ('amoxicillintrihydrateequivalenttoamoxicillin500mg',
   'amoxicillintrihydrateequivalenttoamoxicillin1000mg', 'forcë e ndryshme'),
  ('amoxicillintrihydratecorrespondingto500mgofamoxicillin',
   'amoxicilintrihydrateciorrespondingto1000mgofamoxicillin', 'forcë e ndryshme'),
  ('rosuvastatincalciumequivalenttorosuvastatin1000mg',
   'rosuvastatincalciumequivalenttorosuvastatin2000mg', 'forcë e ndryshme'),
  ('rosuvastatininformof10396mgofrosuvastatincalcium',
   'rosuvastatininformof41583mgofrosuvastatincalcium', 'forcë e ndryshme'),
  ('imatinibmesylateformlequivalentto10000mgofimatinib',
   'imatinibmesylateformlequivalentto40000mgofimatinib', 'forcë e ndryshme'),

  -- Kripë e ndryshme: fosfat ≠ hidroklorid, ndryshon pesha molekulare dhe
  -- ekuivalenca e dozës.
  ('sitagliptinphosphatemonohydrate', 'sitagliptinhydrochloridemonohydrate',
   'kripë e ndryshme'),
  ('sitagliptinphosphatemonohydratemetforminhydrochloride',
   'sitagliptinhydrochloridemonohydratemetforminhydrochloride',
   'kripë e ndryshme'),
  ('hydrocortisone', 'hydrocortisoneacetate', 'estër i ndryshëm'),
  ('hydrocortisoneoxytetracyclinehydrochloride',
   'hydrocortisoneacetateoxytetracyclinehydrochloride', 'estër i ndryshëm'),

  -- Rrugë e ndryshme e administrimit: IVIg dhe SCIg nuk zëvendësohen mes vetes.
  ('humannormalimmunoglobulin', 'humannormalimmunoglobulinivig',
   'rrugë e ndryshme administrimi'),
  ('humannormalimmunoglobulin', 'humannormalimmunoglobulinscig',
   'rrugë e ndryshme administrimi'),
  ('humannormalimmunoglobulinivig', 'humannormalimmunoglobulinscig',
   'rrugë e ndryshme administrimi'),

  -- Përbërës shtesë: kombinim tjetër, indikacion tjetër.
  ('perindopriltertbutylamineamlodipinebesilate',
   'perindopriltertbutylamineamlodipinebesilateindapamide',
   'përbërës shtesë në kombinim'),
  ('perindopriltertbutylamine', 'perindopriltertbutylamineindapamide',
   'përbërës shtesë në kombinim'),
  ('amoxicillintrihydrate', 'amoxicillintrihydrateclavulanicacid',
   'përbërës shtesë në kombinim'),
  ('rosuvastatincalcium', 'rosuvastatincalciumezetimibe',
   'përbërës shtesë në kombinim'),
  ('atorvastatin', 'atorvastatinandezetimibe',
   'përbërës shtesë në kombinim'),

  -- Preparate homeopatike: potenca D dhe lista e përbërësve i dallojnë.
  ('araneusdiadematusd6calciumphosphoricumd12equisetumhiemaled4ferrumiodatumd12fumariaofficinalisd4gentianalutead5geraniumrobertianumd4juglansregiasspregiad3levothyroxinumd12myosotisarvensisd3nasturtiumofficinaled4natriumsulfuricumd4pinussylvestrisd4scrophularianodosad3smilaxd6teucriumscorodoniad3veronicaofficinalisd3',
   'araneusdiadematusd6calciumphosphoricumd12equisetumhiemaled4ferrumiodatumd12fumariaofficinalisd4gentianalutead5geraniumrobertianumd4levothyroxinumd12myosotisarvensisd3nasturtiumofficinaled4natriumsulfuricumd4pinussylvestrisd4scrophularianodosad3smilaxd6teucriumscorodoniad3veronicaofficinalisd3',
   'listë e ndryshme përbërësish'),
  ('achilleamillefoliumd3aconitumnapellusd3atropabelladonnad4heparsulfurisd8matricariarecutitad3mercuriussolubilishahnemannid8symphytumofficinaled8bellisperennisd2calendulaofficinalisd2echinacead2echinaceapurpuread2hamamelisvirginianad2hypericumperforatumd2arnicamontanad2',
   'achilleamillefoliumd3matricariarecutitad3symphytumofficinaled6aconitumnapellusd2atropabelladonnad2bellisperennisd2calendulaofficinalisd2echinacead2echinaceapurpuread2hypericumperforatumd2heparsulfurisd6aquosmercuriussolubilishahnemannid6aquoshamamelisvirginianad1arnicamontanad2',
   'potenca D të ndryshme')
) as t(a, b, reason)
on conflict (key_a, key_b) do nothing;
