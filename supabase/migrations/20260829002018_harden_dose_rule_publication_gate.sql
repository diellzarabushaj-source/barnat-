-- Dozologjia — porta e publikimit për rregullat e dozës.
--
-- Runtime-i tashmë lexon vetëm rreshta `published`, prandaj asnjë rregull i
-- paplotë nuk arrin te mjeku sot. Ajo që mungonte ishte porta tjetër: asgjë
-- nuk e ndalonte një rregull të papërfunduar të kalonte NË `verified` ose
-- `published`. Këto kufizime e mbyllin atë kalim.
--
-- Të gjitha kontrollet e varura nga statusi lejojnë `draft`/`in_review` të
-- mbeten të paplota — puna redaksionale duhet të mund të fillojë pa i shpikur
-- vlerat klinike. Kufizimet pa kusht janë invariante që s'kanë kuptim të
-- shkelen në asnjë status.

-- Mënyra e frekuencës duhet ta mbajë vlerën që premton.
alter table public.dose_rules_v2
  add constraint dose_rules_v2_published_frequency_complete_check check (
    editorial_status not in ('verified', 'published')
    or (
      (frequency_mode <> 'interval' or interval_min_hours is not null)
      and (frequency_mode <> 'times_per_day' or times_per_day is not null)
    )
  );

-- Po ashtu mënyra e kohëzgjatjes.
alter table public.dose_rules_v2
  add constraint dose_rules_v2_published_duration_complete_check check (
    editorial_status not in ('verified', 'published')
    or (
      (duration_mode <> 'fixed_days' or duration_min_days is not null)
      and (duration_mode <> 'range_days' or (duration_min_days is not null and duration_max_days is not null))
      and (duration_mode <> 'review_after' or review_after_days is not null)
    )
  );

-- Një rregull «sipas nevojës» pa interval minimal dhe pa tavan ditor nuk ka
-- kufi mbidozimi. Nuk publikohet pa njërin nga të dy.
alter table public.dose_rules_v2
  add constraint dose_rules_v2_published_prn_ceiling_check check (
    editorial_status not in ('verified', 'published')
    or not (prn or frequency_mode = 'prn')
    or interval_min_hours is not null
    or max_doses_24h is not null
  );

-- Një dozë e vetme nuk mund ta kalojë tavanin e 24 orëve.
alter table public.dose_rules_v2
  add constraint dose_rules_v2_dose_ceiling_order_check check (
    max_single_dose_mg is null
    or max_daily_dose_mg is null
    or max_single_dose_mg <= max_daily_dose_mg
  );

-- As numri i dozave në ditë nuk mund ta kalojë tavanin e dozave në 24 orë.
alter table public.dose_rules_v2
  add constraint dose_rules_v2_daily_frequency_ceiling_check check (
    times_per_day is null
    or max_doses_24h is null
    or times_per_day <= max_doses_24h
  );

-- Një paralajmërim që bllokon duhet të thotë çfarë të bëhet më pas.
alter table public.dose_safety_v2
  add constraint dose_safety_v2_published_block_action_check check (
    editorial_status not in ('verified', 'published')
    or severity <> 'block'
    or (action_message is not null and btrim(action_message) <> '')
  );

-- Çelësi i huaj i kapitullit nuk kishte indeks mbulues; kaskada e `slug`
-- dhe `on delete set null` e skanonin tabelën.
create index if not exists user_prescriptions_chapter_key_idx
  on public.user_prescriptions (chapter_key);

comment on constraint dose_rules_v2_published_prn_ceiling_check on public.dose_rules_v2 is
  'Fail-closed: një rregull PRN i publikuar duhet të mbajë ose interval minimal ose tavan dozash në 24 orë.';
